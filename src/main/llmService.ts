import { ConfigManager } from './config'

export interface LLMConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export interface TranslationRequest {
  content: string
  prompt?: string
}

export interface TranslationResponse {
  translatedContent: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export class LLMService {
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  private getConfig(): LLMConfig {
    const config = this.configManager.getConfig()
    if (!config?.llmConfig) {
      throw new Error('LLM 配置未找到')
    }
    return config.llmConfig
  }

  // 清理翻译结果中的代码块标记
  private cleanTranslationResult(content: string): string {
    // 先除去空格
    let cleaned = content.trim()
    
    // 去掉开头的```json、```、```markdown等代码块标记
    if (cleaned.startsWith('```')) {
      // 找到第一个换行符或者第一个```结束标记
      const firstNewline = cleaned.indexOf('\n')
      if (firstNewline !== -1) {
        cleaned = cleaned.substring(firstNewline + 1)
      }
    }
    
    // 去掉结尾的```标记
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3)
    }
    
    // 再次去掉空格
    return cleaned.trim()
  }

  async translateText(request: TranslationRequest, projectPath?: string): Promise<TranslationResponse> {
    const config = this.getConfig()
    
    if (!config.apiKey) {
      throw new Error('API Key 未配置')
    }

    const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    const prompt = request.prompt || this.getPrompt(projectPath)

    const messages = [
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: request.content
      }
    ]

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.3,
          max_tokens: 32000
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`)
      }

      const data = await response.json()
      
      if (!data.choices || !data.choices[0]?.message?.content) {
        throw new Error('API 响应格式无效')
      }

      
      // 清理翻译结果
      const cleanedContent = this.cleanTranslationResult(data.choices[0].message.content)
      return {
        translatedContent: cleanedContent,
        model: config.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined
      }
    } catch (error) {
      console.error('LLM 翻译失败:', error)
      throw new Error(`翻译失败: ${(error as Error).message}`)
    }
  }

  private getPrompt(projectPath?: string): string {
    const config = this.configManager.getConfig()
    
    if (projectPath) {
      const project = config.projects.find(p => p.path === projectPath)
      if (project?.customPrompt) {
        return project.customPrompt
      }
    }
    
    return config.globalPrompt || '你是一个专业的技术文档翻译助手。请将以下英文文档翻译成中文，保持原有的格式和结构，确保技术术语的准确性。'
  }

  // 验证 API 配置
  async validateConfig(): Promise<boolean> {
    try {
      const config = this.getConfig()
      
      if (!config.apiKey) {
        return false
      }

      // 发送一个简单的测试请求
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      })

      return response.ok
    } catch (error) {
      console.error('验证 LLM 配置失败:', error)
      return false
    }
  }
} 