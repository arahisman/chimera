export type SecureStorageData = Record<string, unknown>

export type SecureStorage = {
  get: (key: string) => Promise<SecureStorageData | undefined>
  set: (key: string, value: SecureStorageData) => Promise<void>
  delete: (key: string) => Promise<void>
  read: (key: string) => Promise<SecureStorageData | undefined>
  update: (
    key: string,
    updater: (value: SecureStorageData | undefined) => SecureStorageData,
  ) => Promise<void>
}
