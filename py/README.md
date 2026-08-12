# SessionKnit (Python)

Ported line-for-line from the TypeScript implementation. See the
[root README](../README.md) for the pitch, the prior-art table, and the
scope decisions — this file only covers what's specific to running the
Python code.

## Install

```bash
pip install -e ".[dev]"
```

## Quickstart

```bash
PYTHONPATH=src python3 examples/quickstart.py
```

```python
from sessionknit import FileStorage, SessionKnit, SessionEntry

sessionknit = SessionKnit(
    FileStorage("./sessions"),
    has_unresolved_tool_call=lambda m: m.has_tool_call,
    build_continuation=lambda m: Message(role="user", content="Continue from where you left off."),
)

await sessionknit.append(session_id, SessionEntry(id=id, parent_id=parent_id, message=message))

result = await sessionknit.resume(session_id)
# result.messages, result.resumed_after_interruption
```

## Test

```bash
pytest
```

## Status

Chain reconstruction, topology repair, the async write-behind queue, and
interruption detection are real and tested. Not yet published to PyPI —
`sessionknit` is unclaimed there.
