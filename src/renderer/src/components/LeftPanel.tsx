import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { configService } from '../services/configService'
import { fileService, FileItem } from '../services/fileService'
import { gitService } from '../services/gitService'
import { AppConfig, ProjectConfig, PromptTemplate } from '../types/config'
import { GitFileStatus, GitCommit } from '../../../preload/index.d'
import TranslationDialog from './TranslationDialog'
import PromptTemplateDialog from './PromptTemplateDialog'
import './LeftPanel.css'

interface LeftPanelProps {
  activeTab: 'explorer' | 'git' | 'settings'
  onTabChange: (tab: 'explorer' | 'git' | 'settings') => void
  selectedFiles: string[]
  onSelectedFilesChange: (files: string[]) => void
  onFileSelect: (file: string) => void
}

interface LeftPanelRef {
  refreshFiles: () => void
}

const LeftPanel = forwardRef<LeftPanelRef, LeftPanelProps>(({
  activeTab,
  onTabChange,
  selectedFiles,
  onSelectedFilesChange,
  onFileSelect
}, ref) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'translated' | 'outdated' | 'untranslated'>('all')
  const [fileTypeFilter, setFileTypeFilter] = useState<string[]>([])
  const [fileNameFilter, setFileNameFilter] = useState<string>('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['docs', 'guides']))
  const [isTranslationDialogOpen, setIsTranslationDialogOpen] = useState(false)
  const [isPromptTemplateDialogOpen, setIsPromptTemplateDialogOpen] = useState(false)
  
  // 配置相关状态
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectConfig | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    apiKey: '',
    model: 'gpt-4',
    baseUrl: '',
    temperature: 0.3,
    maxTokens: 4000,
    concurrency: 3,
    globalPrompt: '',
    customPrompt: '',
    originUrl: '',
    upstreamUrl: '',
    watchDirectories: '',
    fileTypes: ''
  })
  const [isSaving, setIsSaving] = useState(false)

  // 文件树相关状态
  const [files, setFiles] = useState<FileItem[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)

  // Git相关状态
  const [gitStatus, setGitStatus] = useState<GitFileStatus[]>([])
  const [commitHistory, setCommitHistory] = useState<GitCommit[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [currentBranch, setCurrentBranch] = useState('')
  const [isLoadingGit, setIsLoadingGit] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)

  // 获取所有文件类型
  const getAllFileTypes = (): string[] => {
    const types = new Set<string>()
    const extractTypes = (items: FileItem[]) => {
      items.forEach(item => {
        if (item.children) {
          extractTypes(item.children)
        } else {
          const extension = item.name.split('.').pop()
          if (extension) {
            types.add(`.${extension}`)
          }
        }
      })
    }
    extractTypes(files)
    return Array.from(types).sort()
  }

  // 处理文件类型筛选
  const handleFileTypeToggle = (fileType: string) => {
    setFileTypeFilter(prev => {
      if (prev.includes(fileType)) {
        return prev.filter(type => type !== fileType)
      } else {
        return [...prev, fileType]
      }
    })
  }

  // 重置文件类型筛选
  const resetFileTypeFilter = () => {
    setFileTypeFilter([])
  }

  // 重置文件名筛选
  const resetFileNameFilter = () => {
    setFileNameFilter('')
  }

  // 获取所有文件夹路径
  const getAllFolderPaths = (items: FileItem[]): string[] => {
    const paths: string[] = []
    items.forEach(item => {
      if (item.children) {
        paths.push(item.path)
        paths.push(...getAllFolderPaths(item.children))
      }
    })
    return paths
  }

  // 加载文件树
  const loadFileTree = async (project: ProjectConfig) => {
    if (!project) return

    setIsLoadingFiles(true)
    try {
      const fileTree = await fileService.getFileTree(
        project.path,
        project.watchDirectories,
        project.fileTypes,
        project.upstreamBranch,
        project.workingBranch
      )
      setFiles(fileTree)
      
      // 自动展开所有文件夹
      const allFolderPaths = getAllFolderPaths(fileTree)
      setExpandedFolders(new Set(allFolderPaths))
    } catch (error) {
      console.error('加载文件树失败:', error)
      setFiles([])
    } finally {
      setIsLoadingFiles(false)
    }
  }

  // 同步文件状态
  const syncFileStatuses = async (project: ProjectConfig) => {
    if (!project) return

    setIsLoadingFiles(true)
    try {
      await fileService.syncFileStatuses(
        project.path,
        project.watchDirectories,
        project.fileTypes,
        project.upstreamBranch,
        project.workingBranch
      )
      // 重新加载文件树
      await loadFileTree(project)
    } catch (error) {
      console.error('同步文件状态失败:', error)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  // 加载Git状态
  const loadGitStatus = async (project: ProjectConfig) => {
    if (!project) return

    setIsLoadingGit(true)
    try {
      const [status, history, branch] = await Promise.all([
        gitService.getStatus(project.path),
        gitService.getCommitHistory(project.path, 10),
        gitService.getCurrentBranch(project.path)
      ])
      
      setGitStatus(status)
      setCommitHistory(history)
      setCurrentBranch(branch)
    } catch (error) {
      console.error('加载Git状态失败:', error)
    } finally {
      setIsLoadingGit(false)
    }
  }

  // 暂存文件
  const handleStageFile = async (filePath: string) => {
    if (!activeProject) return

    try {
      await gitService.stageFile(activeProject.path, filePath)
      await loadGitStatus(activeProject)
    } catch (error) {
      console.error('暂存文件失败:', error)
      alert('暂存文件失败: ' + (error as Error).message)
    }
  }

  // 暂存所有文件
  const handleStageAll = async () => {
    if (!activeProject) return

    try {
      await gitService.stageAll(activeProject.path)
      await loadGitStatus(activeProject)
    } catch (error) {
      console.error('暂存所有文件失败:', error)
      alert('暂存所有文件失败: ' + (error as Error).message)
    }
  }

  // 取消暂存文件
  const handleUnstageFile = async (filePath: string) => {
    if (!activeProject) return

    try {
      await gitService.unstageFile(activeProject.path, filePath)
      await loadGitStatus(activeProject)
    } catch (error) {
      console.error('取消暂存文件失败:', error)
      alert('取消暂存文件失败: ' + (error as Error).message)
    }
  }

  // 提交
  const handleCommit = async () => {
    if (!activeProject || !commitMessage.trim()) {
      alert('请输入提交信息')
      return
    }

    setIsCommitting(true)
    try {
      await gitService.commit(activeProject.path, commitMessage)
      setCommitMessage('')
      await loadGitStatus(activeProject)
      alert('提交成功')
    } catch (error) {
      console.error('提交失败:', error)
      alert('提交失败: ' + (error as Error).message)
    } finally {
      setIsCommitting(false)
    }
  }

  // 提交并推送
  const handleCommitAndPush = async () => {
    if (!activeProject || !commitMessage.trim()) {
      alert('请输入提交信息')
      return
    }

    setIsCommitting(true)
    try {
      await gitService.commitAndPush(activeProject.path, commitMessage, 'origin', currentBranch)
      setCommitMessage('')
      await loadGitStatus(activeProject)
      alert('提交并推送成功')
    } catch (error) {
      console.error('提交并推送失败:', error)
      alert('提交并推送失败: ' + (error as Error).message)
    } finally {
      setIsCommitting(false)
    }
  }

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    refreshFiles: () => {
      if (activeProject) {
        syncFileStatuses(activeProject)
        loadGitStatus(activeProject)
      }
    }
  }))

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        await configService.loadConfig()
        const loadedConfig = configService.getConfig()
        if (loadedConfig) {
          setConfig(loadedConfig)
          setSettingsForm(prev => ({
            ...prev,
            apiKey: loadedConfig.llmConfig.apiKey,
            model: loadedConfig.llmConfig.model,
            baseUrl: loadedConfig.llmConfig.baseUrl || '',
            temperature: loadedConfig.llmConfig.temperature || 0.3,
            maxTokens: loadedConfig.llmConfig.maxTokens || 4000,
            concurrency: loadedConfig.llmConfig.concurrency || 3,
            globalPrompt: loadedConfig.globalPrompt
          }))
        }
      } catch (error) {
        console.error('加载配置失败:', error)
      }
    }

    loadConfig()

    // 监听配置变化
    const unsubscribe = configService.onConfigChange(async (newConfig) => {
      setConfig(newConfig)
      setSettingsForm(prev => ({
        ...prev,
        apiKey: newConfig.llmConfig.apiKey,
        model: newConfig.llmConfig.model,
        baseUrl: newConfig.llmConfig.baseUrl || '',
        temperature: newConfig.llmConfig.temperature || 0.3,
        maxTokens: newConfig.llmConfig.maxTokens || 4000,
        concurrency: newConfig.llmConfig.concurrency || 3,
        globalPrompt: newConfig.globalPrompt
      }))
      
      // 更新当前活动项目
      if (newConfig.activeProjectPath) {
        const active = newConfig.projects.find(p => p.path === newConfig.activeProjectPath)
        if (active) {
          setActiveProject(active)
          setSettingsForm(prev => ({
            ...prev,
            customPrompt: active.customPrompt || '',
            originUrl: active.originUrl,
            upstreamUrl: active.upstreamUrl,
            watchDirectories: active.watchDirectories.join(', '),
            fileTypes: active.fileTypes.join(', ')
          }))
          
          // 加载文件树
          await loadFileTree(active)
        }
      } else {
        setActiveProject(null)
        setFiles([])
      }
    })

    return unsubscribe
  }, [])

  // 监听项目变化，自动加载文件树
  useEffect(() => {
    if (activeProject) {
      loadFileTree(activeProject)
      loadGitStatus(activeProject)
    }
  }, [activeProject])

  const handleSaveSettings = async () => {
    if (!config) return

    setIsSaving(true)
    try {
      // 更新全局配置
      const updatedConfig: AppConfig = {
        ...config,
        llmConfig: {
          apiKey: settingsForm.apiKey,
          model: settingsForm.model,
          baseUrl: settingsForm.baseUrl,
          temperature: settingsForm.temperature,
          maxTokens: settingsForm.maxTokens,
          concurrency: settingsForm.concurrency
        },
        globalPrompt: settingsForm.globalPrompt
      }

      await configService.saveConfig(updatedConfig)

      // 如果有活动项目，更新项目配置
      if (activeProject) {
        const projectUpdates: Partial<ProjectConfig> = {
          customPrompt: settingsForm.customPrompt || undefined,
          originUrl: settingsForm.originUrl,
          upstreamUrl: settingsForm.upstreamUrl,
          watchDirectories: settingsForm.watchDirectories.split(',').map(s => s.trim()).filter(Boolean),
          fileTypes: settingsForm.fileTypes.split(',').map(s => s.trim()).filter(Boolean)
        }

        await configService.updateProject(activeProject.path, projectUpdates)
      }

      alert('设置保存成功')
    } catch (error) {
      console.error('保存设置失败:', error)
      alert('保存设置失败: ' + (error as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleFormChange = (field: keyof typeof settingsForm, value: string) => {
    setSettingsForm(prev => ({
      ...prev,
      [field]: field === 'temperature' ? parseFloat(value) || 0.3 : 
               field === 'maxTokens' ? parseInt(value) || 32000 : 
               field === 'concurrency' ? parseInt(value) || 3 : 
               value
    }))
  }

  const handleRefreshFiles = async () => {
    if (activeProject) {
      await syncFileStatuses(activeProject)
    }
  }

  const handleOpenTranslationDialog = () => {
    setIsTranslationDialogOpen(true)
  }

  const handleCloseTranslationDialog = () => {
    setIsTranslationDialogOpen(false)
    // 翻译完成后刷新文件树
    if (activeProject) {
      loadFileTree(activeProject)
    }
  }

  const handleOpenPromptTemplateDialog = () => {
    setIsPromptTemplateDialogOpen(true)
  }

  const handleClosePromptTemplateDialog = () => {
    setIsPromptTemplateDialogOpen(false)
  }

  const handleSelectTemplate = (template: PromptTemplate) => {
    // 根据当前是否有活动项目，选择更新全局提示词还是项目提示词
    if (activeProject) {
      setSettingsForm(prev => ({
        ...prev,
        customPrompt: template.content
      }))
    } else {
      setSettingsForm(prev => ({
        ...prev,
        globalPrompt: template.content
      }))
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'translated': return '🟢'
      case 'outdated': return '🟡'
      case 'untranslated': return '⚪'
      default: return '⚪'
    }
  }

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const handleFileSelect = (file: FileItem, isCtrlClick: boolean = false) => {
    if (file.children) {
      toggleFolder(file.path)
      return
    }

    if (isCtrlClick) {
      const newSelected = selectedFiles.includes(file.path)
        ? selectedFiles.filter(f => f !== file.path)
        : [...selectedFiles, file.path]
      onSelectedFilesChange(newSelected)
    } else {
      onFileSelect(file.path)
    }
  }

  const handleTranslateSelected = () => {
    if (selectedFiles.length === 0) return
    console.log('翻译选中文件:', selectedFiles)
  }

  const filterFiles = (files: FileItem[]): FileItem[] => {
    return files.filter(file => {
      if (file.children) {
        const filteredChildren = filterFiles(file.children)
        return filteredChildren.length > 0
      }
      
      // 状态筛选
      const statusMatch = statusFilter === 'all' || file.status === statusFilter
      
      // 文件类型筛选
      const fileExtension = file.name.split('.').pop()
      const typeMatch = fileTypeFilter.length === 0 || 
        (fileExtension && fileTypeFilter.includes(`.${fileExtension}`))
      
      // 文件名筛选 - 支持多个关键词用逗号分隔
      let nameMatch = true
      if (fileNameFilter.trim()) {
        const keywords = fileNameFilter.split(',').map(keyword => keyword.trim().toLowerCase()).filter(keyword => keyword)
        nameMatch = keywords.some(keyword => file.name.toLowerCase().includes(keyword))
      }
      
      return statusMatch && typeMatch && nameMatch
    }).map(file => ({
      ...file,
      children: file.children ? filterFiles(file.children) : undefined
    }))
  }

  const renderFileTree = (files: FileItem[], level = 0) => {
    return files.map(file => (
      <div key={file.path} className="file-item-container">
        <div 
          className={`file-item ${selectedFiles.includes(file.path) ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={(e) => handleFileSelect(file, e.ctrlKey)}
        >
          {file.children && (
            <span 
              className={`folder-icon ${expandedFolders.has(file.path) ? 'expanded' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(file.path)
              }}
            >
              {expandedFolders.has(file.path) ? '📂' : '📁'}
            </span>
          )}
          {!file.children && <span className="file-status">{getStatusIcon(file.status)}</span>}
          <span className="file-name">{file.name}</span>
          {file.modified && <span className="modified-indicator">M</span>}
        </div>
        {file.children && expandedFolders.has(file.path) && (
          <div className="file-children">
            {renderFileTree(file.children, level + 1)}
          </div>
        )}
      </div>
    ))
  }

  const renderExplorer = () => {
    const availableFileTypes = getAllFileTypes()
    
    return (
      <div className="explorer-content">
        <div className="filter-section">
          <div className="filter-buttons">
            <button 
              className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              全部
            </button>
            <button 
              className={`btn btn-sm ${statusFilter === 'translated' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('translated')}
            >
              🟢 已翻译
            </button>
            <button 
              className={`btn btn-sm ${statusFilter === 'outdated' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('outdated')}
            >
              🟡 已过时
            </button>
            <button 
              className={`btn btn-sm ${statusFilter === 'untranslated' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('untranslated')}
            >
              ⚪ 未翻译
            </button>
          </div>
          
          {availableFileTypes.length > 0 && (
            <div className="file-type-filter">
              <label>文件类型:</label>
              <div className="file-type-options">
                {availableFileTypes.map(fileType => (
                  <label key={fileType} className="file-type-option">
                    <input
                      type="checkbox"
                      checked={fileTypeFilter.includes(fileType)}
                      onChange={() => handleFileTypeToggle(fileType)}
                    />
                    <span className="file-type-label">{fileType}</span>
                  </label>
                ))}
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={resetFileTypeFilter}
                  title="重置文件类型筛选"
                >
                  重置
                </button>
              </div>
              {fileTypeFilter.length > 0 && (
                <div className="selected-types">
                  已选择: {fileTypeFilter.join(', ')}
                </div>
              )}
            </div>
          )}
          
          <div className="file-name-filter">
            <label>文件名筛选:</label>
            <div className="name-filter-inputs">
              <input
                type="text"
                placeholder="输入文件名关键词，多个用逗号分隔"
                value={fileNameFilter}
                onChange={(e) => setFileNameFilter(e.target.value)}
                className="name-input"
              />
              <button 
                className="btn btn-sm btn-secondary"
                onClick={resetFileNameFilter}
                title="重置文件名筛选"
              >
                重置
              </button>
            </div>
            {fileNameFilter.trim() && (
              <div className="filter-hint">
                搜索关键词: {fileNameFilter.split(',').map(keyword => keyword.trim()).filter(keyword => keyword).join(', ')}
              </div>
            )}
          </div>
          
          <div className="action-buttons">
            <button 
              className="btn btn-sm refresh-btn"
              onClick={handleRefreshFiles}
              disabled={isLoadingFiles || !activeProject}
            >
              {isLoadingFiles ? '刷新中...' : '刷新'}
            </button>
            <button 
              className="btn btn-primary btn-sm translate-btn"
              onClick={handleOpenTranslationDialog}
              disabled={!activeProject || isLoadingFiles}
            >
              📝 批量翻译
            </button>
            {selectedFiles.length > 0 && (
              <button 
                className="btn btn-success btn-sm translate-btn"
                onClick={handleTranslateSelected}
              >
                翻译选中文件 ({selectedFiles.length})
              </button>
            )}
          </div>
        </div>
        <div className="file-tree">
          {isLoadingFiles ? (
            <div className="loading-state">
              <div className="loading-spinner">⏳</div>
              <p>加载文件中...</p>
            </div>
          ) : !activeProject ? (
            <div className="empty-state">
              <p>请先选择一个项目</p>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <p>未找到符合条件的文件</p>
            </div>
          ) : (
            renderFileTree(filterFiles(files))
          )}
        </div>
      </div>
    )
  }

  const renderGit = () => {
    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'M': return '📝' // 修改
        case 'A': return '➕' // 添加
        case 'D': return '🗑️' // 删除
        case 'R': return '🔄' // 重命名
        case 'C': return '📋' // 复制
        case 'U': return '❓' // 未合并
        case '??': return '❔' // 未跟踪
        default: return '📄'
      }
    }

    const getStatusText = (status: string) => {
      switch (status) {
        case 'M': return '已修改'
        case 'A': return '已添加'
        case 'D': return '已删除'
        case 'R': return '已重命名'
        case 'C': return '已复制'
        case 'U': return '未合并'
        case '??': return '未跟踪'
        default: return '未知'
      }
    }

    const stagedFiles = gitStatus.filter(file => file.staged)
    const unstagedFiles = gitStatus.filter(file => !file.staged)

    return (
      <div className="git-content">
        {/* 分支信息 */}
        <div className="git-section">
          <h3>当前分支: {currentBranch}</h3>
          {isLoadingGit && <div className="loading-indicator">🔄 加载中...</div>}
        </div>

        {/* 暂存区 */}
        <div className="git-section">
          <h3>暂存的更改 ({stagedFiles.length})</h3>
          {stagedFiles.length > 0 ? (
            <div className="changed-files">
              {stagedFiles.map(file => (
                <div key={file.path} className="changed-file">
                  <span className="file-status" title={getStatusText(file.status)}>
                    {getStatusIcon(file.status)}
                  </span>
                  <span className="file-name" title={file.path}>{file.path}</span>
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleUnstageFile(file.path)}
                    disabled={isLoadingGit}
                  >
                    取消暂存
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>没有暂存的更改</p>
            </div>
          )}
        </div>

        {/* 工作区更改 */}
        <div className="git-section">
          <h3>工作区更改 ({unstagedFiles.length})</h3>
          {unstagedFiles.length > 0 ? (
            <>
              <div className="changed-files">
                {unstagedFiles.map(file => (
                  <div key={file.path} className="changed-file">
                    <span className="file-status" title={getStatusText(file.status)}>
                      {getStatusIcon(file.status)}
                    </span>
                    <span className="file-name" title={file.path}>{file.path}</span>
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={() => handleStageFile(file.path)}
                      disabled={isLoadingGit}
                    >
                      暂存
                    </button>
                  </div>
                ))}
              </div>
              <button 
                className="btn btn-sm btn-primary stage-all-btn"
                onClick={handleStageAll}
                disabled={isLoadingGit}
              >
                全部暂存
              </button>
            </>
          ) : (
            <div className="empty-state">
              <p>工作区很干净</p>
            </div>
          )}
        </div>

        {/* 提交区 */}
        <div className="git-section">
          <h3>提交与推送</h3>
          <textarea 
            className="commit-message"
            placeholder="输入提交信息..."
            rows={3}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            disabled={isCommitting}
          />
          <div className="commit-buttons">
            <button 
              className="btn btn-success"
              onClick={handleCommit}
              disabled={isCommitting || stagedFiles.length === 0 || !commitMessage.trim()}
            >
              {isCommitting ? '提交中...' : '提交'}
            </button>
            <button 
              className="btn btn-success commit-push-btn"
              onClick={handleCommitAndPush}
              disabled={isCommitting || stagedFiles.length === 0 || !commitMessage.trim()}
            >
              {isCommitting ? '提交推送中...' : '提交并推送'}
            </button>
          </div>
        </div>

        {/* 提交历史 */}
        <div className="git-section">
          <h3>提交历史</h3>
          {commitHistory.length > 0 ? (
            <div className="commit-history">
              {commitHistory.map(commit => (
                <div key={commit.hash} className="commit-item">
                  <div className="commit-header">
                    <span className="commit-hash">{commit.shortHash}</span>
                    <span className="commit-date">{commit.date}</span>
                  </div>
                  <div className="commit-message">{commit.message}</div>
                  <div className="commit-author">by {commit.author}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>没有提交历史</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderSettings = () => (
    <div className="settings-content">
      <div className="settings-section">
        <h3>LLM 服务配置</h3>
        <div className="setting-item">
          <label>API Key:</label>
          <input 
            type="password" 
            className="input" 
            placeholder="输入API Key"
            value={settingsForm.apiKey}
            onChange={(e) => handleFormChange('apiKey', e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>模型选择:</label>
          <input 
            type="text" 
            className="input"
            placeholder="输入模型名称，如：gpt-4, claude-3-opus"
            value={settingsForm.model}
            onChange={(e) => handleFormChange('model', e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>Base URL:</label>
          <input 
            type="text" 
            className="input" 
            placeholder="https://openrouter.ai/api/v1"
            value={settingsForm.baseUrl}
            onChange={(e) => handleFormChange('baseUrl', e.target.value)}
          />
        </div>
        <div className="setting-item">
          <label>Temperature:</label>
          <input 
            type="number" 
            className="input"
            placeholder="0.3"
            min="0"
            max="2"
            step="0.1"
            value={settingsForm.temperature}
            onChange={(e) => handleFormChange('temperature', e.target.value)}
          />
          <small className="help-text">
            控制输出的随机性，0-2之间，值越小输出越确定
          </small>
        </div>
        <div className="setting-item">
          <label>Max Tokens:</label>
          <input 
            type="number" 
            className="input"
            placeholder="4000"
            min="1"
            max="32000"
            value={settingsForm.maxTokens}
            onChange={(e) => handleFormChange('maxTokens', e.target.value)}
          />
          <small className="help-text">
            最大输出token数量，控制回复长度
          </small>
        </div>
        <div className="setting-item">
          <label>Concurrency:</label>
          <input 
            type="number" 
            className="input"
            placeholder="3"
            min="1"
            max="10"
            value={settingsForm.concurrency}
            onChange={(e) => handleFormChange('concurrency', e.target.value)}
          />
          <small className="help-text">
            并发翻译任务数量，控制同时翻译的文件数量
          </small>
        </div>
      </div>

      <div className="settings-section">
        <h3>翻译提示词</h3>
        <div className="prompt-template-actions">
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleOpenPromptTemplateDialog}
          >
            📝 管理提示词模板
          </button>
        </div>
        <div className="setting-item">
          <label>全局提示词:</label>
          <textarea 
            className="prompt-textarea"
            placeholder="输入全局翻译提示词..."
            rows={4}
            value={settingsForm.globalPrompt}
            onChange={(e) => handleFormChange('globalPrompt', e.target.value)}
          />
        </div>
        {activeProject && (
          <div className="setting-item">
            <label>项目自定义提示词:</label>
            <textarea 
              className="prompt-textarea"
              placeholder="为当前项目设置专属提示词（可选）..."
              rows={3}
              value={settingsForm.customPrompt}
              onChange={(e) => handleFormChange('customPrompt', e.target.value)}
            />
            <small className="help-text">
              如果设置了项目自定义提示词，将覆盖全局提示词
            </small>
          </div>
        )}
      </div>

      {activeProject && (
        <div className="settings-section">
          <h3>项目配置</h3>
          <div className="project-name">
            <strong>当前项目: {activeProject.name}</strong>
          </div>
          <div className="setting-item">
            <label>Origin URL:</label>
            <input 
              type="text" 
              className="input" 
              placeholder="https://github.com/user/repo.git"
              value={settingsForm.originUrl}
              onChange={(e) => handleFormChange('originUrl', e.target.value)}
            />
          </div>
          <div className="setting-item">
            <label>Upstream URL:</label>
            <input 
              type="text" 
              className="input" 
              placeholder="https://github.com/original/repo.git"
              value={settingsForm.upstreamUrl}
              onChange={(e) => handleFormChange('upstreamUrl', e.target.value)}
            />
          </div>
          <div className="setting-item">
            <label>监听目录:</label>
            <input 
              type="text" 
              className="input" 
              placeholder="留空则扫描整个项目（如：docs, guides）"
              value={settingsForm.watchDirectories}
              onChange={(e) => handleFormChange('watchDirectories', e.target.value)}
            />
            <small className="help-text">
              用逗号分隔多个目录，留空则扫描整个项目。会自动使用项目下的.gitignore文件排除不需要的文件和目录。
            </small>
          </div>
          <div className="setting-item">
            <label>文件类型:</label>
            <input 
              type="text" 
              className="input" 
              placeholder=".md, .mdx, .txt"
              value={settingsForm.fileTypes}
              onChange={(e) => handleFormChange('fileTypes', e.target.value)}
            />
            <small className="help-text">用逗号分隔多个文件类型</small>
          </div>
        </div>
      )}

      <div className="settings-actions">
        <button 
          className="btn btn-primary"
          onClick={handleSaveSettings}
          disabled={isSaving}
        >
          {isSaving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="left-panel">
      <div className="panel-tabs">
        <button 
          className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
          onClick={() => onTabChange('explorer')}
        >
          📁 文件树
        </button>
        <button 
          className={`tab-btn ${activeTab === 'git' ? 'active' : ''}`}
          onClick={() => onTabChange('git')}
        >
          🔄 Git
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          ⚙️ 设置
        </button>
      </div>
      
      <div className="panel-content">
        {activeTab === 'explorer' && renderExplorer()}
        {activeTab === 'git' && renderGit()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {/* 翻译对话框 */}
      <TranslationDialog
        isOpen={isTranslationDialogOpen}
        onClose={handleCloseTranslationDialog}
        files={files}
        projectPath={activeProject?.path || ''}
        upstreamBranch={activeProject?.upstreamBranch || 'main'}
        workingBranch={activeProject?.workingBranch || 'main'}
      />

      {/* 提示词模板对话框 */}
      <PromptTemplateDialog
        isOpen={isPromptTemplateDialogOpen}
        onClose={handleClosePromptTemplateDialog}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  )
})

LeftPanel.displayName = 'LeftPanel'

export default LeftPanel 