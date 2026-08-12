from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from dataclasses import asdict
from pathlib import Path
from typing import Dict, Generic, List, Optional, TypeVar

from .types import SessionEntry

T = TypeVar("T")


class Storage(ABC, Generic[T]):
    @abstractmethod
    async def append(self, session_id: str, entry: SessionEntry[T]) -> None: ...

    @abstractmethod
    async def flush(self, session_id: str) -> None:
        """Force any pending writes to be durable."""
        ...

    @abstractmethod
    async def read_all(self, session_id: str) -> List[SessionEntry[T]]: ...


class FileStorage(Storage[T]):
    """Append-only JSONL storage with a debounced, batched write-behind
    queue — append() never blocks the caller. flush() (called
    automatically before every resume) forces pending lines to disk."""

    def __init__(self, directory: str, debounce_ms: int = 100):
        self.directory = Path(directory)
        self.debounce_seconds = debounce_ms / 1000
        self._pending: Dict[str, List[str]] = {}
        self._timers: Dict[str, asyncio.TimerHandle] = {}

    def _path_for(self, session_id: str) -> Path:
        return self.directory / f"{session_id}.jsonl"

    async def append(self, session_id: str, entry: SessionEntry[T]) -> None:
        lines = self._pending.setdefault(session_id, [])
        lines.append(json.dumps(asdict(entry)))

        if session_id not in self._timers:
            loop = asyncio.get_running_loop()

            def fire(sid: str = session_id) -> None:
                self._timers.pop(sid, None)
                asyncio.ensure_future(self._drain(sid))

            self._timers[session_id] = loop.call_later(self.debounce_seconds, fire)

    async def flush(self, session_id: str) -> None:
        timer = self._timers.pop(session_id, None)
        if timer:
            timer.cancel()
        await self._drain(session_id)

    async def _drain(self, session_id: str) -> None:
        lines = self._pending.pop(session_id, None)
        if not lines:
            return
        path = self._path_for(session_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a") as f:
            f.write("\n".join(lines) + "\n")

    async def read_all(self, session_id: str) -> List[SessionEntry[T]]:
        path = self._path_for(session_id)
        if not path.exists():
            return []
        entries: List[SessionEntry[T]] = []
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                data = json.loads(line)
                entries.append(SessionEntry(id=data["id"], parent_id=data["parent_id"], message=data["message"]))
        return entries


class MemoryStorage(Storage[T]):
    """Same debounce/flush contract as FileStorage, backed by memory
    instead of disk — useful for tests, and a second real example
    proving the Storage interface is genuinely swappable for a host that
    wants a database or S3 backend instead."""

    def __init__(self, debounce_ms: int = 100):
        self.debounce_seconds = debounce_ms / 1000
        self._committed: Dict[str, List[SessionEntry[T]]] = {}
        self._pending: Dict[str, List[SessionEntry[T]]] = {}
        self._timers: Dict[str, asyncio.TimerHandle] = {}

    async def append(self, session_id: str, entry: SessionEntry[T]) -> None:
        items = self._pending.setdefault(session_id, [])
        items.append(entry)

        if session_id not in self._timers:
            loop = asyncio.get_running_loop()

            def fire(sid: str = session_id) -> None:
                self._timers.pop(sid, None)
                self._drain(sid)

            self._timers[session_id] = loop.call_later(self.debounce_seconds, fire)

    async def flush(self, session_id: str) -> None:
        timer = self._timers.pop(session_id, None)
        if timer:
            timer.cancel()
        self._drain(session_id)

    def _drain(self, session_id: str) -> None:
        items = self._pending.pop(session_id, None)
        if not items:
            return
        existing = self._committed.setdefault(session_id, [])
        existing.extend(items)

    async def read_all(self, session_id: str) -> List[SessionEntry[T]]:
        return list(self._committed.get(session_id, []))
