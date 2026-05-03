import type { RemoteSkillMetadata } from './remoteSkillState.js'

export type RemoteSkillLoadResult = {
  content: string
  metadata: RemoteSkillMetadata
}

export async function loadRemoteSkill(
  meta: RemoteSkillMetadata,
): Promise<RemoteSkillLoadResult> {
  const response = await fetch(meta.url)
  if (!response.ok) {
    throw new Error(`Failed to load remote skill ${meta.slug}: ${response.status}`)
  }
  return {
    content: await response.text(),
    metadata: meta,
  }
}

