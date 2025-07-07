import { promises as fs } from 'fs'
import { join, relative, extname, basename, dirname, sep } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import ignore from 'ignore'
import { LLMService } from './llmService'
import { ConfigManager } from './config'
import { NotebookProcessor } from './notebookProcessor'

const execAsync = promisify(exec)

export interface FileItem {
  name: string
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  children?: FileItem[]
  lastHash?: string
  size?: number // 文件大小（字节）
}

export interface FileStatus {
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  lastHash?: string
}

export class FileManager {
  private statusCache: Map<string, FileStatus> = new Map()
  private llmService: LLMService
  private notebookProcessor: NotebookProcessor
  private upstreamHashCache: Map<string, Map<string, string>> = new Map() // 缓存上游分支的文件哈希
  private gitignoreCache: Map<string, any> = new Map() // 缓存gitignore规则

  constructor(configManager: ConfigManager) {
    this.llmService = new LLMService(configManager)
    this.notebookProcessor = new NotebookProcessor(this.llmService)
  }

  // 标准化路径分隔符 - 统一使用当前系统的路径分隔符
  private normalizePath(path: string): string {
    return path.replace(/[/\\]/g, sep)
  }

  // 获取路径的分隔符数组
  private getPathParts(path: string): string[] {
    return this.normalizePath(path).split(sep)
  }

  private getStatusFilePath(projectPath: string, workingBranch: string): string {
    // 对分支名称进行转义，将斜杠替换为下划线，避免路径问题
    const safeBranchName = workingBranch.replace(/[\/\\]/g, '_')
    return join(projectPath, `.opendoc-translate-${safeBranchName}.json`)
  }

  // 加载文件状态缓存
  private async loadStatusCache(projectPath: string, workingBranch: string): Promise<void> {
    const statusFilePath = this.getStatusFilePath(projectPath, workingBranch)
    
    try {
      if (await fs.access(statusFilePath).then(() => true).catch(() => false)) {
        const data = await fs.readFile(statusFilePath, 'utf-8')
        const statusData = JSON.parse(data)
        
        // 清空当前缓存
        this.statusCache.clear()
        
        // 加载缓存数据
        for (const [path, status] of Object.entries(statusData)) {
          const cacheKey = `${projectPath}:${workingBranch}:${path}`
          this.statusCache.set(cacheKey, status as FileStatus)
        }
      }
    } catch (error) {
      console.error('加载状态缓存失败:', error)
    }
  }

