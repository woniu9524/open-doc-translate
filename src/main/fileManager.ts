import { promises as fs } from 'fs'
import { join, relative, extname, basename, dirname } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface FileItem {
  name: string
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  children?: FileItem[]
  lastHash?: string
}

export interface FileStatus {
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  lastHash?: string
}

export class FileManager {
  private statusCache: Map<string, FileStatus> = new Map()
  private statusFilePath: string = ''

  constructor() {}

  private getStatusFilePath(projectPath: string): string {
    return join(projectPath, '.opendoc.json')
  }

  // 加载文件状态缓存
  private async loadStatusCache(projectPath: string): Promise<void> {
    this.statusFilePath = this.getStatusFilePath(projectPath)
    try {
      const statusData = await fs.readFile(this.statusFilePath, 'utf-8')
      const statusObj = JSON.parse(statusData)
      this.statusCache.clear()
      Object.entries(statusObj).forEach(([path, status]) => {
        this.statusCache.set(path, status as FileStatus)
      })
    } catch (error) {
      console.log('状态文件不存在或损坏，使用空缓存')
      this.statusCache.clear()
    }
  }

  // 保存文件状态缓存
  private async saveStatusCache(): Promise<void> {
    if (!this.statusFilePath) return
    
    const statusObj: Record<string, FileStatus> = {}
    this.statusCache.forEach((status, path) => {
      statusObj[path] = status
    })
    
    try {
      await fs.writeFile(this.statusFilePath, JSON.stringify(statusObj, null, 2), 'utf-8')
    } catch (error) {
      console.error('保存状态文件失败:', error)
    }
  }

  // 获取文件的Git commit hash
  private async getFileHash(projectPath: string, filePath: string, branch: string): Promise<string | null> {
    try {
      // 将 Windows 路径分隔符转换为 Unix 风格的正斜杠，以兼容 Git 命令
      const normalizedPath = filePath.replace(/\\/g, '/')
      const { stdout } = await execAsync(
        `git log -1 --format="%H" ${branch} -- "${normalizedPath}"`,
        { cwd: projectPath }
      )
      return stdout.trim() || null
    } catch (error) {
      console.error(`获取文件 ${filePath} 的hash失败:`, error)
      return null
    }
  }

  // 检查文件是否在工作分支中被修改
  private async isFileModified(projectPath: string, filePath: string, workingBranch: string): Promise<boolean> {
    try {
      // 将 Windows 路径分隔符转换为 Unix 风格的正斜杠，以兼容 Git 命令
      const normalizedPath = filePath.replace(/\\/g, '/')
      const { stdout } = await execAsync(
        `git status --porcelain "${normalizedPath}"`,
        { cwd: projectPath }
      )
      return stdout.trim().length > 0
    } catch (error) {
      console.error(`检查文件 ${filePath} 修改状态失败:`, error)
      return false
    }
  }

  // 检查文件是否存在于工作分支
  private async fileExistsInBranch(projectPath: string, filePath: string, branch: string): Promise<boolean> {
    try {
      // 将 Windows 路径分隔符转换为 Unix 风格的正斜杠，以兼容 Git 命令
      const normalizedPath = filePath.replace(/\\/g, '/')
      await execAsync(`git cat-file -e ${branch}:"${normalizedPath}"`, { cwd: projectPath })
      return true
    } catch (error) {
      return false
    }
  }

  // 检查本地文件是否存在
  private async fileExistsLocally(projectPath: string, filePath: string): Promise<boolean> {
    try {
      await fs.access(join(projectPath, filePath))
      return true
    } catch (error) {
      return false
    }
  }

  // 获取单个文件的状态
  async getFileStatus(
    projectPath: string,
    filePath: string,
    upstreamBranch: string,
    workingBranch: string
  ): Promise<FileStatus> {
    const cacheKey = `${projectPath}:${filePath}`
    
    // 检查缓存
    if (this.statusCache.has(cacheKey)) {
      const cached = this.statusCache.get(cacheKey)!
      // 检查是否需要更新修改状态
      cached.modified = await this.isFileModified(projectPath, filePath, workingBranch)
      return cached
    }

    // 计算文件状态
    const status = await this.calculateFileStatus(projectPath, filePath, upstreamBranch, workingBranch)
    
    // 缓存结果
    this.statusCache.set(cacheKey, status)
    
    return status
  }

