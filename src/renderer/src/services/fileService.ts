export interface FileItem {
  name: string
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  children?: FileItem[]
  lastHash?: string
}

export interface FileStatus {
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  lastHash?: string
}

export interface FileContent {
  original: string
  translated: string
  status: 'translated' | 'outdated' | 'untranslated'
  hasChanges?: boolean
}

export class FileService {
  async getFileTree(
    projectPath: string,
    watchDirectories: string[],
    fileTypes: string[],
    upstreamBranch: string,
    workingBranch: string
  ): Promise<FileItem[]> {
    return await window.api.files.getFileTree(
      projectPath,
      watchDirectories,
      fileTypes,
      upstreamBranch,
      workingBranch
    )
  }

  async getFileStatus(
    projectPath: string,
    filePath: string,
    upstreamBranch: string,
    workingBranch: string
  ): Promise<FileStatus> {
    return await window.api.files.getFileStatus(
      projectPath,
      filePath,
      upstreamBranch,
      workingBranch
    )
  }

  async syncFileStatuses(
    projectPath: string,
    watchDirectories: string[],
    fileTypes: string[],
    upstreamBranch: string,
    workingBranch: string
  ): Promise<void> {
    await window.api.files.syncFileStatuses(
      projectPath,
      watchDirectories,
      fileTypes,
      upstreamBranch,
      workingBranch
    )
  }

  async getFileContent(
    projectPath: string,
    filePath: string,
    upstreamBranch: string,
    workingBranch: string
  ): Promise<FileContent> {
    return await window.api.files.getFileContent(
      projectPath,
      filePath,
      upstreamBranch,
      workingBranch
    )
  }

  async saveFileContent(
    projectPath: string,
    filePath: string,
    content: string
  ): Promise<void> {
    await window.api.files.saveFileContent(projectPath, filePath, content)
  }
}

// 创建单例实例
export const fileService = new FileService() 