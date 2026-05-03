export type NotebookCellType = 'code' | 'markdown' | 'raw' | string

export type NotebookCell = {
  cell_type: NotebookCellType
  source: string | string[]
  metadata?: Record<string, unknown>
  outputs?: unknown[]
  execution_count?: number | null
}

export type NotebookContent = {
  cells: NotebookCell[]
  metadata?: Record<string, unknown>
  nbformat?: number
  nbformat_minor?: number
}