  // 计算文件状态
  private async calculateFileStatus(
    projectPath: string,
    filePath: string,
    upstreamBranch: string,
    workingBranch: string
  ): Promise<FileStatus> {
    const upstreamExists = await this.fileExistsInBranch(projectPath, filePath, `upstream/${upstreamBranch}`)
    const localExists = await this.fileExistsLocally(projectPath, filePath)
    const workingExists = await this.fileExistsInBranch(projectPath, filePath, workingBranch)
    const modified = await this.isFileModified(projectPath, filePath, workingBranch)

    let status: 'translated' | 'outdated' | 'untranslated' = 'untranslated'
    let lastHash: string | undefined = undefined

    if (upstreamExists) {
      const upstreamHash = await this.getFileHash(projectPath, filePath, `upstream/${upstreamBranch}`)
      lastHash = upstreamHash || undefined

      if (localExists || workingExists) {
        // 获取本地文件对应的上游hash（从缓存或重新计算）
        const cachedStatus = this.statusCache.get(`${projectPath}:${filePath}`)
        const lastKnownHash = cachedStatus?.lastHash

        if (lastKnownHash && lastKnownHash === upstreamHash) {
          status = 'translated'
        } else if (lastKnownHash && lastKnownHash !== upstreamHash) {
          status = 'outdated'
        } else {
          // 首次检测，假设如果本地存在则为已翻译
          status = 'translated'
        }
      } else {
        status = 'untranslated'
      }
    }

    return {
      path: filePath,
      status,
      modified,
      lastHash
    }
  }

  // 扫描目录获取文件列表
  private async scanDirectory(
    projectPath: string,
    dirPath: string,
    fileTypes: string[],
    relativePath: string = ''
  ): Promise<string[]> {
    const files: string[] = []
    const fullPath = join(projectPath, dirPath)

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name)
        const relativeEntryPath = relativePath ? join(relativePath, entry.name) : entry.name