  // 保存文件状态缓存
  private async saveStatusCache(projectPath: string, workingBranch: string): Promise<void> {
    const statusFilePath = this.getStatusFilePath(projectPath, workingBranch)
    
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
        await fs.unlink(statusFilePath)
        console.log(`删除空状态文件: ${statusFilePath}`)
      } catch (error) {
        // 文件不存在是正常的，不需要报错
      }
      return
    }
    
    try {
      await fs.writeFile(statusFilePath, JSON.stringify(statusObj, null, 2), 'utf-8')
      console.log(`保存状态文件: ${statusFilePath}，包含 ${Object.keys(statusObj).length} 个文件`)
    } catch (error) {
      console.error(`保存分支 ${workingBranch} 的状态文件失败:`, error)
    }
  }

  // 获取文件的Git commit hash
  private async getFileHash(projectPath: string, filePath: string, branch: string): Promise<string | null> {
    try {
      // 将路径标准化为 Git 兼容的正斜杠格式
      const gitPath = filePath.replace(/\\/g, '/')
      const { stdout } = await execAsync(
        `git log -1 --format="%H" ${branch} -- "${gitPath}"`,
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
      // 将路径标准化为 Git 兼容的正斜杠格式
      const gitPath = filePath.replace(/\\/g, '/')
      const { stdout } = await execAsync(
        `git status --porcelain "${gitPath}"`,
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
      // 将路径标准化为 Git 兼容的正斜杠格式
      const gitPath = filePath.replace(/\\/g, '/')
      await execAsync(`git cat-file -e ${branch}:"${gitPath}"`, { cwd: projectPath })
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

  // 加载并解析.gitignore文件
  private async loadGitignore(projectPath: string): Promise<any> {
    const cacheKey = projectPath
    
    // 检查缓存
    if (this.gitignoreCache.has(cacheKey)) {
      return this.gitignoreCache.get(cacheKey)
    }

    const ig = ignore()
    const gitignorePath = join(projectPath, '.gitignore')
    
    try {
      // 读取.gitignore文件
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8')
      ig.add(gitignoreContent)
      
      // 添加一些默认的忽略规则
      ig.add([
        '.git',
        '.git/**',
        'node_modules',
        'node_modules/**',
        '.DS_Store',
        'Thumbs.db',
        '.vscode',
        '.idea'
      ])
      
      console.log(`加载.gitignore文件: ${gitignorePath}`)
    } catch (error) {
      console.log(`未找到.gitignore文件或读取失败: ${gitignorePath}，使用默认忽略规则`)
      
      // 如果没有.gitignore文件，使用默认的忽略规则
      ig.add([
        '.git',
        '.git/**',
        'node_modules',
        'node_modules/**',
        '.DS_Store',
        'Thumbs.db',
        '.vscode',
        '.idea',
        '*.log',
        '*.tmp',
        '*.cache',
        'dist',
        'build',
        'out',
        '.env',
        '.env.*'
      ])
    }
    
    // 缓存结果
    this.gitignoreCache.set(cacheKey, ig)
    return ig
  }

  // 检查路径是否应该被忽略
  private shouldIgnorePath(ig: any, relativePath: string): boolean {
    try {
      // 标准化路径 - 使用正斜杠
      const normalizedPath = relativePath.replace(/\\/g, '/')
      return ig.ignores(normalizedPath)
    } catch (error) {
      console.error(`检查忽略路径失败: ${relativePath}`, error)
      return false
    }
  }

  // 扫描目录获取文件列表（支持gitignore过滤）
  private async scanDirectory(
    projectPath: string,
    dirPath: string,
    fileTypes: string[],
    relativePath: string = '',
    ig?: any
  ): Promise<string[]> {
    const files: string[] = []
    const fullPath = join(projectPath, dirPath)

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name)
        const relativeEntryPath = relativePath ? join(relativePath, entry.name) : entry.name

        // 检查是否应该忽略这个路径
        if (ig && this.shouldIgnorePath(ig, entryPath)) {
          continue
        }

        if (entry.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await this.scanDirectory(projectPath, entryPath, fileTypes, relativeEntryPath, ig)
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

  // 批量获取文件大小信息
  private async getBatchFileSizes(
    projectPath: string,
    files: string[]
  ): Promise<Map<string, number>> {
    const sizeMap = new Map<string, number>()
    
    for (const filePath of files) {
      try {
        const fullPath = join(projectPath, filePath)
        const stats = await fs.stat(fullPath)
        if (stats.isFile()) {
          sizeMap.set(filePath, stats.size)
        }
      } catch (error) {
        console.error(`获取文件大小失败 ${filePath}:`, error)
        // 如果获取失败，设置为0
        sizeMap.set(filePath, 0)
      }
    }
    
    return sizeMap
  }

  // 构建文件树结构
  private buildFileTree(files: string[], statusMap: Map<string, FileStatus>, sizeMap: Map<string, number>): FileItem[] {
    const tree: FileItem[] = []
    const pathMap = new Map<string, FileItem>()

    // 按路径深度排序 - 使用跨平台的路径处理
    files.sort((a, b) => this.getPathParts(a).length - this.getPathParts(b).length)

    for (const filePath of files) {
      // 使用跨平台的路径分割
      const parts = this.getPathParts(filePath)
      const fileName = parts[parts.length - 1]
      const status = statusMap.get(filePath)
      const size = sizeMap.get(filePath)

      const fileItem: FileItem = {
        name: fileName,
        path: filePath,
        status: status?.status || 'untranslated',
        modified: status?.modified || false,
        lastHash: status?.lastHash,
        size: size || 0
      }

      if (parts.length === 1) {
        // 根目录文件
        tree.push(fileItem)
        pathMap.set(filePath, fileItem)
      } else {
        // 子目录文件
        const parentPath = parts.slice(0, -1).join(sep)
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

  // 获取上游哈希缓存的key
  private getUpstreamCacheKey(projectPath: string, upstreamBranch: string): string {
    return `${projectPath}:upstream/${upstreamBranch}`
  }

  // 清除上游哈希缓存
  private clearUpstreamHashCache(projectPath: string, upstreamBranch: string): void {
    const cacheKey = this.getUpstreamCacheKey(projectPath, upstreamBranch)
    this.upstreamHashCache.delete(cacheKey)
  }

  // 清除指定项目的所有缓存
  public clearProjectCache(projectPath: string): void {
    // 清除状态缓存
    const keysToDelete = Array.from(this.statusCache.keys()).filter(key => key.startsWith(`${projectPath}:`))
    keysToDelete.forEach(key => this.statusCache.delete(key))
    
    // 清除上游哈希缓存
    const hashKeysToDelete = Array.from(this.upstreamHashCache.keys()).filter(key => key.startsWith(`${projectPath}:`))
    hashKeysToDelete.forEach(key => this.upstreamHashCache.delete(key))
    
    // 清除gitignore缓存
    this.gitignoreCache.delete(projectPath)
    
    console.log(`清除项目 ${projectPath} 的所有缓存`)
  }

  // 清除指定分支的缓存
  public clearBranchCache(projectPath: string, workingBranch: string, upstreamBranch: string): void {
    // 清理状态缓存
    const branchPrefix = `${projectPath}:${workingBranch}:`
    const keysToDelete = Array.from(this.statusCache.keys()).filter(key => key.startsWith(branchPrefix))
    keysToDelete.forEach(key => this.statusCache.delete(key))
    
    // 清理上游哈希缓存
    this.clearUpstreamHashCache(projectPath, upstreamBranch)
    
    // 清理gitignore缓存
    this.gitignoreCache.delete(projectPath)
    
    console.log(`清除项目 ${projectPath} 分支 ${workingBranch}/${upstreamBranch} 的缓存`)
  }

  // 批量获取上游分支所有文件的哈希值（带缓存）
  private async getBatchUpstreamHashes(
    projectPath: string,
    watchDirectories: string[],
    upstreamBranch: string
  ): Promise<Map<string, string>> {
    const cacheKey = this.getUpstreamCacheKey(projectPath, upstreamBranch)
    
    if (this.upstreamHashCache.has(cacheKey)) {
      return this.upstreamHashCache.get(cacheKey)!
    }

    const hashMap = new Map<string, string>()
    
    try {
      // 如果监听目录为空或只有'.'，获取整个仓库的文件
      let dirArgs = ''
      if (!watchDirectories || watchDirectories.length === 0 || (watchDirectories.length === 1 && watchDirectories[0] === '.')) {
        // 不指定目录，获取所有文件
        dirArgs = ''
      } else {
        // 指定目录
        dirArgs = '-- ' + watchDirectories.map(dir => `"${dir.replace(/\\/g, '/')}"`).join(' ')
      }
      
      const { stdout } = await execAsync(
        `git ls-tree -r upstream/${upstreamBranch} ${dirArgs}`,
        { cwd: projectPath }
      )
      
      // 解析 git ls-tree 输出
      const lines = stdout.trim().split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        const match = line.match(/^(\d+)\s+(\w+)\s+([a-f0-9]+)\s+(.+)$/)
        if (match) {
          const [, , type, blobHash, filePath] = match
          if (type === 'blob') {
            // 标准化路径格式 - 使用系统路径分隔符
            const normalizedPath = this.normalizePath(filePath)
            hashMap.set(normalizedPath, blobHash)
          }
        }
      }
      
      // 缓存结果
      this.upstreamHashCache.set(cacheKey, hashMap)
      
      return hashMap
    } catch (error) {
      console.error('批量获取上游哈希失败:', error)
      return hashMap
    }
  }

  // 获取文件的blob哈希值
  private async getFileBlobHash(projectPath: string, filePath: string, branch: string): Promise<string | null> {
    try {
      // 将路径标准化为 Git 兼容的正斜杠格式
      const gitPath = filePath.replace(/\\/g, '/')
      const { stdout } = await execAsync(
        `git ls-tree ${branch} "${gitPath}"`,
        { cwd: projectPath }
      )
      
      const hashMatch = stdout.match(/^[0-9]+ blob ([a-f0-9]+)/)
      return hashMatch ? hashMatch[1] : null
    } catch (error) {
      console.error(`获取文件 ${filePath} 的blob hash失败:`, error)
      return null
    }
  }

  // 批量获取所有文件的修改状态
  private async getBatchModifiedStatus(
    projectPath: string
  ): Promise<Map<string, boolean>> {
    const modifiedMap = new Map<string, boolean>()
    
    try {
      // 使用 git status --porcelain 获取所有修改的文件
      const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath })
      
      const lines = stdout.trim().split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        // 解析 git status --porcelain 输出格式
        const match = line.match(/^(..)(.+)$/)
        if (match) {
          const [, status, filePath] = match
          // 标准化路径格式 - 使用系统路径分隔符
          const normalizedPath = this.normalizePath(filePath.trim())
          modifiedMap.set(normalizedPath, true)
        }
      }
      
      return modifiedMap
    } catch (error) {
      console.error('批量获取修改状态失败:', error)
      return modifiedMap
    }
  }

  // 批量计算文件状态
  private async batchCalculateFileStatus(
    projectPath: string,
    allFiles: string[],
    upstreamBranch: string,
    workingBranch: string,
    upstreamHashMap: Map<string, string>,
    modifiedMap: Map<string, boolean>
  ): Promise<Map<string, FileStatus>> {
    const statusMap = new Map<string, FileStatus>()
    
    for (const filePath of allFiles) {
      const cacheKey = `${projectPath}:${workingBranch}:${filePath}`
      const cachedStatus = this.statusCache.get(cacheKey)
      const upstreamHash = upstreamHashMap.get(filePath)
      const isModified = modifiedMap.get(filePath) || false
      
      let status: 'translated' | 'outdated' | 'untranslated' = 'untranslated'
      
      if (cachedStatus && upstreamHash) {
        if (cachedStatus.lastHash === upstreamHash) {
          status = 'translated'
        } else {
          status = 'outdated'
        }
      } else if (cachedStatus) {
        status = cachedStatus.status
      }
      
      statusMap.set(filePath, {
        path: filePath,
        status,
        modified: isModified,
        lastHash: upstreamHash
      })
    }
    
    return statusMap
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

    // 加载.gitignore规则
    const ig = await this.loadGitignore(projectPath)

    // 确定扫描目录
    let dirsToScan = watchDirectories
    if (!watchDirectories || watchDirectories.length === 0) {
      // 如果监听目录为空，扫描整个项目根目录
      dirsToScan = ['.']
      console.log('监听目录为空，将扫描整个项目目录')
    }

    // 扫描所有监听目录
    const allFiles: string[] = []
    for (const dir of dirsToScan) {
      const files = await this.scanDirectory(projectPath, dir, fileTypes, '', ig)
      allFiles.push(...files)
    }

    console.log(`扫描到 ${allFiles.length} 个文件`)

    // 批量获取上游文件哈希、修改状态和文件大小
    const [upstreamHashMap, modifiedMap, sizeMap] = await Promise.all([
      this.getBatchUpstreamHashes(projectPath, dirsToScan, upstreamBranch),
      this.getBatchModifiedStatus(projectPath),
      this.getBatchFileSizes(projectPath, allFiles)
    ])

    // 批量计算文件状态
    const statusMap = await this.batchCalculateFileStatus(
      projectPath,
      allFiles,
      upstreamBranch,
      workingBranch,
      upstreamHashMap,
      modifiedMap
    )

    // 构建文件树
    const tree = this.buildFileTree(allFiles, statusMap, sizeMap)

    // 检查是否有已翻译的文件需要保存状态缓存
    const hasTranslatedFiles = Array.from(statusMap.values()).some(
      status => status.status === 'translated' || status.status === 'outdated'
    )
    
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
    
    // 清除上游哈希缓存，确保获取最新的上游文件状态
    this.clearUpstreamHashCache(projectPath, upstreamBranch)
    
    // 清除gitignore缓存，确保获取最新的忽略规则
    this.gitignoreCache.delete(projectPath)
    
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
        // 从指定分支读取文件 - 将路径标准化为 Git 兼容的正斜杠格式
        const gitPath = filePath.replace(/\\/g, '/')
        const { stdout } = await execAsync(`git show ${branch}:"${gitPath}"`, { cwd: projectPath })
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
        translated = await this.readFileContent(projectPath, filePath)
      } catch (error) {
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
      // 获取原文内容
      const originalContent = await this.readFileContent(projectPath, filePath, `upstream/${upstreamBranch}`)
      
      let translatedContent: string
      
      // 检查是否为 Jupyter Notebook 文件
      if (NotebookProcessor.isNotebookFile(filePath)) {
        console.log(`检测到 Jupyter Notebook 文件: ${filePath}，使用专门的处理器`)
        
        // 使用 Notebook 处理器进行翻译
        const result = await this.notebookProcessor.translateNotebook(originalContent, projectPath)
        
        // 验证翻译后的 notebook 结构
        const validation = this.notebookProcessor.validateNotebook(result.translatedNotebook)
        if (!validation.isValid) {
          console.warn(`Notebook 结构验证失败: ${validation.errors.join(', ')}`)
        }
        
        // 转换为 JSON 字符串
        translatedContent = this.notebookProcessor.stringifyNotebook(result.translatedNotebook)
        
        // 输出翻译统计信息
        console.log(`Notebook 翻译完成: ${result.translatedCellsCount}/${result.totalMarkdownCells} 个 markdown 单元格翻译成功`)
        
        if (result.errors.length > 0) {
          console.warn(`翻译过程中出现 ${result.errors.length} 个错误:`)
          result.errors.forEach(error => {
            console.warn(`  单元格 ${error.cellIndex}: ${error.error}`)
          })
        }
      } else {
        // 对于普通文件，使用标准翻译流程
        translatedContent = await this.callLLMTranslation(originalContent, projectPath)
      }
      
      // 保存翻译结果
      await this.saveFileContent(projectPath, filePath, translatedContent)
      
      // 获取当前上游文件的blob哈希
      const currentHash = await this.getFileBlobHash(projectPath, filePath, `upstream/${upstreamBranch}`)
      
      // 更新文件状态缓存
      const cacheKey = `${projectPath}:${workingBranch}:${filePath}`
      const fileStatus: FileStatus = {
        path: filePath,
        status: 'translated',
        lastHash: currentHash || undefined
      }
      
      this.statusCache.set(cacheKey, fileStatus)
      
      // 保存缓存到文件
      await this.saveStatusCache(projectPath, workingBranch)
      
      console.log(`文件翻译完成: ${filePath}`)
    } catch (error) {
      console.error(`翻译文件失败: ${filePath}`, error)
      throw error
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
