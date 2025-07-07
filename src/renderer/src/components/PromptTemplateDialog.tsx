import React, { useState, useEffect } from 'react'
import { PromptTemplate } from '../types/config'
import { configService } from '../services/configService'
import './PromptTemplateDialog.css'

interface PromptTemplateDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectTemplate: (template: PromptTemplate) => void
}

const PromptTemplateDialog: React.FC<PromptTemplateDialogProps> = ({
  isOpen,
  onClose,
  onSelectTemplate
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    description: ''
  })

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
    }
  }, [isOpen])

  const loadTemplates = () => {
    const config = configService.getConfig()
    setTemplates(config?.promptTemplates || [])
  }

  const handleAddTemplate = () => {
    setIsEditing(true)
    setEditingTemplate(null)
    setFormData({
      name: '',
      content: '',
      description: ''
    })
  }

  const handleEditTemplate = (template: PromptTemplate) => {
    setIsEditing(true)
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      content: template.content,
      description: template.description || ''
    })
  }

  const handleSaveTemplate = async () => {
    if (!formData.name.trim() || !formData.content.trim()) {
      alert('请填写模板名称和内容')
      return
    }

    try {
      const config = configService.getConfig()
      if (!config) return

      const now = new Date().toISOString()
      
      let updatedTemplates: PromptTemplate[]
      
      if (editingTemplate) {
        // 编辑现有模板
        updatedTemplates = (config.promptTemplates || []).map(template =>
          template.id === editingTemplate.id
            ? {
                ...template,
                name: formData.name,
                content: formData.content,
                description: formData.description,
                updatedAt: now
              }
            : template
        )
      } else {
        // 添加新模板
        const newTemplate: PromptTemplate = {
          id: Date.now().toString(),
          name: formData.name,
          content: formData.content,
          description: formData.description,
          createdAt: now,
          updatedAt: now
        }
        updatedTemplates = [...(config.promptTemplates || []), newTemplate]
      }

      await configService.saveConfig({
        ...config,
        promptTemplates: updatedTemplates
      })

      setTemplates(updatedTemplates)
      setIsEditing(false)
      setEditingTemplate(null)
      setFormData({ name: '', content: '', description: '' })
    } catch (error) {
      console.error('保存模板失败:', error)
      alert('保存模板失败: ' + (error as Error).message)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('确定要删除这个模板吗？')) {
      return
    }

    try {
      const config = configService.getConfig()
      if (!config) return

      const updatedTemplates = (config.promptTemplates || []).filter(
        template => template.id !== templateId
      )

      await configService.saveConfig({
        ...config,
        promptTemplates: updatedTemplates
      })

      setTemplates(updatedTemplates)
    } catch (error) {
      console.error('删除模板失败:', error)
      alert('删除模板失败: ' + (error as Error).message)
    }
  }

  const handleSelectTemplate = (template: PromptTemplate) => {
    onSelectTemplate(template)
    onClose()
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingTemplate(null)
    setFormData({ name: '', content: '', description: '' })
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="prompt-template-dialog-overlay">
      <div className="prompt-template-dialog">
        <div className="dialog-header">
          <h2>📝 提示词模板管理</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="dialog-content">
          {!isEditing ? (
            <>
              <div className="template-actions">
                <button className="btn btn-primary" onClick={handleAddTemplate}>
                  ➕ 添加模板
                </button>
              </div>

              <div className="template-list">
                {templates.length === 0 ? (
                  <div className="empty-state">
                    <p>还没有提示词模板，点击上方按钮添加第一个模板</p>
                  </div>
                ) : (
                  templates.map(template => (
                    <div key={template.id} className="template-item">
                      <div className="template-header">
                        <h3>{template.name}</h3>
                        <div className="template-actions">
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleSelectTemplate(template)}
                          >
                            使用
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleEditTemplate(template)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      {template.description && (
                        <p className="template-description">{template.description}</p>
                      )}
                      <div className="template-content">
                        <pre>{template.content}</pre>
                      </div>
                      <div className="template-meta">
                        <small>
                          创建时间: {new Date(template.createdAt).toLocaleString()}
                          {template.updatedAt !== template.createdAt && (
                            <> · 更新时间: {new Date(template.updatedAt).toLocaleString()}</>
                          )}
                        </small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="template-editor">
              <div className="editor-header">
                <h3>{editingTemplate ? '编辑模板' : '添加模板'}</h3>
              </div>
              
              <div className="editor-form">
                <div className="form-group">
                  <label>模板名称:</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="输入模板名称"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                
                <div className="form-group">
                  <label>描述 (可选):</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="简要描述这个模板的用途"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                
                <div className="form-group">
                  <label>模板内容:</label>
                  <textarea
                    className="textarea"
                    placeholder="输入提示词模板内容..."
                    rows={10}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="editor-actions">
                <button className="btn btn-primary" onClick={handleSaveTemplate}>
                  保存
                </button>
                <button className="btn btn-secondary" onClick={handleCancelEdit}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PromptTemplateDialog 