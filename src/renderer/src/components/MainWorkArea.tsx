import React, { useState, useEffect } from 'react'
import { fileService, FileContent } from '../services/fileService'
import { configService } from '../services/configService'
import { llmService } from '../services/llmService'
import './MainWorkArea.css'

interface MainWorkAreaProps {
  activeFile: string | null
  onFileChange: (file: string | null) => void
}

const MainWorkArea: React.FC<MainWorkAreaProps> = ({ activeFile, onFileChange }) => {
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [translatedContent, setTranslatedContent] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadFileContent = async () => {
      if (!activeFile) {
        setFileContent(null)
        setTranslatedContent('')
        setHasUnsavedChanges(false)
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const config = configService.getConfig()
        const activeProject = config?.projects.find(p => p.path === config.activeProjectPath)
        
        if (!activeProject) {
          throw new Error('未找到活动项目')
        }

        const content = await fileService.getFileContent(
          activeProject.path,
          activeFile,
          activeProject.upstreamBranch,
          activeProject.workingBranch
        )

        setFileContent(content)
        setTranslatedContent(content.translated)
        setHasUnsavedChanges(false)
      } catch (err) {
        console.error('加载文件内容失败:', err)
        setError((err as Error).message)
        setFileContent(null)
        setTranslatedContent('')
        setHasUnsavedChanges(false)
      } finally {
        setIsLoading(false)
      }
    }

    loadFileContent()
  }, [activeFile])

  const handleTranslate = async () => {
    if (!fileContent) return
    
    setIsTranslating(true)
    try {
      const config = configService.getConfig()
      const activeProject = config?.projects.find(p => p.path === config.activeProjectPath)
      
      if (!activeProject) {
        throw new Error('未找到活动项目')
      }

      // 检查 LLM 配置
      if (!config?.llmConfig?.apiKey) {
        // 如果没有 API Key，使用模拟翻译
        setTimeout(() => {
          const translated = fileContent.original
            .replace(/OpenDoc Translate/g, 'OpenDoc Translate')
            .replace(/Getting Started/g, '开始使用')
            .replace(/API Reference/g, 'API 参考')
            .replace(/Authentication/g, '认证')
            .replace(/Endpoints/g, '端点')
            .replace(/Parameters/g, '参数')
            .replace(/Response/g, '响应')
          
          setTranslatedContent(translated)
          setHasUnsavedChanges(true)
          setIsTranslating(false)
        }, 2000)
        return
      }

      // 使用真实的 LLM 翻译
      const prompt = activeProject.customPrompt || config.globalPrompt
      const response = await llmService.translateText({
        content: fileContent.original,
        prompt
      })
      
      setTranslatedContent(response.translatedContent)
      setHasUnsavedChanges(true)
    } catch (error) {
      console.error('翻译失败:', error)
      alert('翻译失败: ' + (error as Error).message)
    } finally {
      setIsTranslating(false)
    }
  }

  const handleSave = async () => {
    if (!activeFile || !fileContent) return
    
    try {
      const config = configService.getConfig()
      const activeProject = config?.projects.find(p => p.path === config.activeProjectPath)
      
      if (!activeProject) {
        throw new Error('未找到活动项目')
      }

      await fileService.saveFileContent(
        activeProject.path,
        activeFile,
        translatedContent
      )

      setHasUnsavedChanges(false)
      console.log('文件保存成功:', activeFile)
    } catch (error) {
      console.error('保存文件失败:', error)
      alert('保存文件失败: ' + (error as Error).message)
    }
  }

  const handleContentChange = (content: string) => {
    setTranslatedContent(content)
    setHasUnsavedChanges(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'translated': return '#10b981'
      case 'outdated': return '#f59e0b'
      case 'untranslated': return '#6b7280'
      default: return '#6b7280'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'translated': return '🟢 已翻译'
      case 'outdated': return '🟡 已过时'
      case 'untranslated': return '⚪ 未翻译'
      default: return '⚪ 未翻译'
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'translated': return 'translated'
      case 'outdated': return 'outdated'
      case 'untranslated': return 'untranslated'
      default: return 'untranslated'
    }
  }

  const renderDiffHighlight = (content: string) => {
    if (!fileContent || fileContent.status !== 'outdated') {
      return content
    }

    // 简单的差异高亮模拟
    const lines = content.split('\n')
    return lines.map((line, index) => {
      const isChanged = line.includes('First Steps') || line.includes('Translation Workflow')
      return (
        <div key={index} className={`diff-line ${isChanged ? 'changed' : ''}`}>
          {line}
        </div>
      )
    }).join('\n')
  }

  if (!activeFile) {
    return (
      <div className="main-work-area">
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <h3>选择一个文件开始工作</h3>
          <p>从左侧文件树中选择一个文件来查看和编辑翻译</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="main-work-area">
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <h3>加载中...</h3>
          <p>正在加载文件内容</p>
        </div>
      </div>
    )
  }

  if (error || !fileContent) {
    return (
      <div className="main-work-area">
        <div className="empty-state">
          <div className="empty-icon">❌</div>
          <h3>文件加载失败</h3>
          <p>{error || `无法找到文件: ${activeFile}`}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="main-work-area">
      <div className="work-area-header">
        <div className="file-info">
          <span className="file-path">{activeFile}</span>
          <span 
            className={`file-status-badge ${getStatusClass(fileContent.status)}`}
          >
            {getStatusText(fileContent.status)}
          </span>
          {hasUnsavedChanges && <span className="unsaved-indicator">● 未保存</span>}
        </div>
        <div className="action-buttons">
          {fileContent.status === 'untranslated' && translatedContent === '' && (
            <button 
              className="btn btn-primary"
              onClick={handleTranslate}
              disabled={isTranslating}
            >
              {isTranslating ? '翻译中...' : '翻译此文件'}
            </button>
          )}
          {hasUnsavedChanges && (
            <button 
              className="btn btn-success"
              onClick={handleSave}
            >
              保存
            </button>
          )}
        </div>
      </div>

      <div className="diff-editor">
        <div className="editor-pane original-pane">
          <div className="pane-header">
            <h4>原文 (上游分支)</h4>
            {fileContent.status === 'outdated' && (
              <span className="diff-indicator">🔍 高亮显示更改</span>
            )}
          </div>
          <div className="editor-content">
            <pre className="code-content">
              {fileContent.status === 'outdated' 
                ? renderDiffHighlight(fileContent.original)
                : fileContent.original
              }
            </pre>
          </div>
        </div>

        <div className="editor-divider"></div>

        <div className="editor-pane translated-pane">
          <div className="pane-header">
            <h4>译文 (工作分支)</h4>
            {fileContent.status === 'untranslated' && translatedContent === '' && (
              <span className="empty-indicator">点击"翻译此文件"开始</span>
            )}
          </div>
          <div className="editor-content">
            {fileContent.status === 'untranslated' && translatedContent === '' ? (
              <div className="empty-editor">
                <div className="empty-editor-content">
                  <div className="empty-icon">📝</div>
                  <p>此文件尚未翻译</p>
                  <button 
                    className="btn btn-primary"
                    onClick={handleTranslate}
                    disabled={isTranslating}
                  >
                    {isTranslating ? '翻译中...' : '翻译此文件'}
                  </button>
                </div>
              </div>
            ) : (
              <textarea
                className="code-editor"
                value={translatedContent}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="翻译内容..."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainWorkArea 