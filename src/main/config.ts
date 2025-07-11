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

export interface PromptTemplate {
  id: string
  name: string
  content: string
  description?: string
  createdAt: string
  updatedAt: string
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
  promptTemplates?: PromptTemplate[]
}

export class ConfigManager {
  private configPath: string
  private config: AppConfig

  constructor() {
    this.configPath = join(app.getPath('userData'), CONFIG_FILE)
    this.config = this.getDefaultConfig()
  }

  private getDefaultConfig(): AppConfig {
    const now = new Date().toISOString()
    
    return {
      projects: [],
      llmConfig: {
        apiKey: '',
        model: 'gpt-4',
        baseUrl: 'https://openrouter.ai/api/v1',
        concurrency: 3
      },
      globalPrompt: '你是一位精通中英双语的专业技术文档翻译专家。你的任务是将以下英文技术文档翻译成简体中文。\n在翻译过程中，请严格遵守以下规则：\n忠于原文，力求信、达、雅：\n准确性 (信)：翻译必须准确传达原文的技术信息和意图，不能有任何歪曲或遗漏。\n流畅性 (达)：译文应流畅自然，符合中文技术文档的表达习惯。对于原文中过于拗口的句子，可以在保证准确性的前提下进行适当的意译，使其更易于理解。\n专业性 (雅)：使用行业内公认的、标准的专业术语。\n格式与结构：\n严格保留原文的 Markdown 格式，包括但不限于标题（#）、列表（-、*、1.）、粗体（**）、斜体（*）、代码块（```）、行内代码（``）等。\n保持段落、换行和整体布局与原文一致。\n内容处理规则：\n需要翻译的内容：\n正文段落、标题、列表项、表格内容等。\n代码块（```）和行内代码（``）中的注释。例如，// Get user data 应翻译为 // 获取用户数据。\n不需要翻译的内容：\n代码本身，包括变量名、函数名、类名、模块名、属性等。例如，const userName = \'test\'; 应保持不变。\n代码注释中的特殊标记：这些通常是给文档工具或代码检查工具看的，必须原样保留。例如：# highlight-start, # highlight-end, # highlight-next-line, // @ts-ignore, eslint-disable-next-line, prettier-ignore 等。\n输出要求：\n只输出翻译后的内容。\n禁止在译文的开头或结尾添加任何额外说明、介绍、总结或致谢等文字。例如，不要说"这是您的翻译："或"翻译完成。"。',
      promptTemplates: [
        {
          id: 'tech-doc-professional',
          name: '专业技术文档翻译',
          content: '你是一位精通中英双语的专业技术文档翻译专家。你的任务是将以下英文技术文档翻译成简体中文。\n在翻译过程中，请严格遵守以下规则：\n忠于原文，力求信、达、雅：\n准确性 (信)：翻译必须准确传达原文的技术信息和意图，不能有任何歪曲或遗漏。\n流畅性 (达)：译文应流畅自然，符合中文技术文档的表达习惯。对于原文中过于拗口的句子，可以在保证准确性的前提下进行适当的意译，使其更易于理解。\n专业性 (雅)：使用行业内公认的、标准的专业术语。\n格式与结构：\n严格保留原文的 Markdown 格式，包括但不限于标题（#）、列表（-、*、1.）、粗体（**）、斜体（*）、代码块（```）、行内代码（``）等。\n保持段落、换行和整体布局与原文一致。\n内容处理规则：\n需要翻译的内容：\n正文段落、标题、列表项、表格内容等。\n代码块（```）和行内代码（``）中的注释。例如，// Get user data 应翻译为 // 获取用户数据。\n不需要翻译的内容：\n代码本身，包括变量名、函数名、类名、模块名、属性等。例如，const userName = \'test\'; 应保持不变。\n代码注释中的特殊标记：这些通常是给文档工具或代码检查工具看的，必须原样保留。例如：# highlight-start, # highlight-end, # highlight-next-line, // @ts-ignore, eslint-disable-next-line, prettier-ignore 等。\n输出要求：\n只输出翻译后的内容。\n禁止在译文的开头或结尾添加任何额外说明、介绍、总结或致谢等文字。例如，不要说"这是您的翻译："或"翻译完成。"。',
          description: '专业的技术文档翻译模板，包含详细的翻译规则和格式要求',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'jupyter-notebook',
          name: 'Jupyter Notebook 翻译',
          content: '你是一位精通中英双语的专业技术文档翻译专家。你的任务是将一个 Jupyter Notebook (.ipynb) 文件中的英文内容翻译成简体中文。\n核心翻译原则：忠于原文，力求信、达、雅\n准确性 (信)：翻译必须准确传达原文的技术信息和意图，不能有任何歪曲或遗漏。\n流畅性 (达)：译文应流畅自然，符合中文技术文档的表达习惯。对于原文中过于拗口的句子，可在保证准确性的前提下进行适当的意译，使其更易于理解。\n专业性 (雅)：使用行业内公认的、标准的专业术语。\n禁止在译文的开头或结尾添加任何额外说明、介绍、总结或致谢等文字。例如，不要说"这是您的翻译："或"翻译完成。"。你的输出应该是以{开头，}结尾。禁止以`````json开头\n现在，请开始翻译以下内容：',
          description: '专门用于翻译 Jupyter Notebook 文件的模板，输出格式为 JSON',
          createdAt: now,
          updatedAt: now
        }
      ]
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
      fileTypes: ['.md', '.mdx', '.ipynb']
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

  // 检查上游远程是否存在
  async hasUpstreamRemote(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git remote', { cwd: projectPath })
      const remotes = stdout.trim().split('\n').map(line => line.trim())
      return remotes.includes('upstream')
    } catch (error) {
      console.error('检查上游远程失败:', error)
      return false
    }
  }

  // 添加上游远程
  async addUpstreamRemote(projectPath: string, upstreamUrl: string): Promise<void> {
    try {
      if (!upstreamUrl.trim()) {
        throw new Error('上游仓库URL不能为空')
      }

      // 检查上游远程是否已存在
      const hasUpstream = await this.hasUpstreamRemote(projectPath)
      if (hasUpstream) {
        // 如果已存在，更新URL
        await execAsync(`git remote set-url upstream "${upstreamUrl}"`, { cwd: projectPath })
        console.log(`更新上游远程URL: ${upstreamUrl}`)
      } else {
        // 如果不存在，添加新的上游远程
        await execAsync(`git remote add upstream "${upstreamUrl}"`, { cwd: projectPath })
        console.log(`添加上游远程: ${upstreamUrl}`)
      }

      // 更新项目配置中的上游URL
      await this.updateProject(projectPath, { upstreamUrl })
    } catch (error) {
      console.error('配置上游远程失败:', error)
      throw new Error('配置上游远程失败: ' + (error as Error).message)
    }
  }

  // 获取上游远程URL
  async getUpstreamUrl(projectPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git remote get-url upstream', { cwd: projectPath })
      return stdout.trim()
    } catch (error) {
      console.error('获取上游远程URL失败:', error)
      return ''
    }
  }

  // 验证上游远程连接
  async validateUpstreamRemote(projectPath: string): Promise<boolean> {
    try {
      // 尝试列出上游远程的引用
      await execAsync('git ls-remote upstream', { cwd: projectPath, timeout: 10000 })
      return true
    } catch (error) {
      console.error('验证上游远程连接失败:', error)
      return false
    }
  }

  // 删除上游远程
  async removeUpstreamRemote(projectPath: string): Promise<void> {
    try {
      await execAsync('git remote remove upstream', { cwd: projectPath })
      console.log('删除上游远程')
      
      // 更新项目配置，清空上游URL
      await this.updateProject(projectPath, { upstreamUrl: '' })
    } catch (error) {
      console.error('删除上游远程失败:', error)
      throw new Error('删除上游远程失败: ' + (error as Error).message)
    }
  }
} 