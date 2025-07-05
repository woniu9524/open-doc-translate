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
  }
  globalPrompt: string
}

export interface FileStatus {
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  lastHash?: string
} 