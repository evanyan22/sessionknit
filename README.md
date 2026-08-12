# SessionKnit

**Durable, DAG-shaped session persistence that survives parallel tool
calls and mid-turn interruption — splice the conversation back together
on resume.**

Every agent framework treats persistence as "save a flat array of
messages, reload it." That breaks the moment a turn has parallel tool
calls — which produce sibling branches, not a line — or the process dies
mid-call, leaving an unresolved tool call that most model APIs will
flatly reject on the next request.

LangGraph, the framework most explicitly built around resumable state,
has **four separate open, maintainer-acknowledged GitHub issues** about
exactly this: parallel-tool interrupts generating identical IDs, its own
`ToolNode` not collecting all interrupts, resume values misrouted between
tools. Their documented workaround is "avoid mixing tool types in one
node" — a workaround, not a fix.

SessionKnit extracts the approach production coding agents use internally as a portable library.

> **Status: v1, in progress.** Chain reconstruction, topology repair for
> parallel-call siblings, and interruption detection all work end-to-end
> (see `ts/README.md`). Published:
> [`sessionknit` on PyPI](https://pypi.org/project/sessionknit/),
> [`sessionknit` on npm](https://www.npmjs.com/package/sessionknit).

---

## Prior art — verified before building, not assumed

| Checked | Result |
|---|---|
| LangGraph | Has checkpointing/`interrupt()` — 4 open, maintainer-acknowledged issues on parallel-tool resume specifically |
| OpenAI Agents SDK | Flat conversation-item model, no DAG topology handling |
| Vercel AI SDK | Solves stream reconnect, not conversation resume — explicitly doesn't survive real interruption |
| Temporal | Real durable-execution layer, but generic workflow recovery, not conversation-DAG-specific |
| `rejoin` (PyPI) | Dashboard that browses sessions other tools already wrote — a consumer of this layer, not a competitor |
| `rethread` (npm) | Quota-triggered handoff between different coding-agent tools — adjacent, different mechanism |

Third clean read of this kind this session, after ToolLane and Reflow —
and the best-evidenced of the three, since the closest competitor has
open bugs about the exact problem this solves.

## How it works

```
 naive parent walk:        sessionknit: topology repair:
 A → B → tool2 → D         A → B → [tool1, tool2] → D
     (tool1 silently           (both branches reattached)
      dropped)
```

1. Every entry appends to a durable, parent-linked log — non-blocking,
   debounced, batched.
2. On resume, walk the parent chain back from the target leaf to the
   root.
3. Topology repair: at each node on that path, any *other* children
   (siblings of the node that continues the path) are reattached —
   exactly what parallel tool calls produce, and exactly what a naive
   single-parent walk drops.
4. Interruption detection: if the last message has an unresolved tool
   call, flag the session as `resumedAfterInterruption` and, if
   configured, inject a synthetic continuation so the reconstructed
   history is valid to resend to a model.

## Scope (v1)

**In:**
- Append-only, parent-linked durable log format
- Async, debounced, non-blocking write queue (`FileStorage`), plus
  `MemoryStorage` proving the `Storage` interface is genuinely swappable
- Chain reconstruction with topology repair for parallel-call siblings
- Interruption detection with synthetic-continuation injection
- An explicit `resumedAfterInterruption` flag on the result

**Out, for now:**
- Non-local storage backends beyond the `Storage` interface (S3, a
  database — implement the interface yourself)
- Cross-session memory/knowledge extraction — a separate, weaker concern
  (see the sibling research in ActAuth's project history)
- Any dashboard or UI for browsing sessions — that's a consumer of this
  format, not this layer (see `rejoin` in the prior-art table)

## Repo layout

```
ts/    TypeScript implementation — see ts/README.md
py/    Python implementation — see py/README.md
```

Both ported line-for-line, same behavior. `py/` and `ts/` started as
siblings from day one.

## License

MIT — see [LICENSE](LICENSE).
