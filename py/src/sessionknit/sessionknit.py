from __future__ import annotations

from typing import Callable, Generic, Optional, TypeVar

from .reconstruct import reconstruct_chain
from .storage import Storage
from .types import ResumeResult, SessionEntry

TMessage = TypeVar("TMessage")


class SessionKnit(Generic[TMessage]):
    """Durable, parent-linked session persistence: append never blocks,
    resume runs topology repair for parallel tool-call siblings, and
    detects a session that ended mid-turn rather than cleanly."""

    def __init__(
        self,
        storage: Storage[TMessage],
        has_unresolved_tool_call: Optional[Callable[[TMessage], bool]] = None,
        build_continuation: Optional[Callable[[TMessage], TMessage]] = None,
    ):
        self.storage = storage
        self.has_unresolved_tool_call = has_unresolved_tool_call
        self.build_continuation = build_continuation

    async def append(self, session_id: str, entry: SessionEntry[TMessage]) -> None:
        await self.storage.append(session_id, entry)

    async def flush(self, session_id: str) -> None:
        await self.storage.flush(session_id)

    async def resume(self, session_id: str, leaf_id: Optional[str] = None) -> ResumeResult[TMessage]:
        await self.storage.flush(session_id)
        entries = await self.storage.read_all(session_id)
        result = reconstruct_chain(entries, leaf_id)
        messages = result.messages

        last = messages[-1] if messages else None
        interrupted = last is not None and bool(
            self.has_unresolved_tool_call(last) if self.has_unresolved_tool_call else False
        )

        final_messages = messages
        if interrupted and self.build_continuation:
            final_messages = [*messages, self.build_continuation(last)]

        return ResumeResult(messages=final_messages, resumed_after_interruption=interrupted)
