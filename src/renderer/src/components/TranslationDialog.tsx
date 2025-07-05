import React, { useState, useEffect } from 'react'
import { FileItem } from '../services/fileService'
import { configService } from '../services/configService'
import { fileService } from '../services/fileService'
import './TranslationDialog.css'

interface TranslationDialogProps {
  isOpen: boolean
  onClose: () => void
  files: FileItem[]
  projectPath: string
  upstreamBranch: string
  workingBranch: string
}

interface TranslationProgress {
  total: number
  completed: number
  failed: number
  current: string
  isTranslating: boolean
  results: { [filePath: string]: { success: boolean; error?: string } }
}

const TranslationDialog: React.FC<TranslationDialogProps> = ({
  isOpen,
  onClose,
  files,
  projectPath,
  upstreamBranch,
  workingBranch
}) => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'translated' | 'outdated' | 'untranslated'>('all')
  const [progress, setProgress] = useState<TranslationProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current: '',
    isTranslating: false,
    results: {}
  })

  // 过滤文件
  const getFilteredFiles = (): FileItem[] => {
    const filterRecursive = (items: FileItem[]): FileItem[] => {
      return items.filter(item => {
        if (item.children) {
          const filteredChildren = filterRecursive(item.children)
          return filteredChildren.length > 0
        }
        return statusFilter === 'all' || item.status === statusFilter
      }).map(item => ({
        ...item,
        children: item.children ? filterRecursive(item.children) : undefined
      }))
    }
    return filterRecursive(files)
  }

  // 获取所有文件路径（不包括文件夹）
  const getAllFilePaths = (items: FileItem[]): string[] => {
    const paths: string[] = []
    items.forEach(item => {
      if (item.children) {
        paths.push(...getAllFilePaths(item.children))
      } else {
        paths.push(item.path)
      }
    })
    return paths
  }

  const filteredFiles = getFilteredFiles()
  const allFilePaths = getAllFilePaths(filteredFiles)

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedFiles.length === allFilePaths.length) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(allFilePaths)
    }
  }

  // 单个文件选择
  const handleFileSelect = (filePath: string) => {
    setSelectedFiles(prev => {
      if (prev.includes(filePath)) {
        return prev.filter(f => f !== filePath)
      } else {
        return [...prev, filePath]
      }
    })
  }

  // 开始翻译
  const handleStartTranslation = async () => {
    if (selectedFiles.length === 0) {
      alert('请选择要翻译的文件')
      return
    }

    const config = configService.getConfig()
    if (!config?.llmConfig.apiKey) {
      alert('请先在设置中配置 LLM API Key')
      return
    }

    setProgress({
      total: selectedFiles.length,
      completed: 0,
      failed: 0,
      current: '',
      isTranslating: true,
      results: {}
    })

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const filePath = selectedFiles[i]
        setProgress(prev => ({
          ...prev,
          current: filePath
        }))

        try {
          await fileService.translateFile(
            projectPath,
            filePath,
            upstreamBranch,
            workingBranch
          )
          
          setProgress(prev => ({
            ...prev,
            completed: prev.completed + 1,
            results: {
              ...prev.results,
              [filePath]: { success: true }
            }
          }))
        } catch (error) {
          setProgress(prev => ({
            ...prev,
            failed: prev.failed + 1,
            results: {
              ...prev.results,
              [filePath]: { success: false, error: (error as Error).message }
            }
          }))
        }
      }
    } finally {
      setProgress(prev => ({
        ...prev,
        isTranslating: false,
        current: ''
      }))
    }
  }

  // 渲染文件树
  const renderFileTree = (items: FileItem[], level = 0) => {
    return items.map(item => (
      <div key={item.path} className="file-item-container">
        <div 
          className={`file-item ${selectedFiles.includes(item.path) ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {!item.children && (
            <input
              type="checkbox"
              checked={selectedFiles.includes(item.path)}
              onChange={() => handleFileSelect(item.path)}
              className="file-checkbox"
            />
          )}
          <span className="file-status">{getStatusIcon(item.status)}</span>
          <span className="file-name">{item.name}</span>
          {item.modified && <span className="modified-indicator">M</span>}
          {progress.results[item.path] && (
            <span className={`translation-result ${progress.results[item.path].success ? 'success' : 'error'}`}>
              {progress.results[item.path].success ? '✓' : '✗'}
            </span>
          )}
        </div>
        {item.children && (
          <div className="file-children">
            {renderFileTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'translated': return '🟢'
      case 'outdated': return '🟡'
      case 'untranslated': return '⚪'
      default: return '⚪'
    }
  }

  if (!isOpen) return null

  return (
    <div className="translation-dialog-overlay">
      <div className="translation-dialog">
        <div className="dialog-header">
          <h2>批量翻译文件</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="dialog-content">
          <div className="filter-section">
            <div className="filter-buttons">
              <button 
                className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                全部 ({allFilePaths.length})
              </button>
              <button 
                className={`btn btn-sm ${statusFilter === 'untranslated' ? 'btn-primary' : ''}`}
                onClick={() => setStatusFilter('untranslated')}
              >
                ⚪ 未翻译
              </button>
              <button 
                className={`btn btn-sm ${statusFilter === 'outdated' ? 'btn-primary' : ''}`}
                onClick={() => setStatusFilter('outdated')}
              >
                🟡 已过时
              </button>
              <button 
                className={`btn btn-sm ${statusFilter === 'translated' ? 'btn-primary' : ''}`}
                onClick={() => setStatusFilter('translated')}
              >
                🟢 已翻译
              </button>
            </div>
            
            <div className="selection-controls">
              <button 
                className="btn btn-sm"
                onClick={handleSelectAll}
              >
                {selectedFiles.length === allFilePaths.length ? '取消全选' : '全选'}
              </button>
              <span className="selection-count">
                已选择 {selectedFiles.length} / {allFilePaths.length} 个文件
              </span>
            </div>
          </div>

          <div className="file-list">
            {renderFileTree(filteredFiles)}
          </div>

          {progress.isTranslating && (
            <div className="progress-section">
              <div className="progress-info">
                <div className="progress-text">
                  正在翻译: {progress.current}
                </div>
                <div className="progress-stats">
                  进度: {progress.completed + progress.failed} / {progress.total} 
                  (成功: {progress.completed}, 失败: {progress.failed})
                </div>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ 
                    width: `${((progress.completed + progress.failed) / progress.total) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          )}

          {!progress.isTranslating && (progress.completed > 0 || progress.failed > 0) && (
            <div className="translation-summary">
              <h3>翻译结果汇总</h3>
              <div className="summary-stats">
                <span className="success-count">成功: {progress.completed}</span>
                <span className="error-count">失败: {progress.failed}</span>
              </div>
              {progress.failed > 0 && (
                <div className="error-details">
                  <h4>失败的文件:</h4>
                  {Object.entries(progress.results)
                    .filter(([, result]) => !result.success)
                    .map(([filePath, result]) => (
                      <div key={filePath} className="error-item">
                        <strong>{filePath}:</strong> {result.error}
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="dialog-footer">
          <button 
            className="btn btn-secondary"
            onClick={onClose}
            disabled={progress.isTranslating}
          >
            关闭
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleStartTranslation}
            disabled={selectedFiles.length === 0 || progress.isTranslating}
          >
            {progress.isTranslating ? '翻译中...' : `开始翻译 (${selectedFiles.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TranslationDialog 