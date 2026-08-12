import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SessionEntry } from './types.js'

export interface Storage<TMessage> {
  append(sessionId: string, entry: SessionEntry<TMessage>): Promise<void>
  /** Force any pending writes to be durable. */
  flush(sessionId: string): Promise<void>
  readAll(sessionId: string): Promise<SessionEntry<TMessage>[]>
}

/** Append-only JSONL storage with a debounced, batched write-behind
 * queue — append() never blocks the caller. flush() (called
 * automatically before every resume) forces pending lines to disk. */
export class FileStorage<TMessage> implements Storage<TMessage> {
  private readonly pending = new Map<string, string[]>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly dir: string,
    private readonly debounceMs: number = 100,
  ) {}

  private pathFor(sessionId: string): string {
    // sessionId is caller-controlled and often comes straight from
    // untrusted input (a CLI flag, an HTTP body) — strip path separators so
    // it can't escape `dir` via `../` traversal.
    const safeId = sessionId.replace(/[/\\]/g, '_')
    return join(this.dir, `${safeId}.jsonl`)
  }

  async append(sessionId: string, entry: SessionEntry<TMessage>): Promise<void> {
    const lines = this.pending.get(sessionId) ?? []
    lines.push(JSON.stringify(entry))
    this.pending.set(sessionId, lines)

    if (!this.timers.has(sessionId)) {
      const timer = setTimeout(() => {
        this.timers.delete(sessionId)
        void this.drain(sessionId)
      }, this.debounceMs)
      this.timers.set(sessionId, timer)
    }
  }

  async flush(sessionId: string): Promise<void> {
    const timer = this.timers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(sessionId)
    }
    await this.drain(sessionId)
  }

  private async drain(sessionId: string): Promise<void> {
    const lines = this.pending.get(sessionId)
    if (!lines || lines.length === 0) return
    this.pending.delete(sessionId)

    const path = this.pathFor(sessionId)
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, `${lines.join('\n')}\n`)
  }

  async readAll(sessionId: string): Promise<SessionEntry<TMessage>[]> {
    try {
      const content = await readFile(this.pathFor(sessionId), 'utf8')
      return content
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as SessionEntry<TMessage>)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
}

/** Same debounce/flush contract as FileStorage, backed by memory instead
 * of disk — useful for tests, and a second real example proving the
 * Storage interface is genuinely swappable for a host that wants a
 * database or S3 backend instead. */
export class MemoryStorage<TMessage> implements Storage<TMessage> {
  private readonly committed = new Map<string, SessionEntry<TMessage>[]>()
  private readonly pending = new Map<string, SessionEntry<TMessage>[]>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly debounceMs: number = 100) {}

  async append(sessionId: string, entry: SessionEntry<TMessage>): Promise<void> {
    const items = this.pending.get(sessionId) ?? []
    items.push(entry)
    this.pending.set(sessionId, items)

    if (!this.timers.has(sessionId)) {
      const timer = setTimeout(() => {
        this.timers.delete(sessionId)
        this.drain(sessionId)
      }, this.debounceMs)
      this.timers.set(sessionId, timer)
    }
  }

  async flush(sessionId: string): Promise<void> {
    const timer = this.timers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(sessionId)
    }
    this.drain(sessionId)
  }

  private drain(sessionId: string): void {
    const items = this.pending.get(sessionId)
    if (!items || items.length === 0) return
    this.pending.delete(sessionId)
    const existing = this.committed.get(sessionId) ?? []
    this.committed.set(sessionId, [...existing, ...items])
  }

  async readAll(sessionId: string): Promise<SessionEntry<TMessage>[]> {
    return this.committed.get(sessionId) ?? []
  }
}
