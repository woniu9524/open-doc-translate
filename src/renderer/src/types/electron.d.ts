import { AppConfig, ProjectConfig } from './config'

declare global {
  interface Window {
    api: {
      config: {
        load: () => Promise<AppConfig>
        save: (config: AppConfig) => Promise<boolean>
        addProject: () => Promise<ProjectConfig | null>
        updateProject: (projectPath: string, updates: Partial<ProjectConfig>) => Promise<boolean>
        removeProject: (projectPath: string) => Promise<boolean>
        setActiveProject: (projectPath: string) => Promise<boolean>
        getActiveProject: () => Promise<ProjectConfig | undefined>
        getBranches: (projectPath: string) => Promise<{ local: string[], remote: string[] }>
      }
    }
  }
} 