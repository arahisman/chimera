export type SpinnerMode =
  | 'default'
  | 'thinking'
  | 'tool-use'
  | 'compact'
  | 'background'
  | string

export type SpinnerFrame = {
  text: string
  color?: string
}
