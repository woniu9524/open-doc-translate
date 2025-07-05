import React, { useState, useEffect } from 'react'
import './MainWorkArea.css'

interface MainWorkAreaProps {
  activeFile: string | null
  onFileChange: (file: string | null) => void
}

interface FileContent {
  original: string
  translated: string
  status: 'translated' | 'outdated' | 'untranslated'
  hasChanges?: boolean
}

const mockFileContents: Record<string, FileContent> = {
  'docs/README.md': {
    original: `# OpenDoc Translate

A powerful document translation tool for open source projects.

## Features

- Intelligent status detection
- High-quality LLM-based translation
- Git workflow integration
- Diff highlighting for outdated files

## Getting Started

1. Fork the repository
2. Clone your fork
3. Add project in OpenDoc Translate
4. Start translating!`,
    translated: `# OpenDoc Translate

一个强大的开源项目文档翻译工具。

## 特性

- 智能状态检测
- 基于LLM的高质量翻译
- Git工作流集成
- 过时文件的差异高亮

## 开始使用

1. Fork 仓库
2. 克隆你的 fork
3. 在 OpenDoc Translate 中添加项目
4. 开始翻译！`,
    status: 'translated'
  },
  'docs/getting-started.md': {
    original: `# Getting Started

Welcome to OpenDoc Translate! This guide will help you get started with translating documentation.

## Prerequisites

- Node.js 18+
- Git
- A GitHub account

## Installation

1. Download the latest release
2. Install the application
3. Launch OpenDoc Translate

## First Steps

### 1. Add Your Project

Click the "+" button in the toolbar to add your forked repository.

### 2. Configure Branches

Select your upstream branch (usually 'main' or 'master') and working branch.

### 3. Sync Files

Click the "Sync" button to fetch the latest changes and update file status.

## Translation Workflow

Once you have files with different statuses, you can:

- Select untranslated files and use "Translate Selected Files"
- Review outdated files and update translations
- Use the diff view to see what changed

## Committing Changes

After translating, go to the Git tab to commit and push your changes.`,
    translated: `# 开始使用

欢迎使用 OpenDoc Translate！本指南将帮助您开始翻译文档。

## 先决条件

- Node.js 18+
- Git
- GitHub 账户

## 安装

1. 下载最新版本
2. 安装应用程序
3. 启动 OpenDoc Translate

## 第一步

### 1. 添加您的项目

点击工具栏中的"+"按钮来添加您的 fork 仓库。

### 2. 配置分支

选择您的上游分支（通常是 'main' 或 'master'）和工作分支。

### 3. 同步文件

点击"同步"按钮获取最新更改并更新文件状态。

## 翻译工作流

一旦您有了不同状态的文件，您可以：

- 选择未翻译的文件并使用"翻译选中文件"
- 审查过时的文件并更新翻译
- 使用差异视图查看更改内容

## 提交更改

翻译完成后，转到 Git 标签页提交并推送您的更改。`,
    status: 'outdated',
    hasChanges: true
  },
  'docs/api.md': {
    original: `# API Reference

This document describes the API endpoints available in OpenDoc Translate.

## Authentication

All API requests require authentication using an API key.

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://api.example.com/translate
\`\`\`

## Endpoints

### POST /translate

Translate a document.

**Parameters:**
- \`content\` (string): The content to translate
- \`target_language\` (string): Target language code
- \`source_language\` (string, optional): Source language code

**Response:**
\`\`\`json
{
  "translated_content": "...",
  "status": "success"
}
\`\`\``,
    translated: '',
    status: 'untranslated'
  }
}

const MainWorkArea: React.FC<MainWorkAreaProps> = ({ activeFile, onFileChange }) => {
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [translatedContent, setTranslatedContent] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    if (activeFile && mockFileContents[activeFile]) {
      const content = mockFileContents[activeFile]
      setFileContent(content)
      setTranslatedContent(content.translated)
      setHasUnsavedChanges(false)
    } else {
      setFileContent(null)
      setTranslatedContent('')
      setHasUnsavedChanges(false)
    }
  }, [activeFile])

  const handleTranslate = async () => {
    if (!fileContent) return
    
    setIsTranslating(true)
    // 模拟翻译过程
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
  }

  const handleSave = () => {
    if (!activeFile || !fileContent) return
    
    // 模拟保存操作
    console.log('保存文件:', activeFile, translatedContent)
    setHasUnsavedChanges(false)
    
    // 更新mock数据
    mockFileContents[activeFile] = {
      ...fileContent,
      translated: translatedContent
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

  if (!fileContent) {
    return (
      <div className="main-work-area">
        <div className="empty-state">
          <div className="empty-icon">❌</div>
          <h3>文件不存在</h3>
          <p>无法找到文件: {activeFile}</p>
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