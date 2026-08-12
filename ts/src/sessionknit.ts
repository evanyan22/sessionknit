import { reconstructChain } from './reconstruct.js'
import type { Storage } from './storage.js'
import type { ResumeResult, SessionKnitOptions, SessionEntry } from './types.js'

/** Durable, parent-linked session persistence: append never blocks,
 * resume runs topology repair for parallel tool-call siblings, and
 * detects a session that ended mid-turn rather than cleanly. */
export class SessionKnit<TMessage> {
  constructor(
    private readonly storage: Storage<TMessage>,
    private readonly options: SessionKnitOptions<TMessage> = {},
  ) {}

  async append(sessionId: string, entry: SessionEntry<TMessage>): Promise<void> {
    await this.storage.append(sessionId, entry)
  }

  async flush(sessionId: string): Promise<void> {
    await this.storage.flush(sessionId)
  }

  async resume(sessionId: string, leafId?: string): Promise<ResumeResult<TMessage>> {
    await this.storage.flush(sessionId)
    const entries = await this.storage.readAll(sessionId)
    const { messages, entries: repaired } = reconstructChain(entries, leafId)

    const lastEntry = repaired[repaired.length - 1]
    const interrupted = lastEntry !== undefined && (this.options.hasUnresolvedToolCall?.(lastEntry.message) ?? false)

    let finalMessages = messages
    if (interrupted && this.options.buildContinuation) {
      finalMessages = [...messages, this.options.buildContinuation(lastEntry!.message)]
    }

    return { messages: finalMessages, resumedAfterInterruption: interrupted, leafId: lastEntry?.id ?? null }
  }
}
