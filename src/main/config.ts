import { app, dialog } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const CONFIG_FILE = 'opendoc-config.json'

export interface ProjectConfig {
  name: string
  path: string
  originUrl: string
  upstreamUrl: string
  upstreamBranch: string
  workingBranch: string
  watchDirectories: string[]
  fileTypes: string[]
  lastSyncHash?: string
  customPrompt?: string
}

export interface AppConfig {
  projects: ProjectConfig[]
  activeProjectPath?: string
  llmConfig: {
    apiKey: string
    model: string
    baseUrl?: string
    temperature?: number
    maxTokens?: number
    concurrency?: number
  }
  globalPrompt: string
}

export class ConfigManager {
  private configPath: string
  private config: AppConfig

  constructor() {
    this.configPath = join(app.getPath('userData'), CONFIG_FILE)
    this.config = this.getDefaultConfig()
  }

  private getDefaultConfig(): AppConfig {
    return {
      projects: [],
      llmConfig: {
        apiKey: '',
        model: 'gpt-4',
        baseUrl: 'https://openrouter.ai/api/v1',
        concurrency: 3
      },
      globalPrompt: '你是一个专业的技术文档翻译助手。请将以下英文文档翻译成中文，保持原有的格式和结构，确保技术术语的准确性。'
    }
  }

  async loadConfig(): Promise<AppConfig> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8')
      this.config = { ...this.getDefaultConfig(), ...JSON.parse(configData) }
    } catch (error) {
      console.log('配置文件不存在或损坏，使用默认配置')
      this.config = this.getDefaultConfig()
    }
    return this.config
  }

  async saveConfig(config: AppConfig): Promise<void> {
    try {
      this.config = config
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (error) {
      console.error('保存配置失败:', error)
      throw error
    }
  }

  async getBranches(projectPath: string): Promise<{ local: string[], remote: string[] }> {
    try {
      // 获取本地分支
      const { stdout: localBranches } = await execAsync('git branch', { cwd: projectPath })
      const local = localBranches
        .split('\n')
        .map(branch => branch.replace(/^\*?\s*/, '').trim())
        .filter(branch => branch && !branch.startsWith('('))

      // 获取远程分支，只获取 upstream 下的分支
      const { stdout: remoteBranches } = await execAsync('git branch -r', { cwd: projectPath })
      const remote = remoteBranches
        .split('\n')
        .map(branch => branch.trim())
        .filter(branch => branch && !branch.includes('->') && branch.startsWith('upstream/'))
        .map(branch => branch.replace(/^upstream\//, ''))

      return { local, remote }
    } catch (error) {
      console.error('获取分支列表失败:', error)
      return { local: ['main', 'master'], remote: ['main', 'master'] }
    }
  }

  async addProject(): Promise<ProjectConfig | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择项目目录'
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    const projectPath = result.filePaths[0]
    const projectName = projectPath.split(/[/\\]/).pop() || 'Unknown Project'

    // 检查是否已存在
    const existingProject = this.config.projects.find(p => p.path === projectPath)
    if (existingProject) {
      throw new Error('项目已存在')
    }

    // 尝试检测git配置
    let originUrl = ''
    let upstreamUrl = ''
    
    try {
      const gitConfigPath = join(projectPath, '.git', 'config')
      const gitConfig = await fs.readFile(gitConfigPath, 'utf-8')
      
      // 简单解析git配置
      const originMatch = gitConfig.match(/\[remote "origin"\][\s\S]*?url = (.+)/)
      const upstreamMatch = gitConfig.match(/\[remote "upstream"\][\s\S]*?url = (.+)/)
      
      if (originMatch) originUrl = originMatch[1].trim()
      if (upstreamMatch) upstreamUrl = upstreamMatch[1].trim()
    } catch (error) {
      console.log('无法读取git配置，使用空值')
    }

    // 获取分支信息
    const branches = await this.getBranches(projectPath)
    const defaultUpstreamBranch = branches.remote.includes('main') ? 'main' : 
                                 branches.remote.includes('master') ? 'master' : 
                                 branches.remote[0] || 'main'

    // 选择合适的默认工作分支
    const defaultWorkingBranch = branches.local.includes('main') ? 'main' : 
                                branches.local.includes('master') ? 'master' : 
                                branches.local[0] || 'main'

    const newProject: ProjectConfig = {
      name: projectName,
      path: projectPath,
      originUrl,
      upstreamUrl,
      upstreamBranch: defaultUpstreamBranch,
      workingBranch: defaultWorkingBranch,
      watchDirectories: ['docs', 'guides'],
      fileTypes: ['.md', '.mdx', '.txt']
    }

    this.config.projects.push(newProject)
    await this.saveConfig(this.config)

    return newProject
  }

  async updateProject(projectPath: string, updates: Partial<ProjectConfig>): Promise<void> {
    const projectIndex = this.config.projects.findIndex(p => p.path === projectPath)
    if (projectIndex === -1) {
      throw new Error('项目不存在')
    }

    this.config.projects[projectIndex] = {
      ...this.config.projects[projectIndex],
      ...updates
    }

    await this.saveConfig(this.config)
  }

  async removeProject(projectPath: string): Promise<void> {
    this.config.projects = this.config.projects.filter(p => p.path !== projectPath)
    
    if (this.config.activeProjectPath === projectPath) {
      this.config.activeProjectPath = undefined
    }

    await this.saveConfig(this.config)
  }

  async setActiveProject(projectPath: string): Promise<void> {
    const project = this.config.projects.find(p => p.path === projectPath)
    if (!project) {
      throw new Error('项目不存在')
    }

    this.config.activeProjectPath = projectPath
    await this.saveConfig(this.config)
  }

  async fetchUpstream(projectPath: string): Promise<void> {
    try {
      // 执行 git fetch upstream 命令
      await execAsync('git fetch upstream', { cwd: projectPath })
      console.log('成功拉取上游分支')
    } catch (error) {
      console.error('拉取上游分支失败:', error)
      throw new Error('拉取上游分支失败: ' + (error as Error).message)
    }
  }

  async checkoutBranch(projectPath: string, branch: string): Promise<void> {
    try {
      // 执行 git checkout 命令切换分支
      await execAsync(`git checkout ${branch}`, { cwd: projectPath })
      console.log(`成功切换到分支: ${branch}`)
    } catch (error) {
      console.error(`切换分支失败: ${branch}`, error)
      throw new Error(`切换分支失败: ${branch} - ${(error as Error).message}`)
    }
  }

  getConfig(): AppConfig {
    return this.config
  }

  getActiveProject(): ProjectConfig | undefined {
    if (!this.config.activeProjectPath) return undefined
    return this.config.projects.find(p => p.path === this.config.activeProjectPath)
  }
} 