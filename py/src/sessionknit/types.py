from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, List, Optional, TypeVar

T = TypeVar("T")


@dataclass
class SessionEntry(Generic[T]):
    """One node in the session's parent-linked tree. Multiple entries
    can share the same parent_id — that's exactly what a turn with
    parallel tool calls produces (siblings), not an error case."""

    id: str
    parent_id: Optional[str]
    message: T


@dataclass
class ResumeResult(Generic[T]):
    messages: List[T]
    # True if the session ended mid-turn (an unresolved tool call with
    # no result) rather than cleanly.
    resumed_after_interruption: bool
