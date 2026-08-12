import pytest

from sessionknit.reconstruct import reconstruct_chain
from sessionknit.types import SessionEntry


def entry(id_: str, parent_id, content: str) -> SessionEntry:
    return SessionEntry(id=id_, parent_id=parent_id, message=content)


def test_returns_empty_result_for_no_entries():
    result = reconstruct_chain([])
    assert result.messages == []
    assert result.entries == []


def test_reconstructs_simple_linear_chain_in_order():
    entries = [entry("a", None, "A"), entry("b", "a", "B"), entry("c", "b", "C")]
    result = reconstruct_chain(entries)
    assert result.messages == ["A", "B", "C"]


def test_reattaches_sibling_branch_a_naive_walk_would_drop():
    entries = [
        entry("a", None, "A"),
        entry("b", "a", "B"),
        entry("tool1", "b", "TOOL1"),
        entry("tool2", "b", "TOOL2"),
        entry("d", "tool2", "D"),
    ]
    result = reconstruct_chain(entries, "d")
    assert result.messages == ["A", "B", "TOOL1", "TOOL2", "D"]


def test_walks_from_last_entry_when_no_leaf_id_given():
    entries = [entry("a", None, "A"), entry("b", "a", "B")]
    result = reconstruct_chain(entries)
    assert result.messages == ["A", "B"]


def test_raises_for_unknown_leaf_id():
    entries = [entry("a", None, "A")]
    with pytest.raises(ValueError, match="Unknown entry"):
        reconstruct_chain(entries, "missing")
