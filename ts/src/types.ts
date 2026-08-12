/** One node in the session's parent-linked tree. Multiple entries can
 * share the same parentId — that's exactly what a turn with parallel
 * tool calls produces (siblings), not an error case. */
export interface SessionEntry<TMessage> {
  id: string
  parentId: string | null
  message: TMessage
}

export interface ResumeResult<TMessage> {
  messages: TMessage[]
  /** True if the session ended mid-turn (an unresolved tool call with
   * no result) rather than cleanly. */
  resumedAfterInterruption: boolean
  /** id of the last *durably stored* entry in the reconstructed chain —
   * null for a brand-new session. Excludes any synthetic continuation
   * (that message was never appended), so a caller resuming a session and
   * then appending new entries should parent the first one on this, not
   * on the last entry of `messages`. */
  leafId: string | null
}

export interface SessionKnitOptions<TMessage> {
  /** Does this message contain a tool call with no result yet? Used to
   * detect a session that ended mid-turn. No default — a format SessionKnit
   * doesn't recognize is treated as clean rather than guessed at. */
  hasUnresolvedToolCall?: (message: TMessage) => boolean
  /** Given the unresolved message, build a synthetic continuation to
   * append so the reconstructed chain is valid to resend to a model. */
  buildContinuation?: (message: TMessage) => TMessage
}
