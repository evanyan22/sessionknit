import type { SessionEntry } from './types.js'

export interface ReconstructResult<TMessage> {
  messages: TMessage[]
  entries: SessionEntry<TMessage>[]
}

/** Pure reconstruction — no I/O, so it's testable without a storage
 * backend. Walks parentId from the target leaf back to the root, then
 * runs topology repair: at each node on that path, any *other* children
 * (siblings of the node that continues the path) are reattached too —
 * exactly what a turn with parallel tool calls produces, and exactly
 * what a naive single-parent walk would silently drop. */
export function reconstructChain<TMessage>(
  entries: SessionEntry<TMessage>[],
  leafId?: string,
): ReconstructResult<TMessage> {
  if (entries.length === 0) return { messages: [], entries: [] }

  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const childrenOf = new Map<string | null, SessionEntry<TMessage>[]>()
  for (const entry of entries) {
    const list = childrenOf.get(entry.parentId) ?? []
    list.push(entry)
    childrenOf.set(entry.parentId, list)
  }

  const target = leafId !== undefined ? byId.get(leafId) : entries[entries.length - 1]
  if (!target) {
    throw new Error(`Unknown entry '${leafId}'`)
  }

  // Walk parentId back to the root, collecting root-to-leaf order.
  const path: SessionEntry<TMessage>[] = []
  let current: SessionEntry<TMessage> | undefined = target
  while (current) {
    path.unshift(current)
    current = current.parentId !== null ? byId.get(current.parentId) : undefined
  }

  // Topology repair.
  const repaired: SessionEntry<TMessage>[] = []
  for (let i = 0; i < path.length; i++) {
    const node = path[i]!
    repaired.push(node)
    const nextOnPath = path[i + 1]?.id
    const siblings = childrenOf.get(node.id) ?? []
    for (const sibling of siblings) {
      if (sibling.id !== nextOnPath) {
        repaired.push(sibling)
      }
    }
  }

  return { messages: repaired.map((entry) => entry.message), entries: repaired }
}
