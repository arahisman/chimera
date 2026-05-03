import type { Command } from '../types/command.js'

type CacheableFetcher = ((client: { name?: string }) => Promise<Command[]>) & {
  cache: Map<string, Promise<Command[]>>
}

export const fetchMcpSkillsForClient: CacheableFetcher = Object.assign(
  async function fetchMcpSkillsForClient(): Promise<Command[]> {
    return []
  },
  { cache: new Map<string, Promise<Command[]>>() },
)

