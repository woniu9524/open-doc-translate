import { ElectronAPI } from '@electron-toolkit/preload'
import { AppConfig, ProjectConfig } from '../renderer/src/types/config'

declare global {
  interface Window {
    electron: ElectronAPI
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
        fetchUpstream: (projectPath: string) => Promise<boolean>
      }
    }
  }
}
