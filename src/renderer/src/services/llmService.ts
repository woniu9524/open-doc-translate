import { configService } from './configService'

export interface LLMConfig {
  apiKey: string
  model: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
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
  private async getConfig(): Promise<LLMConfig> {
    const config = configService.getConfig()
    if (!config?.llmConfig) {
      throw new Error('LLM 配置未找到')
    }
    return config.llmConfig
  }

  async translateText(request: TranslationRequest): Promise<TranslationResponse> {
    const config = await this.getConfig()
    
    if (!config.apiKey) {
      throw new Error('API Key 未配置')
    }

    const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    const prompt = request.prompt || await this.getDefaultPrompt()

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
          temperature: config.temperature || 0.3,
          max_tokens: config.maxTokens || 4000
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

      return {
        translatedContent: data.choices[0].message.content,
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

  private async getDefaultPrompt(): Promise<string> {
    const config = configService.getConfig()
    return config?.globalPrompt || '你是一个专业的技术文档翻译助手。请将以下英文文档翻译成中文，保持原有的格式和结构，确保技术术语的准确性。'
  }

  async getProjectPrompt(projectPath: string): Promise<string> {
    const config = configService.getConfig()
    const project = config?.projects.find(p => p.path === projectPath)
    
    if (project?.customPrompt) {
      return project.customPrompt
    }
    
    return await this.getDefaultPrompt()
  }

  // 验证 API 配置
  async validateConfig(): Promise<boolean> {
    try {
      const config = await this.getConfig()
      
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

// 创建单例实例
export const llmService = new LLMService() 