import asyncio

from sessionknit.sessionknit import SessionKnit
from sessionknit.storage import MemoryStorage
from sessionknit.types import SessionEntry


class Message:
    def __init__(self, role: str, content: str, has_tool_call: bool = False):
        self.role = role
        self.content = content
        self.has_tool_call = has_tool_call


def test_reconstructs_clean_session_with_no_interruption_flagged():
    async def run():
        storage = MemoryStorage(10)
        sessionknit = SessionKnit(storage)

        await sessionknit.append("s1", SessionEntry(id="a", parent_id=None, message=Message("user", "hi")))
        await sessionknit.append("s1", SessionEntry(id="b", parent_id="a", message=Message("assistant", "hello")))

        result = await sessionknit.resume("s1")
        assert result.resumed_after_interruption is False
        assert [m.content for m in result.messages] == ["hi", "hello"]

    asyncio.run(run())


def test_reattaches_dropped_parallel_tool_call_sibling_on_resume():
    async def run():
        storage = MemoryStorage(10)
        sessionknit = SessionKnit(storage)

        await sessionknit.append("s1", SessionEntry(id="a", parent_id=None, message=Message("user", "A")))
        await sessionknit.append("s1", SessionEntry(id="b", parent_id="a", message=Message("assistant", "B")))
        await sessionknit.append("s1", SessionEntry(id="tool1", parent_id="b", message=Message("tool", "TOOL1")))
        await sessionknit.append("s1", SessionEntry(id="tool2", parent_id="b", message=Message("tool", "TOOL2")))
        await sessionknit.append("s1", SessionEntry(id="d", parent_id="tool2", message=Message("assistant", "D")))

        result = await sessionknit.resume("s1", "d")
        assert [m.content for m in result.messages] == ["A", "B", "TOOL1", "TOOL2", "D"]

    asyncio.run(run())


def test_flags_interruption_and_appends_synthetic_continuation_when_configured():
    async def run():
        storage = MemoryStorage(10)
        sessionknit = SessionKnit(
            storage,
            has_unresolved_tool_call=lambda m: m.has_tool_call,
            build_continuation=lambda m: Message("user", f"continue: {m.content}"),
        )

        await sessionknit.append("s1", SessionEntry(id="a", parent_id=None, message=Message("user", "go")))
        await sessionknit.append(
            "s1",
            SessionEntry(id="b", parent_id="a", message=Message("assistant", "calling tool", has_tool_call=True)),
        )

        result = await sessionknit.resume("s1")
        assert result.resumed_after_interruption is True
        assert [m.content for m in result.messages] == ["go", "calling tool", "continue: calling tool"]

    asyncio.run(run())


def test_flags_interruption_without_appending_when_no_build_continuation_configured():
    async def run():
        storage = MemoryStorage(10)
        sessionknit = SessionKnit(storage, has_unresolved_tool_call=lambda m: m.has_tool_call)

        await sessionknit.append(
            "s1",
            SessionEntry(id="a", parent_id=None, message=Message("assistant", "calling tool", has_tool_call=True)),
        )

        result = await sessionknit.resume("s1")
        assert result.resumed_after_interruption is True
        assert [m.content for m in result.messages] == ["calling tool"]

    asyncio.run(run())


def test_flushes_pending_writes_automatically_before_reading_on_resume():
    async def run():
        storage = MemoryStorage(10000)  # would never auto-fire in time
        sessionknit = SessionKnit(storage)
        await sessionknit.append("s1", SessionEntry(id="a", parent_id=None, message=Message("user", "hi")))

        result = await sessionknit.resume("s1")
        assert len(result.messages) == 1

    asyncio.run(run())
