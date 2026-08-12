# SessionKnit (TypeScript)

See the [root README](../README.md) for the pitch, the prior-art table,
and the scope decisions. This file only covers what's specific to running
the code.

## Install

```bash
npm install
```

## Quickstart

```bash
npm run quickstart
```

```ts
import { FileStorage, SessionKnit } from './src/index.js'

const sessionknit = new SessionKnit(new FileStorage('./sessions'), {
  hasUnresolvedToolCall: (m) => m.toolCalls?.some((c) => !c.result) ?? false,
  buildContinuation: (m) => ({ role: 'user', content: 'Continue from where you left off.' }),
})

await sessionknit.append(sessionId, { id, parentId, message })

const { messages, resumedAfterInterruption } = await sessionknit.resume(sessionId)
```

## Test / build

```bash
npm test        # vitest
npm run build   # tsc -> dist/
```

## Status

Chain reconstruction, topology repair, the async write-behind queue, and
interruption detection are real and tested. Published as
[`sessionknit`](https://www.npmjs.com/package/sessionknit) on npm.
