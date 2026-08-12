import { describe, expect, it } from 'vitest'
import { reconstructChain } from '../src/reconstruct.js'
import type { SessionEntry } from '../src/types.js'

function entry(id: string, parentId: string | null, content: string): SessionEntry<string> {
  return { id, parentId, message: content }
}

describe('reconstructChain', () => {
  it('returns an empty result for no entries', () => {
    expect(reconstructChain([])).toEqual({ messages: [], entries: [] })
  })

  it('reconstructs a simple linear chain in order', () => {
    const entries = [entry('a', null, 'A'), entry('b', 'a', 'B'), entry('c', 'b', 'C')]
    const result = reconstructChain(entries)
    expect(result.messages).toEqual(['A', 'B', 'C'])
  })

  it('reattaches a sibling branch a naive walk would drop', () => {
    const entries = [
      entry('a', null, 'A'),
      entry('b', 'a', 'B'),
      entry('tool1', 'b', 'TOOL1'),
      entry('tool2', 'b', 'TOOL2'),
      entry('d', 'tool2', 'D'),
    ]
    const result = reconstructChain(entries, 'd')
    expect(result.messages).toEqual(['A', 'B', 'TOOL1', 'TOOL2', 'D'])
  })

  it('walks from the last entry when no leafId is given', () => {
    const entries = [entry('a', null, 'A'), entry('b', 'a', 'B')]
    const result = reconstructChain(entries)
    expect(result.messages).toEqual(['A', 'B'])
  })

  it('throws for an unknown leafId', () => {
    const entries = [entry('a', null, 'A')]
    expect(() => reconstructChain(entries, 'missing')).toThrow(/Unknown entry/)
  })
})
