import { GitFileStatus, GitCommit } from '../../../preload/index.d'

export class GitService {
  async getStatus(projectPath: string): Promise<GitFileStatus[]> {
    return await window.api.git.getStatus(projectPath)
  }

  async stageFile(projectPath: string, filePath: string): Promise<void> {
    await window.api.git.stageFile(projectPath, filePath)
  }

  async stageAll(projectPath: string): Promise<void> {
    await window.api.git.stageAll(projectPath)
  }

  async unstageFile(projectPath: string, filePath: string): Promise<void> {
    await window.api.git.unstageFile(projectPath, filePath)
  }

  async commit(projectPath: string, message: string): Promise<void> {
    await window.api.git.commit(projectPath, message)
  }

  async push(projectPath: string, remote?: string, branch?: string): Promise<void> {
    await window.api.git.push(projectPath, remote, branch)
  }

  async commitAndPush(projectPath: string, message: string, remote?: string, branch?: string): Promise<void> {
    await window.api.git.commitAndPush(projectPath, message, remote, branch)
  }

  async getCommitHistory(projectPath: string, limit?: number): Promise<GitCommit[]> {
    return await window.api.git.getCommitHistory(projectPath, limit)
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    return await window.api.git.getCurrentBranch(projectPath)
  }

  async hasUncommittedChanges(projectPath: string): Promise<boolean> {
    return await window.api.git.hasUncommittedChanges(projectPath)
  }

  async getRemoteUrl(projectPath: string, remote?: string): Promise<string> {
    return await window.api.git.getRemoteUrl(projectPath, remote)
  }
}

// 创建单例实例
export const gitService = new GitService() 