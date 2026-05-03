export type SessionTurnUploader = {
  onTurnComplete?: () => void | Promise<void>
  dispose?: () => void | Promise<void>
}

export function createSessionTurnUploader(): SessionTurnUploader {
  return {}
}
