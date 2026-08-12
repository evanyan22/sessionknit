import asyncio

from sessionknit.storage import FileStorage, MemoryStorage
from sessionknit.types import SessionEntry


def test_does_not_make_entry_visible_until_flush():
    async def run():
        storage = MemoryStorage(10000)
        await storage.append("s1", SessionEntry(id="a", parent_id=None, message="A"))
        assert await storage.read_all("s1") == []

        await storage.flush("s1")
        assert await storage.read_all("s1") == [SessionEntry(id="a", parent_id=None, message="A")]

    asyncio.run(run())


def test_batches_multiple_appends_into_one_flush():
    async def run():
        storage = MemoryStorage(10000)
        await storage.append("s1", SessionEntry(id="a", parent_id=None, message="A"))
        await storage.append("s1", SessionEntry(id="b", parent_id="a", message="B"))
        await storage.flush("s1")
        all_entries = await storage.read_all("s1")
        assert [e.id for e in all_entries] == ["a", "b"]

    asyncio.run(run())


def test_auto_flushes_after_debounce_window_elapses():
    async def run():
        storage = MemoryStorage(5)
        await storage.append("s1", SessionEntry(id="a", parent_id=None, message="A"))
        await asyncio.sleep(0.03)
        assert await storage.read_all("s1") == [SessionEntry(id="a", parent_id=None, message="A")]

    asyncio.run(run())


def test_file_storage_persists_entries_after_flush(tmp_path):
    async def run():
        storage = FileStorage(str(tmp_path), 10000)
        await storage.append("s1", SessionEntry(id="a", parent_id=None, message="A"))
        await storage.append("s1", SessionEntry(id="b", parent_id="a", message="B"))
        await storage.flush("s1")

        all_entries = await storage.read_all("s1")
        assert all_entries == [
            SessionEntry(id="a", parent_id=None, message="A"),
            SessionEntry(id="b", parent_id="a", message="B"),
        ]

    asyncio.run(run())


def test_file_storage_returns_empty_for_never_written_session(tmp_path):
    async def run():
        storage = FileStorage(str(tmp_path), 10000)
        assert await storage.read_all("never-existed") == []

    asyncio.run(run())
