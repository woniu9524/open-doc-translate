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
      files: {
        getFileTree: (projectPath: string, watchDirectories: string[], fileTypes: string[], upstreamBranch: string, workingBranch: string) => Promise<FileItem[]>
        getFileStatus: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => Promise<FileStatus>
        syncFileStatuses: (projectPath: string, watchDirectories: string[], fileTypes: string[], upstreamBranch: string, workingBranch: string) => Promise<void>
      }
    }
  }
}

interface FileItem {
  name: string
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  children?: FileItem[]
  lastHash?: string
}

interface FileStatus {
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  lastHash?: string
}
