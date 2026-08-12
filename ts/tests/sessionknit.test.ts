import { describe, expect, it } from 'vitest'
import { SessionKnit } from '../src/sessionknit.js'
import { MemoryStorage } from '../src/storage.js'

interface Message {
  role: string
  content: string
  hasToolCall?: boolean
}

describe('SessionKnit.resume', () => {
  it('reconstructs a clean session with no interruption flagged', async () => {
    const storage = new MemoryStorage<Message>(10)
    const sessionknit = new SessionKnit(storage)

    await sessionknit.append('s1', { id: 'a', parentId: null, message: { role: 'user', content: 'hi' } })
    await sessionknit.append('s1', { id: 'b', parentId: 'a', message: { role: 'assistant', content: 'hello' } })

    const result = await sessionknit.resume('s1')
    expect(result.resumedAfterInterruption).toBe(false)
    expect(result.messages.map((m) => m.content)).toEqual(['hi', 'hello'])
  })

  it('reattaches a dropped parallel-tool-call sibling on resume', async () => {
    const storage = new MemoryStorage<Message>(10)
    const sessionknit = new SessionKnit(storage)

    await sessionknit.append('s1', { id: 'a', parentId: null, message: { role: 'user', content: 'A' } })
    await sessionknit.append('s1', { id: 'b', parentId: 'a', message: { role: 'assistant', content: 'B' } })
    await sessionknit.append('s1', { id: 'tool1', parentId: 'b', message: { role: 'tool', content: 'TOOL1' } })
    await sessionknit.append('s1', { id: 'tool2', parentId: 'b', message: { role: 'tool', content: 'TOOL2' } })
    await sessionknit.append('s1', { id: 'd', parentId: 'tool2', message: { role: 'assistant', content: 'D' } })

    const result = await sessionknit.resume('s1', 'd')
    expect(result.messages.map((m) => m.content)).toEqual(['A', 'B', 'TOOL1', 'TOOL2', 'D'])
  })

  it('flags interruption and appends a synthetic continuation when configured', async () => {
    const storage = new MemoryStorage<Message>(10)
    const sessionknit = new SessionKnit(storage, {
      hasUnresolvedToolCall: (m) => m.hasToolCall === true,
      buildContinuation: (m) => ({ role: 'user', content: `continue: ${m.content}` }),
    })

    await sessionknit.append('s1', { id: 'a', parentId: null, message: { role: 'user', content: 'go' } })
    await sessionknit.append('s1', {
      id: 'b',
      parentId: 'a',
      message: { role: 'assistant', content: 'calling tool', hasToolCall: true },
    })

    const result = await sessionknit.resume('s1')
    expect(result.resumedAfterInterruption).toBe(true)
    expect(result.messages.map((m) => m.content)).toEqual(['go', 'calling tool', 'continue: calling tool'])
  })

  it('flags interruption without appending anything when no buildContinuation is configured', async () => {
    const storage = new MemoryStorage<Message>(10)
    const sessionknit = new SessionKnit(storage, {
      hasUnresolvedToolCall: (m) => m.hasToolCall === true,
    })

    await sessionknit.append('s1', {
      id: 'a',
      parentId: null,
      message: { role: 'assistant', content: 'calling tool', hasToolCall: true },
    })

    const result = await sessionknit.resume('s1')
    expect(result.resumedAfterInterruption).toBe(true)
    expect(result.messages.map((m) => m.content)).toEqual(['calling tool'])
  })

  it('flushes pending writes automatically before reading on resume', async () => {
    const storage = new MemoryStorage<Message>(10000) // would never auto-fire in time
    const sessionknit = new SessionKnit(storage)
    await sessionknit.append('s1', { id: 'a', parentId: null, message: { role: 'user', content: 'hi' } })

    const result = await sessionknit.resume('s1')
    expect(result.messages).toHaveLength(1)
  })
})
