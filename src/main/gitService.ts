import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitFileStatus {
  path: string
  status: string // 'M', 'A', 'D', 'R', 'C', 'U', '??', etc.
  staged: boolean
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
  shortHash: string
}

export class GitService {
  // 获取Git状态
  async getGitStatus(projectPath: string): Promise<GitFileStatus[]> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath })
      
      const files: GitFileStatus[] = []
      const lines = stdout.trim().split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        const stagedStatus = line[0]
        const workingStatus = line[1]
        const filePath = line.substring(3).trim()
        
        // 暂存区状态
        if (stagedStatus !== ' ' && stagedStatus !== '?') {
          files.push({
            path: filePath,
            status: stagedStatus,
            staged: true
          })
        }
        
        // 工作区状态
        if (workingStatus !== ' ' && workingStatus !== '?') {
          files.push({
            path: filePath,
            status: workingStatus,
            staged: false
          })
        }
        
        // 未跟踪文件
        if (stagedStatus === '?' && workingStatus === '?') {
          files.push({
            path: filePath,
            status: '??',
            staged: false
          })
        }
      }
      
      return files
    } catch (error) {
      console.error('获取Git状态失败:', error)
      return []
    }
  }

  // 暂存文件
  async stageFile(projectPath: string, filePath: string): Promise<void> {
    try {
      await execAsync(`git add "${filePath}"`, { cwd: projectPath })
    } catch (error) {
      console.error(`暂存文件失败: ${filePath}`, error)
      throw new Error(`暂存文件失败: ${filePath}`)
    }
  }

  // 暂存所有文件
  async stageAllFiles(projectPath: string): Promise<void> {
    try {
      await execAsync('git add .', { cwd: projectPath })
    } catch (error) {
      console.error('暂存所有文件失败:', error)
      throw new Error('暂存所有文件失败')
    }
  }

  // 取消暂存文件
  async unstageFile(projectPath: string, filePath: string): Promise<void> {
    try {
      await execAsync(`git reset HEAD "${filePath}"`, { cwd: projectPath })
    } catch (error) {
      console.error(`取消暂存文件失败: ${filePath}`, error)
      throw new Error(`取消暂存文件失败: ${filePath}`)
    }
  }

  // 提交
  async commit(projectPath: string, message: string): Promise<void> {
    try {
      if (!message.trim()) {
        throw new Error('提交信息不能为空')
      }
      
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: projectPath })
    } catch (error) {
      console.error('提交失败:', error)
      throw new Error('提交失败: ' + (error as Error).message)
    }
  }

  // 推送
  async push(projectPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    try {
      let command = `git push ${remote}`
      if (branch) {
        command += ` ${branch}`
      }
      
      await execAsync(command, { cwd: projectPath })
    } catch (error) {
      console.error('推送失败:', error)
      throw new Error('推送失败: ' + (error as Error).message)
    }
  }

  // 提交并推送
  async commitAndPush(projectPath: string, message: string, remote: string = 'origin', branch?: string): Promise<void> {
    try {
      await this.commit(projectPath, message)
      await this.push(projectPath, remote, branch)
    } catch (error) {
      console.error('提交并推送失败:', error)
      throw error
    }
  }

  // 获取提交历史
  async getCommitHistory(projectPath: string, limit: number = 20): Promise<GitCommit[]> {
    try {
      const { stdout } = await execAsync(
        `git log --oneline --format="%H|%s|%an|%ad|%h" --date=short -n ${limit}`,
        { cwd: projectPath }
      )
      
      const commits: GitCommit[] = []
      const lines = stdout.trim().split('\n').filter(line => line.trim())
      
      for (const line of lines) {
        const [hash, message, author, date, shortHash] = line.split('|')
        if (hash && message && author && date && shortHash) {
          commits.push({
            hash,
            message,
            author,
            date,
            shortHash
          })
        }
      }
      
      return commits
    } catch (error) {
      console.error('获取提交历史失败:', error)
      return []
    }
  }

  // 获取当前分支名
  async getCurrentBranch(projectPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath })
      return stdout.trim()
    } catch (error) {
      console.error('获取当前分支失败:', error)
      return 'main'
    }
  }

  // 检查是否有未提交的更改
  async hasUncommittedChanges(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath })
      return stdout.trim().length > 0
    } catch (error) {
      console.error('检查未提交更改失败:', error)
      return false
    }
  }

  // 获取远程URL
  async getRemoteUrl(projectPath: string, remote: string = 'origin'): Promise<string> {
    try {
      const { stdout } = await execAsync(`git remote get-url ${remote}`, { cwd: projectPath })
      return stdout.trim()
    } catch (error) {
      console.error(`获取远程URL失败 (${remote}):`, error)
      return ''
    }
  }
} 