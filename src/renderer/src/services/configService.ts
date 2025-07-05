import { AppConfig, ProjectConfig } from '../types/config'

export class ConfigService {
  private config: AppConfig | null = null
  private listeners: Array<(config: AppConfig) => void> = []

  async loadConfig(): Promise<AppConfig> {
    this.config = await window.api.config.load()
    this.notifyListeners()
    return this.config
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await window.api.config.save(config)
    this.config = config
    this.notifyListeners()
  }

  async addProject(): Promise<ProjectConfig | null> {
    const project = await window.api.config.addProject()
    if (project) {
      await this.loadConfig() // 重新加载配置以获取最新状态
    }
    return project
  }

  async updateProject(projectPath: string, updates: Partial<ProjectConfig>): Promise<void> {
    await window.api.config.updateProject(projectPath, updates)
    await this.loadConfig()
  }

  async removeProject(projectPath: string): Promise<void> {
    await window.api.config.removeProject(projectPath)
    await this.loadConfig()
  }

  async setActiveProject(projectPath: string): Promise<void> {
    await window.api.config.setActiveProject(projectPath)
    await this.loadConfig()
  }

  async getActiveProject(): Promise<ProjectConfig | undefined> {
    return await window.api.config.getActiveProject()
  }

  async getBranches(projectPath: string): Promise<{ local: string[], remote: string[] }> {
    return await window.api.config.getBranches(projectPath)
  }

  async fetchUpstream(projectPath: string): Promise<void> {
    await window.api.config.fetchUpstream(projectPath)
  }

  getConfig(): AppConfig | null {
    return this.config
  }

  getProjects(): ProjectConfig[] {
    return this.config?.projects || []
  }

  getActiveProjectPath(): string | undefined {
    return this.config?.activeProjectPath
  }

  // 监听配置变化
  onConfigChange(listener: (config: AppConfig) => void): () => void {
    this.listeners.push(listener)
    
    // 返回取消监听的函数
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  private notifyListeners(): void {
    if (this.config) {
      this.listeners.forEach(listener => listener(this.config!))
    }
  }
}

// 创建单例实例
export const configService = new ConfigService() 