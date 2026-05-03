function unavailable(): never {
  throw new Error('Internal Anthropic-only handler is not available in Chimera.')
}

export function logHandler(): never {
  return unavailable()
}
export function errorHandler(): never {
  return unavailable()
}
export function exportHandler(): never {
  return unavailable()
}
export function taskCreateHandler(): never {
  return unavailable()
}
export function taskListHandler(): never {
  return unavailable()
}
export function taskGetHandler(): never {
  return unavailable()
}
export function taskUpdateHandler(): never {
  return unavailable()
}
export function taskDirHandler(): never {
  return unavailable()
}
export function completionHandler(): never {
  return unavailable()
}
