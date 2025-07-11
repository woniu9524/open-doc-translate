import React, { useState, useEffect } from 'react'
import { configService } from '../services/configService'
import { fileService } from '../services/fileService'
import { gitService } from '../services/gitService'
import { ProjectConfig } from '../types/config'
import './TopToolbar.css'

interface TopToolbarProps {
  onFileTreeRefresh?: () => void
}

const TopToolbar: React.FC<TopToolbarProps> = ({ onFileTreeRefresh }) => {
  const [projects, setProjects] = useState<ProjectConfig[]>([])
  const [activeProject, setActiveProject] = useState<ProjectConfig | null>(null)
  const [upstreamBranch, setUpstreamBranch] = useState<string>('main')
  const [workingBranch, setWorkingBranch] = useState<string>('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [branches, setBranches] = useState<{ local: string[], remote: string[] }>({ local: [], remote: [] })
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)

  // 加载分支列表
  const loadBranches = async (projectPath: string) => {
    if (!projectPath) return
    
    setIsLoadingBranches(true)
    try {
      const branchData = await configService.getBranches(projectPath)
      setBranches(branchData)
    } catch (error) {
      console.error('加载分支列表失败:', error)
      setBranches({ local: ['main', 'master'], remote: ['main', 'master'] })
    } finally {
      setIsLoadingBranches(false)
    }
  }

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        await configService.loadConfig()
        const config = configService.getConfig()
        if (config) {
          setProjects(config.projects)
          if (config.activeProjectPath) {
            const active = config.projects.find(p => p.path === config.activeProjectPath)
            if (active) {
              setActiveProject(active)
              setUpstreamBranch(active.upstreamBranch)
              setWorkingBranch(active.workingBranch)
              await loadBranches(active.path)
            }
          }
        }
      } catch (error) {
        console.error('加载配置失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()

    // 监听配置变化
    const unsubscribe = configService.onConfigChange(async (config) => {
      setProjects(config.projects)
      if (config.activeProjectPath) {
        const active = config.projects.find(p => p.path === config.activeProjectPath)
        if (active) {
          setActiveProject(active)
          setUpstreamBranch(active.upstreamBranch)
          setWorkingBranch(active.workingBranch)
          await loadBranches(active.path)
        }
      } else {
        setActiveProject(null)
        setBranches({ local: [], remote: [] })
      }
    })

    return unsubscribe
  }, [])

  const handleAddProject = async () => {
    try {
      const newProject = await configService.addProject()
      if (newProject) {
        console.log('项目添加成功:', newProject.name)
        // 自动切换到新添加的项目
        await handleProjectChange(newProject.path)
      }
    } catch (error) {
      console.error('添加项目失败:', error)
      alert('添加项目失败: ' + (error as Error).message)
    }
  }

  const handleProjectChange = async (projectPath: string) => {
    if (!projectPath) {
      setActiveProject(null)
      setBranches({ local: [], remote: [] })
      return
    }

    try {
      // 清除之前项目的缓存
      if (activeProject) {
        await fileService.clearProjectCache(activeProject.path)
      }
      
      await configService.setActiveProject(projectPath)
      const project = projects.find(p => p.path === projectPath)
      if (project) {
        setActiveProject(project)
        setUpstreamBranch(project.upstreamBranch)
        setWorkingBranch(project.workingBranch)
        await loadBranches(project.path)
      }
    } catch (error) {
      console.error('切换项目失败:', error)
    }
  }

  const handleUpstreamBranchChange = async (branch: string) => {
    setUpstreamBranch(branch)
    if (activeProject) {
      try {
        // 清除分支相关缓存
        await fileService.clearBranchCache(activeProject.path, activeProject.workingBranch, activeProject.upstreamBranch)
        
        await configService.updateProject(activeProject.path, {
          upstreamBranch: branch
        })
        
        // 通知文件树刷新
        if (onFileTreeRefresh) {
          onFileTreeRefresh()
        }
      } catch (error) {
        console.error('更新上游分支失败:', error)
      }
    }
  }

  const handleWorkingBranchChange = async (branch: string) => {
    if (!activeProject) return
    
    // 检查是否有未提交的修改
    try {
      const hasUncommitted = await gitService.hasUncommittedChanges(activeProject.path)
      if (hasUncommitted) {
        const shouldContinue = confirm(
          `当前工作区有未提交的修改，切换分支可能会丢失这些修改。\n\n` +
          `建议您先：\n` +
          `1. 提交当前修改（推荐）\n` +
          `2. 或暂存当前修改\n\n` +
          `是否仍要强制切换分支？`
        )
        if (!shouldContinue) {
          return
        }
      }
    } catch (error) {
      console.error('检查未提交修改失败:', error)
      // 如果检查失败，询问用户是否继续
      const shouldContinue = confirm(
        `无法检查当前工作区的修改状态。\n\n` +
        `这可能是因为：\n` +
        `1. Git 仓库状态异常\n` +
        `2. 权限问题\n\n` +
        `是否继续切换分支？`
      )
      if (!shouldContinue) {
        return
      }
    }

    setWorkingBranch(branch)
    try {
      // 清除分支相关缓存
      await fileService.clearBranchCache(activeProject.path, activeProject.workingBranch, activeProject.upstreamBranch)
      
      // 先切换Git分支
      await configService.checkoutBranch(activeProject.path, branch)
      
      // 然后更新配置
      await configService.updateProject(activeProject.path, {
        workingBranch: branch
      })
      
      // 通知文件树刷新
      if (onFileTreeRefresh) {
        onFileTreeRefresh()
      }
      
      console.log(`成功切换到分支: ${branch}`)
    } catch (error) {
      console.error('切换工作分支失败:', error)
      alert('切换工作分支失败: ' + (error as Error).message)
      
      // 如果切换失败，恢复到之前的分支选择
      const project = activeProject
      if (project) {
        setWorkingBranch(project.workingBranch)
      }
    }
  }

  const handleSync = async () => {
    if (!activeProject) {
      alert('请先选择一个项目')
      return
    }

    setIsSyncing(true)
    try {
      // 执行 git fetch upstream 拉取上游分支
      await configService.fetchUpstream(activeProject.path)
      
      // 同步完成后重新加载分支列表
      await loadBranches(activeProject.path)
      
      // 同步文件状态
      await fileService.syncFileStatuses(
        activeProject.path,
        activeProject.watchDirectories,
        activeProject.fileTypes,
        activeProject.upstreamBranch,
        activeProject.workingBranch
      )
      
      // 通知文件树刷新
      if (onFileTreeRefresh) {
        onFileTreeRefresh()
      }
      
      console.log('拉取上游分支完成')
    } catch (error) {
      console.error('拉取上游分支失败:', error)
      alert('拉取上游分支失败: ' + (error as Error).message)
    } finally {
      setIsSyncing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="top-toolbar">
        <div className="toolbar-section">
          <span>加载中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="top-toolbar">
      <div className="toolbar-section">
        <label className="toolbar-label">项目:</label>
        <div className="project-selector">
          <select 
            className="select project-select" 
            value={activeProject?.path || ''}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            <option value="">选择项目...</option>
            {projects.map(project => (
              <option key={project.path} value={project.path}>
                {project.name}
              </option>
            ))}
          </select>
          <button 
            className="btn btn-sm add-project-btn" 
            onClick={handleAddProject}
            title="添加项目"
          >
            +
          </button>
        </div>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-section">
        <label className="toolbar-label">上游分支:</label>
        <select 
          className="select branch-select" 
          value={upstreamBranch}
          onChange={(e) => handleUpstreamBranchChange(e.target.value)}
          disabled={!activeProject || isLoadingBranches}
        >
          {isLoadingBranches ? (
            <option value="">加载中...</option>
          ) : (
            <>
              {branches.remote.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
              {branches.remote.length === 0 && (
                <>
                  <option value="main">main</option>
                  <option value="master">master</option>
                  <option value="develop">develop</option>
                </>
              )}
            </>
          )}
        </select>
      </div>

      <div className="toolbar-section">
        <label className="toolbar-label">工作分支:</label>
        <select 
          className="select branch-select" 
          value={workingBranch}
          onChange={(e) => handleWorkingBranchChange(e.target.value)}
          disabled={!activeProject || isLoadingBranches}
        >
          {isLoadingBranches ? (
            <option value="">加载中...</option>
          ) : (
            <>
              {branches.local.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
              {branches.local.length === 0 && (
                <>
                  <option value="main">main</option>
                  <option value="master">master</option>
                  <option value="develop">develop</option>
                </>
              )}
            </>
          )}
        </select>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-section">
        <button 
          className={`btn sync-btn ${isSyncing ? 'syncing' : ''}`}
          onClick={handleSync}
          disabled={isSyncing || !activeProject}
        >
          {isSyncing ? '拉取中...' : '拉取上游'}
        </button>
      </div>

      {activeProject && (
        <div className="toolbar-section project-info">
          <span className="project-path" title={activeProject.path}>
            {activeProject.name}
          </span>
        </div>
      )}
    </div>
  )
}

export default TopToolbar 