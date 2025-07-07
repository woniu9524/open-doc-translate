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
  currentFiles: string[]
  isTranslating: boolean
  results: { [filePath: string]: { success: boolean; error?: string } }
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
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
  const [fileSizeFilter, setFileSizeFilter] = useState<{ min: number; max: number }>({ min: 0, max: Infinity })
  const [fileTypeFilter, setFileTypeFilter] = useState<string[]>([])
  const [fileNameFilter, setFileNameFilter] = useState<string>('')
  const [progress, setProgress] = useState<TranslationProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current: '',
    currentFiles: [],
    isTranslating: false,
    results: {}
  })

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

  // 过滤文件
  const getFilteredFiles = (): FileItem[] => {
    const filterRecursive = (items: FileItem[]): FileItem[] => {
      return items.filter(item => {
        if (item.children) {
          const filteredChildren = filterRecursive(item.children)
          return filteredChildren.length > 0
        }
        
        // 状态筛选
        const statusMatch = statusFilter === 'all' || item.status === statusFilter
        
        // 文件大小筛选（转换为KB）
        const fileSizeKB = item.size ? item.size / 1024 : 0
        const sizeMatch = fileSizeKB >= fileSizeFilter.min && fileSizeKB <= fileSizeFilter.max
        
        // 文件类型筛选
        const fileExtension = item.name.split('.').pop()
        const typeMatch = fileTypeFilter.length === 0 || 
          (fileExtension && fileTypeFilter.includes(`.${fileExtension}`))
        
        // 文件名筛选 - 支持多个关键词用逗号分隔
        let nameMatch = true
        if (fileNameFilter.trim()) {
          const keywords = fileNameFilter.split(',').map(keyword => keyword.trim().toLowerCase()).filter(keyword => keyword)
          nameMatch = keywords.some(keyword => item.name.toLowerCase().includes(keyword))
        }
        
        return statusMatch && sizeMatch && typeMatch && nameMatch
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
  const availableFileTypes = getAllFileTypes()

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

  // 文件夹选择处理
  const handleFolderSelect = (folderPath: string, children: FileItem[]) => {
    const childFilePaths = getAllFilePaths(children)
    const allSelected = childFilePaths.every(path => selectedFiles.includes(path))
    
    setSelectedFiles(prev => {
      if (allSelected) {
        // 如果全部选中，则取消选择
        return prev.filter(f => !childFilePaths.includes(f))
      } else {
        // 如果未全部选中，则全选
        const newSelected = new Set(prev)
        childFilePaths.forEach(path => newSelected.add(path))
        return Array.from(newSelected)
      }
    })
  }

  // 检查文件夹是否被选中（部分选中或全选）
  const getFolderCheckState = (children: FileItem[]): 'none' | 'partial' | 'all' => {
    const childFilePaths = getAllFilePaths(children)
    const selectedCount = childFilePaths.filter(path => selectedFiles.includes(path)).length
    
    if (selectedCount === 0) return 'none'
    if (selectedCount === childFilePaths.length) return 'all'
    return 'partial'
  }

  // 处理文件大小筛选
  const handleFileSizeFilterChange = (type: 'min' | 'max', value: string) => {
    const numValue = value === '' ? (type === 'min' ? 0 : Infinity) : Number(value)
    setFileSizeFilter(prev => ({
      ...prev,
      [type]: numValue
    }))
  }

  // 重置文件大小筛选
  const resetFileSizeFilter = () => {
    setFileSizeFilter({ min: 0, max: Infinity })
  }

  // 重置文件名筛选
  const resetFileNameFilter = () => {
    setFileNameFilter('')
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

    const concurrency = config.llmConfig.concurrency || 3

    setProgress({
      total: selectedFiles.length,
      completed: 0,
      failed: 0,
      current: '',
      currentFiles: [],
      isTranslating: true,
      results: {}
    })

    try {
      // 使用并发翻译
      await translateWithConcurrency(selectedFiles, concurrency)
    } finally {
      setProgress(prev => ({
        ...prev,
        isTranslating: false,
        current: ''
      }))
    }
  }

  // 并发翻译函数
  const translateWithConcurrency = async (files: string[], concurrency: number) => {
    const results = new Map<string, { success: boolean; error?: string }>()
    let completed = 0
    let failed = 0
    let index = 0

    // 创建并发任务处理器
    const processFile = async (): Promise<void> => {
      while (index < files.length) {
        const currentIndex = index++
        const filePath = files[currentIndex]
        
        // 更新当前处理的文件 - 添加到处理队列
        setProgress(prev => ({
          ...prev,
          current: prev.currentFiles.length === 0 ? filePath : prev.current,
          currentFiles: [...prev.currentFiles, filePath]
        }))

        try {
          await fileService.translateFile(
            projectPath,
            filePath,
            upstreamBranch,
            workingBranch
          )
          
          completed++
          results.set(filePath, { success: true })
        } catch (error) {
          failed++
          results.set(filePath, { success: false, error: (error as Error).message })
        }

        // 更新进度 - 从处理队列中移除
        setProgress(prev => {
          const newCurrentFiles = prev.currentFiles.filter(f => f !== filePath)
          return {
            ...prev,
            completed,
            failed,
            current: newCurrentFiles.length > 0 ? newCurrentFiles[0] : '',
            currentFiles: newCurrentFiles,
            results: Object.fromEntries(results)
          }
        })
      }
    }

    // 创建并发任务
    const tasks = Array.from({ length: concurrency }, () => processFile())
    
    // 等待所有任务完成
    await Promise.all(tasks)
  }

  // 渲染文件树
  const renderFileTree = (items: FileItem[], level = 0) => {
    return items.map(item => (
      <div key={item.path} className="file-item-container">
        <div 
          className={`file-item ${selectedFiles.includes(item.path) ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {item.children ? (
            // 文件夹
            <>
              <input
                type="checkbox"
                checked={getFolderCheckState(item.children) === 'all'}
                ref={input => {
                  if (input && item.children) {
                    input.indeterminate = getFolderCheckState(item.children) === 'partial'
                  }
                }}
                onChange={() => item.children && handleFolderSelect(item.path, item.children)}
                className="file-checkbox"
              />
              <span className="folder-icon">📁</span>
              <span className="file-name">{item.name}</span>
            </>
          ) : (
            // 文件
            <>
              <input
                type="checkbox"
                checked={selectedFiles.includes(item.path)}
                onChange={() => handleFileSelect(item.path)}
                className="file-checkbox"
              />
              <span className="file-status">{getStatusIcon(item.status)}</span>
              <span className="file-name">{item.name}</span>
              {item.size !== undefined && (
                <span className="file-size">{formatFileSize(item.size)}</span>
              )}
              {item.modified && <span className="modified-indicator">M</span>}
              {progress.results[item.path] && (
                <span className={`translation-result ${progress.results[item.path].success ? 'success' : 'error'}`}>
                  {progress.results[item.path].success ? '✓' : '✗'}
                </span>
              )}
            </>
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
            
            <div className="file-type-filter">
              <label>文件类型筛选:</label>
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
                {availableFileTypes.length > 0 && (
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={resetFileTypeFilter}
                    title="重置文件类型筛选"
                  >
                    重置
                  </button>
                )}
              </div>
              {fileTypeFilter.length > 0 && (
                <div className="selected-types">
                  已选择: {fileTypeFilter.join(', ')}
                </div>
              )}
            </div>
            
            <div className="file-size-filter">
              <label>文件大小筛选 (KB):</label>
              <div className="size-filter-inputs">
                <input
                  type="number"
                  placeholder="最小值"
                  value={fileSizeFilter.min === 0 ? '' : fileSizeFilter.min}
                  onChange={(e) => handleFileSizeFilterChange('min', e.target.value)}
                  className="size-input"
                  min="0"
                />
                <span>~</span>
                <input
                  type="number"
                  placeholder="最大值"
                  value={fileSizeFilter.max === Infinity ? '' : fileSizeFilter.max}
                  onChange={(e) => handleFileSizeFilterChange('max', e.target.value)}
                  className="size-input"
                  min="0"
                />
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={resetFileSizeFilter}
                  title="重置文件大小筛选"
                >
                  重置
                </button>
              </div>
            </div>
            
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
                  正在翻译: {progress.currentFiles.length > 0 ? `${progress.currentFiles.length} 个文件` : '准备中...'}
                </div>
                {progress.currentFiles.length > 0 && (
                  <div className="current-files">
                    {progress.currentFiles.map((filePath, index) => (
                      <div key={filePath} className="current-file">
                        {index + 1}. {filePath}
                      </div>
                    ))}
                  </div>
                )}
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