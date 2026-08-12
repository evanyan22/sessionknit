// Run from ts/: npm run quickstart

import { MemoryStorage, SessionKnit } from '../src/index.js'

interface Message {
  role: string
  content: string
  hasToolCall?: boolean
}

const storage = new MemoryStorage<Message>()
const sessionknit = new SessionKnit<Message>(storage, {
  hasUnresolvedToolCall: (m) => m.hasToolCall === true,
  buildContinuation: (m) => ({
    role: 'user',
    content: `[resumed after interruption during: ${m.content}]`,
  }),
})

// --- 1. Topology repair: a turn with two parallel tool calls ---
const sessionId = 'demo-session'

await sessionknit.append(sessionId, { id: 'a', parentId: null, message: { role: 'user', content: 'Summarize a.txt and b.txt.' } })
await sessionknit.append(sessionId, { id: 'b', parentId: 'a', message: { role: 'assistant', content: 'Reading both files.' } })
// Two parallel tool results — both children of 'b', siblings of each other.
await sessionknit.append(sessionId, { id: 'tool1', parentId: 'b', message: { role: 'tool', content: 'a.txt: revenue grew 12%' } })
await sessionknit.append(sessionId, { id: 'tool2', parentId: 'b', message: { role: 'tool', content: 'b.txt: tickets dropped 8%' } })
// The next turn only descends from ONE of them — a naive walk from 'd'
// would never see tool1.
await sessionknit.append(sessionId, { id: 'd', parentId: 'tool2', message: { role: 'assistant', content: 'Both summarized.' } })

console.log('--- topology repair ---')
const repaired = await sessionknit.resume(sessionId, 'd')
console.log('reconstructed order:', repaired.messages.map((m) => m.content))
console.log(
  'includes the dropped sibling (tool1)?',
  repaired.messages.some((m) => m.content.includes('revenue')),
)

// --- 2. Interruption recovery ---
const crashSession = 'crash-session'
await sessionknit.append(crashSession, { id: 'x', parentId: null, message: { role: 'user', content: 'Write a summary to disk.' } })
await sessionknit.append(crashSession, {
  id: 'y',
  parentId: 'x',
  message: { role: 'assistant', content: 'Calling write_file...', hasToolCall: true },
})
// Process "crashed" here — no tool result was ever recorded.

console.log('\n--- interruption recovery ---')
const resumed = await sessionknit.resume(crashSession)
console.log('resumed after interruption:', resumed.resumedAfterInterruption)
console.log('final messages:', resumed.messages.map((m) => m.content))
