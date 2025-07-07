import { LLMService } from './llmService'

// Jupyter Notebook 的单元格类型
export interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw'
  source: string[]
  metadata?: any
  outputs?: any[]
  execution_count?: number | null
}

// Jupyter Notebook 文件结构
export interface JupyterNotebook {
  cells: NotebookCell[]
  metadata: any
  nbformat: number
  nbformat_minor: number
}

// 翻译结果
export interface NotebookTranslationResult {
  translatedNotebook: JupyterNotebook
  translatedCellsCount: number
  totalMarkdownCells: number
  errors: Array<{
    cellIndex: number
    error: string
  }>
}

export class NotebookProcessor {
  private llmService: LLMService

  constructor(llmService: LLMService) {
    this.llmService = llmService
  }

  /**
   * 检查文件是否为 Jupyter Notebook 文件
   */
  static isNotebookFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.ipynb')
  }

  /**
   * 解析 Jupyter Notebook 文件内容
   */
  parseNotebook(content: string): JupyterNotebook {
    try {
      const notebook = JSON.parse(content)
      
      // 验证基本结构
      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        throw new Error('无效的 Jupyter Notebook 格式：缺少 cells 数组')
      }

      if (typeof notebook.nbformat !== 'number') {
        throw new Error('无效的 Jupyter Notebook 格式：缺少 nbformat')
      }

      return notebook
    } catch (error) {
      throw new Error(`解析 Jupyter Notebook 失败：${(error as Error).message}`)
    }
  }

  /**
   * 合并单元格的 source 数组为单个字符串
   */
  private mergeCellSource(source: string[]): string {
    if (!Array.isArray(source)) {
      return typeof source === 'string' ? source : ''
    }
    return source.join('')
  }

  /**
   * 将翻译后的内容转换为单元格 source 格式
   */
  private formatTranslatedSource(translatedContent: string): string[] {
    // 如果内容为空，返回空数组
    if (!translatedContent) {
      return ['']
    }
    
    // 按照 \n 切割，但保留换行符
    const lines = translatedContent.split('\n')
    
    // 为每行添加换行符，除了最后一行
    return lines.map((line, index) => {
      if (index === lines.length - 1) {
        // 最后一行不添加换行符
        return line
      } else {
        // 其他行都添加换行符
        return line + '\n'
      }
    })
  }

  /**
   * 获取所有 markdown 单元格的索引
   */
  private getMarkdownCellIndices(notebook: JupyterNotebook): number[] {
    return notebook.cells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell.cell_type === 'markdown')
      .map(({ index }) => index)
  }

  /**
   * 翻译单个 markdown 单元格
   */
  private async translateMarkdownCell(
    cellContent: string,
    projectPath?: string
  ): Promise<string> {
    try {
      // 如果单元格内容为空或只包含空白字符，直接返回
      if (!cellContent || !cellContent.trim()) {
        return cellContent
      }

      // 调用翻译服务
      const response = await this.llmService.translateText({
        content: cellContent
      }, projectPath)

      return response.translatedContent
    } catch (error) {
      console.error('翻译 markdown 单元格失败:', error)
      throw error
    }
  }

  /**
   * 翻译整个 Jupyter Notebook
   */
  async translateNotebook(
    notebookContent: string,
    projectPath?: string
  ): Promise<NotebookTranslationResult> {
    console.log('开始翻译 Jupyter Notebook...')
    
    // 1. 解析 notebook
    const notebook = this.parseNotebook(notebookContent)
    
    // 2. 获取所有 markdown 单元格的索引
    const markdownCellIndices = this.getMarkdownCellIndices(notebook)
    console.log(`发现 ${markdownCellIndices.length} 个 markdown 单元格需要翻译`)

    if (markdownCellIndices.length === 0) {
      console.log('没有发现需要翻译的 markdown 单元格')
      return {
        translatedNotebook: notebook,
        translatedCellsCount: 0,
        totalMarkdownCells: 0,
        errors: []
      }
    }

    // 3. 复制 notebook 结构，避免修改原始数据
    const translatedNotebook = JSON.parse(JSON.stringify(notebook)) as JupyterNotebook
    const errors: Array<{ cellIndex: number; error: string }> = []
    let translatedCellsCount = 0

    // 4. 逐个翻译 markdown 单元格
    for (const cellIndex of markdownCellIndices) {
      try {
        console.log(`正在翻译第 ${cellIndex + 1} 个单元格...`)
        
        const originalCell = notebook.cells[cellIndex]
        const cellContent = this.mergeCellSource(originalCell.source)
        
        // 翻译单元格内容
        const translatedContent = await this.translateMarkdownCell(cellContent, projectPath)
        
        // 更新翻译后的单元格
        translatedNotebook.cells[cellIndex].source = this.formatTranslatedSource(translatedContent)
        
        translatedCellsCount++
        console.log(`第 ${cellIndex + 1} 个单元格翻译完成`)
        
      } catch (error) {
        const errorMessage = (error as Error).message
        console.error(`翻译第 ${cellIndex + 1} 个单元格失败:`, errorMessage)
        
        errors.push({
          cellIndex: cellIndex + 1, // 用户友好的索引（从1开始）
          error: errorMessage
        })
      }
    }

    console.log(`Jupyter Notebook 翻译完成：${translatedCellsCount}/${markdownCellIndices.length} 个单元格翻译成功`)

    return {
      translatedNotebook,
      translatedCellsCount,
      totalMarkdownCells: markdownCellIndices.length,
      errors
    }
  }

  /**
   * 将翻译后的 notebook 转换为 JSON 字符串
   */
  stringifyNotebook(notebook: JupyterNotebook): string {
    // 使用 2 个空格的缩进，保持 JSON 格式的可读性
    return JSON.stringify(notebook, null, 2)
  }

  /**
   * 验证翻译后的 notebook 结构完整性
   */
  validateNotebook(notebook: JupyterNotebook): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // 检查必要的字段
    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      errors.push('缺少 cells 数组')
    }

    if (typeof notebook.nbformat !== 'number') {
      errors.push('缺少 nbformat 字段')
    }

    if (typeof notebook.nbformat_minor !== 'number') {
      errors.push('缺少 nbformat_minor 字段')
    }

    if (!notebook.metadata) {
      errors.push('缺少 metadata 字段')
    }

    // 检查每个单元格的结构
    if (notebook.cells && Array.isArray(notebook.cells)) {
      notebook.cells.forEach((cell, index) => {
        if (!cell.cell_type || !['markdown', 'code', 'raw'].includes(cell.cell_type)) {
          errors.push(`单元格 ${index + 1} 的 cell_type 无效`)
        }

        if (!cell.source) {
          errors.push(`单元格 ${index + 1} 缺少 source 字段`)
        } else if (!Array.isArray(cell.source) && typeof cell.source !== 'string') {
          errors.push(`单元格 ${index + 1} 的 source 字段格式无效`)
        }
      })
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
} 