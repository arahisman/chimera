export type ModifierKey = 'shift' | 'command' | 'control' | 'option'

/**
 * No-op in the recovered build. The original implementation used an internal
 * macOS native module; public packages with the same name are not trusted.
 */
export function prewarmModifiers(): void {
  return
}

/**
 * Check if a specific modifier key is currently pressed.
 *
 * Synchronous modifier polling requires a native event-tap adapter. Until we
 * have a vetted implementation, report no active modifier instead of loading
 * dependency-confusion-prone package names from the public registry.
 */
export function isModifierPressed(modifier: ModifierKey): boolean {
  void modifier
  return false
}
