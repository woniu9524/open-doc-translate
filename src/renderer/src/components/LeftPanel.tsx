import React, { useState, useEffect } from 'react'
import { configService } from '../services/configService'
import { AppConfig, ProjectConfig } from '../types/config'
import './LeftPanel.css'

interface LeftPanelProps {
  activeTab: 'explorer' | 'git' | 'settings'
  onTabChange: (tab: 'explorer' | 'git' | 'settings') => void
  selectedFiles: string[]
  onSelectedFilesChange: (files: string[]) => void
  onFileSelect: (file: string) => void
}

interface FileItem {
  name: string
  path: string
  status: 'translated' | 'outdated' | 'untranslated'
  modified?: boolean
  children?: FileItem[]
}

const mockFiles: FileItem[] = [
  {
    name: 'docs',
    path: 'docs',
    status: 'translated',
    children: [
      { name: 'README.md', path: 'docs/README.md', status: 'translated' },
      { name: 'getting-started.md', path: 'docs/getting-started.md', status: 'outdated', modified: true },
      { name: 'api.md', path: 'docs/api.md', status: 'untranslated' },
    ]
  },
  {
    name: 'guides',
    path: 'guides',
    status: 'outdated',
    children: [
      { name: 'installation.md', path: 'guides/installation.md', status: 'translated' },
      { name: 'configuration.md', path: 'guides/configuration.md', status: 'untranslated' },
    ]
  }
]

const LeftPanel: React.FC<LeftPanelProps> = ({
  activeTab,
  onTabChange,
  selectedFiles,
  onSelectedFilesChange,
  onFileSelect
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'translated' | 'outdated' | 'untranslated'>('all')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['docs', 'guides']))
  
  // 配置相关状态
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectConfig | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    apiKey: '',
    model: 'gpt-4',
    baseUrl: '',
    globalPrompt: '',
    customPrompt: '',
    originUrl: '',
    upstreamUrl: '',
    watchDirectories: '',
    fileTypes: ''
  })
  const [isSaving, setIsSaving] = useState(false)

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
            globalPrompt: loadedConfig.globalPrompt
          }))
        }
      } catch (error) {
        console.error('加载配置失败:', error)
      }
    }

    loadConfig()

    // 监听配置变化
    const unsubscribe = configService.onConfigChange((newConfig) => {
      setConfig(newConfig)
      setSettingsForm(prev => ({
        ...prev,
        apiKey: newConfig.llmConfig.apiKey,
        model: newConfig.llmConfig.model,
        baseUrl: newConfig.llmConfig.baseUrl || '',
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
        }
      } else {
        setActiveProject(null)
      }
    })

    return unsubscribe
  }, [])

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
          baseUrl: settingsForm.baseUrl
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
      [field]: value
    }))
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
    if (statusFilter === 'all') return files
    return files.filter(file => {
      if (file.children) {
        const filteredChildren = filterFiles(file.children)
        return filteredChildren.length > 0
      }
      return file.status === statusFilter
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
            <span className={`folder-icon ${expandedFolders.has(file.path) ? 'expanded' : ''}`}>
              ▶
            </span>
          )}
          <span className="file-status">{getStatusIcon(file.status)}</span>
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

  const renderExplorer = () => (
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
        {selectedFiles.length > 0 && (
          <button 
            className="btn btn-success btn-sm translate-btn"
            onClick={handleTranslateSelected}
          >
            翻译选中文件 ({selectedFiles.length})
          </button>
        )}
      </div>
      <div className="file-tree">
        {renderFileTree(filterFiles(mockFiles))}
      </div>
    </div>
  )

  const renderGit = () => (
    <div className="git-content">
      <div className="git-section">
        <h3>变更列表</h3>
        <div className="changed-files">
          <div className="changed-file">
            <span className="file-status">🟡</span>
            <span className="file-name">docs/getting-started.md</span>
            <button className="btn btn-sm">暂存</button>
          </div>
          <div className="changed-file">
            <span className="file-status">🟢</span>
            <span className="file-name">docs/api.md</span>
            <button className="btn btn-sm">暂存</button>
          </div>
        </div>
        <button className="btn btn-sm stage-all-btn">全部暂存</button>
      </div>
      
      <div className="git-section">
        <h3>提交与推送</h3>
        <textarea 
          className="commit-message"
          placeholder="输入提交信息..."
          rows={3}
        />
        <button className="btn btn-success commit-push-btn">
          提交并推送
        </button>
      </div>
    </div>
  )

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
      </div>

      <div className="settings-section">
        <h3>翻译提示词</h3>
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
              placeholder="docs, guides"
              value={settingsForm.watchDirectories}
              onChange={(e) => handleFormChange('watchDirectories', e.target.value)}
            />
            <small className="help-text">用逗号分隔多个目录</small>
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
    </div>
  )
}

export default LeftPanel 