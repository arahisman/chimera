// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .chimera/ folder
export const CHIMERA_FOLDER_PERMISSION_PATTERN = '/.chimera/**'

// Permission pattern for granting session-level access to the global Chimera config folder
export const GLOBAL_CHIMERA_FOLDER_PERMISSION_PATTERN = '~/.config/chimera/**'

// Compatibility export for granting session-level access to the project's managed settings folder
export const CLAUDE_FOLDER_PERMISSION_PATTERN = '/.chimera/**'

// Compatibility export for granting session-level access to the global managed settings folder
export const GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN = '~/.config/chimera/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
