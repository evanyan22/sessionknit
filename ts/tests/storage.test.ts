import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileStorage, MemoryStorage } from '../src/storage.js'

describe('MemoryStorage', () => {
  it('does not make an appended entry visible until flush', async () => {
    const storage = new MemoryStorage<string>(10000) // long enough not to auto-fire during the test
    await storage.append('s1', { id: 'a', parentId: null, message: 'A' })
    expect(await storage.readAll('s1')).toEqual([])

    await storage.flush('s1')
    expect(await storage.readAll('s1')).toEqual([{ id: 'a', parentId: null, message: 'A' }])
  })

  it('batches multiple appends into one flush', async () => {
    const storage = new MemoryStorage<string>(10000)
    await storage.append('s1', { id: 'a', parentId: null, message: 'A' })
    await storage.append('s1', { id: 'b', parentId: 'a', message: 'B' })
    await storage.flush('s1')
    const all = await storage.readAll('s1')
    expect(all.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('auto-flushes after the debounce window elapses', async () => {
    const storage = new MemoryStorage<string>(5)
    await storage.append('s1', { id: 'a', parentId: null, message: 'A' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(await storage.readAll('s1')).toEqual([{ id: 'a', parentId: null, message: 'A' }])
  })
})

describe('FileStorage', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sessionknit-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists entries to a JSONL file after flush', async () => {
    const storage = new FileStorage<string>(dir, 10000)
    await storage.append('s1', { id: 'a', parentId: null, message: 'A' })
    await storage.append('s1', { id: 'b', parentId: 'a', message: 'B' })
    await storage.flush('s1')

    const all = await storage.readAll('s1')
    expect(all).toEqual([
      { id: 'a', parentId: null, message: 'A' },
      { id: 'b', parentId: 'a', message: 'B' },
    ])
  })

  it('returns an empty array for a session that was never written', async () => {
    const storage = new FileStorage<string>(dir, 10000)
    expect(await storage.readAll('never-existed')).toEqual([])
  })
})
