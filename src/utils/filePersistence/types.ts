export const DEFAULT_UPLOAD_CONCURRENCY = 4
export const FILE_COUNT_LIMIT = 200
export const OUTPUTS_SUBDIR = 'outputs'

export type TurnStartTime = number
export type PersistedFile = {
  path: string
  fileId?: string
  size?: number
}
export type FailedPersistence = {
  path: string
  error: string
}
export type FilesPersistedEventData = {
  persistedFiles: PersistedFile[]
  failedFiles: FailedPersistence[]
}

