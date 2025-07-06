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

export interface FileStatus {
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  lastHash?: string
} 