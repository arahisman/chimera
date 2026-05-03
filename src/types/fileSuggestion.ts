export type FileSuggestion = {
  path: string
  displayPath?: string
  type?: 'file' | 'directory'
  score?: number
}
