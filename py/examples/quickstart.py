"""Run from py/: PYTHONPATH=src python3 examples/quickstart.py"""

import asyncio
from dataclasses import dataclass

from sessionknit import MemoryStorage, SessionKnit, SessionEntry


@dataclass
class Message:
    role: str
    content: str
    has_tool_call: bool = False


async def main() -> None:
    storage = MemoryStorage()
    sessionknit = SessionKnit(
        storage,
        has_unresolved_tool_call=lambda m: m.has_tool_call,
        build_continuation=lambda m: Message(
            role="user", content=f"[resumed after interruption during: {m.content}]"
        ),
    )

    # --- 1. Topology repair: a turn with two parallel tool calls ---
    session_id = "demo-session"

    await sessionknit.append(
        session_id,
        SessionEntry(id="a", parent_id=None, message=Message(role="user", content="Summarize a.txt and b.txt.")),
    )
    await sessionknit.append(
        session_id,
        SessionEntry(id="b", parent_id="a", message=Message(role="assistant", content="Reading both files.")),
    )
    # Two parallel tool results — both children of 'b', siblings of each other.
    await sessionknit.append(
        session_id,
        SessionEntry(id="tool1", parent_id="b", message=Message(role="tool", content="a.txt: revenue grew 12%")),
    )
    await sessionknit.append(
        session_id,
        SessionEntry(id="tool2", parent_id="b", message=Message(role="tool", content="b.txt: tickets dropped 8%")),
    )
    # The next turn only descends from ONE of them — a naive walk from
    # 'd' would never see tool1.
    await sessionknit.append(
        session_id,
        SessionEntry(id="d", parent_id="tool2", message=Message(role="assistant", content="Both summarized.")),
    )

    print("--- topology repair ---")
    repaired = await sessionknit.resume(session_id, "d")
    print("reconstructed order:", [m.content for m in repaired.messages])
    print(
        "includes the dropped sibling (tool1)?",
        any("revenue" in m.content for m in repaired.messages),
    )

    # --- 2. Interruption recovery ---
    crash_session = "crash-session"
    await sessionknit.append(
        crash_session,
        SessionEntry(id="x", parent_id=None, message=Message(role="user", content="Write a summary to disk.")),
    )
    await sessionknit.append(
        crash_session,
        SessionEntry(
            id="y",
            parent_id="x",
            message=Message(role="assistant", content="Calling write_file...", has_tool_call=True),
        ),
    )
    # Process "crashed" here — no tool result was ever recorded.

    print("\n--- interruption recovery ---")
    resumed = await sessionknit.resume(crash_session)
    print("resumed after interruption:", resumed.resumed_after_interruption)
    print("final messages:", [m.content for m in resumed.messages])


if __name__ == "__main__":
    asyncio.run(main())