        if (entry.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await this.scanDirectory(projectPath, entryPath, fileTypes, relativeEntryPath)
          files.push(...subFiles)
        } else if (entry.isFile()) {
          // 检查文件类型
          const ext = extname(entry.name)
          if (fileTypes.includes(ext)) {
            files.push(entryPath)
          }
        }
      }
    } catch (error) {
      console.error(`扫描目录 ${dirPath} 失败:`, error)
    }

    return files
  }

  // 构建文件树结构
  private buildFileTree(files: string[], statusMap: Map<string, FileStatus>): FileItem[] {
    const tree: FileItem[] = []
    const pathMap = new Map<string, FileItem>()

    // 按路径深度排序
    files.sort((a, b) => a.split('/').length - b.split('/').length)

    for (const filePath of files) {
      const parts = filePath.split('/')
      const fileName = parts[parts.length - 1]
      const status = statusMap.get(filePath)

      const fileItem: FileItem = {
        name: fileName,
        path: filePath,
        status: status?.status || 'untranslated',
        modified: status?.modified || false,
        lastHash: status?.lastHash
      }

      if (parts.length === 1) {
        // 根目录文件
        tree.push(fileItem)
        pathMap.set(filePath, fileItem)
      } else {
        // 子目录文件
        const parentPath = parts.slice(0, -1).join('/')
        let parent = pathMap.get(parentPath)

        if (!parent) {
          // 创建父目录
          parent = {
            name: basename(parentPath),
            path: parentPath,
            status: 'untranslated',
            children: []
          }
          
          // 递归创建父目录结构
          const grandParentPath = dirname(parentPath)
          if (grandParentPath && grandParentPath !== '.') {
            let grandParent = pathMap.get(grandParentPath)
            if (!grandParent) {
              grandParent = {
                name: basename(grandParentPath),
                path: grandParentPath,
                status: 'untranslated',
                children: []
              }
              pathMap.set(grandParentPath, grandParent)
              tree.push(grandParent)
            }
            grandParent.children = grandParent.children || []
            grandParent.children.push(parent)
          } else {
            tree.push(parent)
          }
          
          pathMap.set(parentPath, parent)
        }

        parent.children = parent.children || []
        parent.children.push(fileItem)
        pathMap.set(filePath, fileItem)
      }
    }

    return tree
  }

  // 获取文件树
  async getFileTree(
    projectPath: string,
    watchDirectories: string[],
    fileTypes: string[],
    upstreamBranch: string,
    workingBranch: string
  ): Promise<FileItem[]> {
    await this.loadStatusCache(projectPath)

    // 扫描所有监听目录
    const allFiles: string[] = []
    for (const dir of watchDirectories) {
      const files = await this.scanDirectory(projectPath, dir, fileTypes)
      allFiles.push(...files)
    }

    // 获取所有文件状态
    const statusMap = new Map<string, FileStatus>()
    for (const filePath of allFiles) {
      const status = await this.getFileStatus(projectPath, filePath, upstreamBranch, workingBranch)
      statusMap.set(filePath, status)
    }

    // 构建文件树
    const tree = this.buildFileTree(allFiles, statusMap)

    // 保存状态缓存
    await this.saveStatusCache()

    return tree
  }

  // 同步文件状态（用于刷新）
  async syncFileStatuses(
    projectPath: string,
    watchDirectories: string[],
    fileTypes: string[],
    upstreamBranch: string,
    workingBranch: string
  ): Promise<void> {
    // 清空缓存，强制重新计算
    this.statusCache.clear()
    
    // 重新获取文件树（会自动计算状态）
    await this.getFileTree(projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch)
  }

  // 读取文件内容
  async readFileContent(
    projectPath: string,
    filePath: string,
    branch?: string
  ): Promise<string> {
    try {
      if (branch) {
        // 从指定分支读取文件
        // 将 Windows 路径分隔符转换为 Unix 风格的正斜杠，以兼容 Git 命令
        const normalizedPath = filePath.replace(/\\/g, '/')
        const { stdout } = await execAsync(`git show ${branch}:"${normalizedPath}"`, { cwd: projectPath })
        return stdout
      } else {
        // 从本地文件系统读取文件
        const fullPath = join(projectPath, filePath)
        return await fs.readFile(fullPath, 'utf-8')
      }
    } catch (error) {
      console.error(`读取文件 ${filePath} 失败:`, error)
      throw new Error(`无法读取文件: ${filePath}`)
    }
  }

  // 获取文件的完整内容信息
  async getFileContent(
    projectPath: string,
    filePath: string,
    upstreamBranch: string,
    workingBranch: string
  ): Promise<{
    original: string
    translated: string
    status: 'translated' | 'outdated' | 'untranslated'
    hasChanges?: boolean
  }> {
    try {
      // 获取文件状态
      const fileStatus = await this.getFileStatus(projectPath, filePath, upstreamBranch, workingBranch)
      
      // 读取上游分支的原文
      let original = ''
      try {
        original = await this.readFileContent(projectPath, filePath, `upstream/${upstreamBranch}`)
      } catch (error) {
        console.error('读取上游分支文件失败:', error)
        original = '无法读取上游分支的文件内容'
      }

      // 读取工作分支的翻译文件
      let translated = ''
      try {
        // 首先尝试从工作分支读取
        translated = await this.readFileContent(projectPath, filePath, workingBranch)
      } catch (error) {
        // 如果工作分支不存在该文件，尝试从本地文件系统读取
        try {
          translated = await this.readFileContent(projectPath, filePath)
        } catch (localError) {
          console.log('工作分支和本地都没有翻译文件，这是正常的未翻译状态')
          translated = ''
        }
      }

      return {
        original,
        translated,
        status: fileStatus.status,
        hasChanges: fileStatus.modified
      }
    } catch (error) {
      console.error(`获取文件内容失败:`, error)
      throw error
    }
  }

  // 保存文件内容
  async saveFileContent(
    projectPath: string,
    filePath: string,
    content: string
  ): Promise<void> {
    try {
      const fullPath = join(projectPath, filePath)
      const dirPath = dirname(fullPath)
      
      // 确保目录存在
      await fs.mkdir(dirPath, { recursive: true })
      
      // 写入文件
      await fs.writeFile(fullPath, content, 'utf-8')
      
      console.log(`文件 ${filePath} 保存成功`)
    } catch (error) {
      console.error(`保存文件 ${filePath} 失败:`, error)
      throw new Error(`保存文件失败: ${filePath}`)
    }
  }
} 