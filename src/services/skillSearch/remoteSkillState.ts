export type RemoteSkillMetadata = {
  slug: string
  name?: string
  url: string
  description?: string
}

const discovered = new Map<string, RemoteSkillMetadata>()

export function stripCanonicalPrefix(name: string): string | null {
  return name.startsWith('_canonical_') ? name.slice('_canonical_'.length) : null
}

export function rememberDiscoveredRemoteSkill(meta: RemoteSkillMetadata): void {
  discovered.set(meta.slug, meta)
}

export function getDiscoveredRemoteSkill(
  slug: string,
): RemoteSkillMetadata | undefined {
  return discovered.get(slug)
}

export function clearDiscoveredRemoteSkills(): void {
  discovered.clear()
}

