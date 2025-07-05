import { promises as fs } from 'fs'
import { join, relative, extname, basename, dirname } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { LLMService } from './llmService'
import { ConfigManager } from './config'

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
  private llmService: LLMService

  constructor(configManager: ConfigManager) {
    this.llmService = new LLMService(configManager)
  }

  private getStatusFilePath(projectPath: string, workingBranch: string): string {
    return join(projectPath, `.opendoc-${workingBranch}.json`)
  }

  // 加载文件状态缓存
  private async loadStatusCache(projectPath: string, workingBranch: string): Promise<void> {
    this.statusFilePath = this.getStatusFilePath(projectPath, workingBranch)
    try {
      const statusData = await fs.readFile(this.statusFilePath, 'utf-8')
      const statusObj = JSON.parse(statusData)
      this.statusCache.clear()
      Object.entries(statusObj).forEach(([path, status]) => {
        // 重新构建缓存key，包含工作分支信息
        const cacheKey = `${projectPath}:${workingBranch}:${path}`
        this.statusCache.set(cacheKey, status as FileStatus)
      })
    } catch (error) {
      console.log(`分支 ${workingBranch} 的状态文件不存在或损坏，使用空缓存`)
      this.statusCache.clear()
    }
  }

  // 保存文件状态缓存
  private async saveStatusCache(projectPath: string, workingBranch: string): Promise<void> {
    if (!this.statusFilePath) return
    
    const statusObj: Record<string, FileStatus> = {}
    const branchPrefix = `${projectPath}:${workingBranch}:`
    
    // 只保存当前分支的已翻译或过时的文件状态
    this.statusCache.forEach((status, cacheKey) => {
      if (cacheKey.startsWith(branchPrefix)) {
        // 只保存已翻译或过时的文件，未翻译的文件不保存
        if (status.status === 'translated' || status.status === 'outdated') {
          // 提取出文件路径（去掉前缀）
          const filePath = cacheKey.substring(branchPrefix.length)
          statusObj[filePath] = status
        }
      }
    })
    
    // 如果没有需要保存的状态，删除状态文件
    if (Object.keys(statusObj).length === 0) {
      try {
        await fs.unlink(this.statusFilePath)
        console.log(`删除空状态文件: ${this.statusFilePath}`)
      } catch (error) {
        // 文件不存在是正常的，不需要报错
      }
      return
    }
    
    try {
      await fs.writeFile(this.statusFilePath, JSON.stringify(statusObj, null, 2), 'utf-8')
      console.log(`保存状态文件: ${this.statusFilePath}，包含 ${Object.keys(statusObj).length} 个文件`)
    } catch (error) {
      console.error(`保存分支 ${workingBranch} 的状态文件失败:`, error)
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
    const cacheKey = `${projectPath}:${workingBranch}:${filePath}`
    
    // 检查缓存
    if (this.statusCache.has(cacheKey)) {
      const cached = this.statusCache.get(cacheKey)!
      // 检查是否需要更新修改状态
      cached.modified = await this.isFileModified(projectPath, filePath, workingBranch)
      return cached
    }

    // 计算文件状态
    const status = await this.calculateFileStatus(projectPath, filePath, upstreamBranch, workingBranch)
    
    // 只有已翻译或过时的文件才缓存，未翻译的文件不缓存
    if (status.status === 'translated' || status.status === 'outdated') {
      this.statusCache.set(cacheKey, status)
    }
    
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
    const modified = await this.isFileModified(projectPath, filePath, workingBranch)

    let status: 'translated' | 'outdated' | 'untranslated' = 'untranslated'
    let lastHash: string | undefined = undefined

    if (upstreamExists) {
      // 检查是否有翻译记录
      const cacheKey = `${projectPath}:${workingBranch}:${filePath}`
      const cachedStatus = this.statusCache.get(cacheKey)
      
      if (cachedStatus?.lastHash) {
        // 有翻译记录，检查是否过时
        const upstreamHash = await this.getFileHash(projectPath, filePath, `upstream/${upstreamBranch}`)
        
        if (upstreamHash && cachedStatus.lastHash === upstreamHash) {
          status = 'translated'
          lastHash = upstreamHash
        } else {
          status = 'outdated'
          lastHash = cachedStatus.lastHash // 保留原来的hash记录
        }
      } else {
        // 没有翻译记录，标记为未翻译
        status = 'untranslated'
        // 未翻译时不记录hash
        lastHash = undefined
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
    console.log(`开始加载文件树 (分支: ${workingBranch})...`)
    const startTime = Date.now()
    
    await this.loadStatusCache(projectPath, workingBranch)

    // 扫描所有监听目录
    const allFiles: string[] = []
    for (const dir of watchDirectories) {
      const files = await this.scanDirectory(projectPath, dir, fileTypes)
      allFiles.push(...files)
    }

    console.log(`扫描到 ${allFiles.length} 个文件`)

    // 获取所有文件状态
    const statusMap = new Map<string, FileStatus>()
    let hasTranslatedFiles = false
    
    for (const filePath of allFiles) {
      const status = await this.getFileStatus(projectPath, filePath, upstreamBranch, workingBranch)
      statusMap.set(filePath, status)
      
      // 只有已翻译或过时的文件才需要保存到状态文件
      if (status.status === 'translated' || status.status === 'outdated') {
        hasTranslatedFiles = true
      }
    }

    // 构建文件树
    const tree = this.buildFileTree(allFiles, statusMap)

    // 只有存在已翻译的文件时才保存状态缓存
    if (hasTranslatedFiles) {
      await this.saveStatusCache(projectPath, workingBranch)
    }

    const endTime = Date.now()
    console.log(`文件树加载完成，耗时: ${endTime - startTime}ms`)

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
    // 清空当前分支的缓存，强制重新计算
    const branchPrefix = `${projectPath}:${workingBranch}:`
    const keysToDelete = Array.from(this.statusCache.keys()).filter(key => key.startsWith(branchPrefix))
    keysToDelete.forEach(key => this.statusCache.delete(key))
    
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

      // 读取工作分支的翻译文件 - 直接从本地文件系统读取
      let translated = ''
      try {
        // 直接从本地文件系统读取译文，因为切换分支时已经切换到工作分支
        // 这样可以读取到未提交的修改
        translated = await this.readFileContent(projectPath, filePath)
      } catch (error) {
        console.log('本地没有翻译文件，这是正常的未翻译状态')
        translated = ''
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

  // 翻译文件
  async translateFile(
    projectPath: string,
    filePath: string,
    upstreamBranch: string,
    workingBranch: string
  ): Promise<void> {
    try {
      // 获取文件内容
      const fileContent = await this.getFileContent(projectPath, filePath, upstreamBranch, workingBranch)
      
      if (!fileContent.original) {
        throw new Error('无法获取原文内容')
      }

      // 调用 LLM 翻译
      const translatedContent = await this.callLLMTranslation(fileContent.original, projectPath)
      
      // 保存翻译结果
      await this.saveFileContent(projectPath, filePath, translatedContent)
      
      // 更新文件状态缓存
      const upstreamHash = await this.getFileHash(projectPath, filePath, `upstream/${upstreamBranch}`)
      if (upstreamHash) {
        const cacheKey = `${projectPath}:${workingBranch}:${filePath}`
        this.statusCache.set(cacheKey, {
          path: filePath,
          status: 'translated',
          modified: false,
          lastHash: upstreamHash
        })
        await this.saveStatusCache(projectPath, workingBranch)
      }
      
      console.log(`文件 ${filePath} 翻译完成`)
    } catch (error) {
      console.error(`翻译文件 ${filePath} 失败:`, error)
      throw new Error(`翻译文件失败: ${filePath} - ${(error as Error).message}`)
    }
  }

  // 调用 LLM 翻译
  private async callLLMTranslation(content: string, projectPath: string): Promise<string> {
    try {
      const response = await this.llmService.translateText({
        content
      }, projectPath)
      
      return response.translatedContent
    } catch (error) {
      console.error('LLM 翻译失败:', error)
      // 如果 LLM 翻译失败，返回模拟翻译结果
      return this.getMockTranslation(content)
    }
  }

  // 模拟翻译（作为 LLM 翻译的备选方案）
  private getMockTranslation(content: string): string {
    return content
      .replace(/OpenDoc Translate/g, 'OpenDoc Translate')
      .replace(/Getting Started/g, '开始使用')
      .replace(/API Reference/g, 'API 参考')
      .replace(/Authentication/g, '认证')
      .replace(/Endpoints/g, '端点')
      .replace(/Parameters/g, '参数')
      .replace(/Response/g, '响应')
      .replace(/Documentation/g, '文档')
      .replace(/Installation/g, '安装')
      .replace(/Configuration/g, '配置')
      .replace(/Usage/g, '使用方法')
      .replace(/Examples/g, '示例')
      .replace(/FAQ/g, '常见问题')
      .replace(/Troubleshooting/g, '故障排除')
      .replace(/Contributing/g, '贡献指南')
      .replace(/License/g, '许可证')
      .replace(/Changelog/g, '更新日志')
  }
} 
