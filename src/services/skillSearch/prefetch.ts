export type SkillDiscoveryPrefetch = Promise<unknown[]>

export function startSkillDiscoveryPrefetch(): SkillDiscoveryPrefetch {
  return Promise.resolve([])
}

export async function collectSkillDiscoveryPrefetch(
  pending: SkillDiscoveryPrefetch,
): Promise<unknown[]> {
  return pending
}

export async function getTurnZeroSkillDiscovery(): Promise<unknown[]> {
  return []
}

