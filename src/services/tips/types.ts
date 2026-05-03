import type { Message } from '../../types/message.js'

export type TipContext = {
  messages?: Message[]
  isLoading?: boolean
  [key: string]: unknown
}

export type Tip = {
  id: string
  text: string
  priority?: number
  isRelevant?: (context?: TipContext) => boolean | Promise<boolean>
}
