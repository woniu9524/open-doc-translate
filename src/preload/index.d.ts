import { ElectronAPI } from '@electron-toolkit/preload'
import { AppConfig, ProjectConfig } from '../renderer/src/types/config'

export interface GitFileStatus {
  path: string
  status: string
  staged: boolean
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
  shortHash: string
}

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
        checkoutBranch: (projectPath: string, branch: string) => Promise<boolean>
      }
      files: {
        getFileTree: (projectPath: string, watchDirectories: string[], fileTypes: string[], upstreamBranch: string, workingBranch: string) => Promise<FileItem[]>
        getFileStatus: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => Promise<FileStatus>
        syncFileStatuses: (projectPath: string, watchDirectories: string[], fileTypes: string[], upstreamBranch: string, workingBranch: string) => Promise<void>
        getFileContent: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => Promise<FileContent>
        saveFileContent: (projectPath: string, filePath: string, content: string) => Promise<void>
        translateFile: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => Promise<void>
        clearProjectCache: (projectPath: string) => Promise<void>
        clearBranchCache: (projectPath: string, workingBranch: string, upstreamBranch: string) => Promise<void>
      }
      git: {
        getStatus: (projectPath: string) => Promise<GitFileStatus[]>
        stageFile: (projectPath: string, filePath: string) => Promise<boolean>
        stageAll: (projectPath: string) => Promise<boolean>
        unstageFile: (projectPath: string, filePath: string) => Promise<boolean>
        commit: (projectPath: string, message: string) => Promise<boolean>
        push: (projectPath: string, remote?: string, branch?: string) => Promise<boolean>
        commitAndPush: (projectPath: string, message: string, remote?: string, branch?: string) => Promise<boolean>
        getCommitHistory: (projectPath: string, limit?: number) => Promise<GitCommit[]>
        getCurrentBranch: (projectPath: string) => Promise<string>
        hasUncommittedChanges: (projectPath: string) => Promise<boolean>
        getRemoteUrl: (projectPath: string, remote?: string) => Promise<string>
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

interface FileContent {
  original: string
  translated: string
  status: 'translated' | 'outdated' | 'untranslated'
  hasChanges?: boolean
}
