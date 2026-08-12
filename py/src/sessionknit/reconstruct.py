from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Generic, List, Optional, TypeVar

from .types import SessionEntry

T = TypeVar("T")


@dataclass
class ReconstructResult(Generic[T]):
    messages: List[T]
    entries: List[SessionEntry[T]]


def reconstruct_chain(entries: List[SessionEntry[T]], leaf_id: Optional[str] = None) -> ReconstructResult[T]:
    """Pure reconstruction — no I/O, so it's testable without a storage
    backend. Walks parent_id from the target leaf back to the root, then
    runs topology repair: at each node on that path, any *other*
    children (siblings of the node that continues the path) are
    reattached too — exactly what a turn with parallel tool calls
    produces, and exactly what a naive single-parent walk would silently
    drop.
    """
    if not entries:
        return ReconstructResult(messages=[], entries=[])

    by_id: Dict[str, SessionEntry[T]] = {entry.id: entry for entry in entries}
    children_of: Dict[Optional[str], List[SessionEntry[T]]] = {}
    for entry in entries:
        children_of.setdefault(entry.parent_id, []).append(entry)

    target = by_id.get(leaf_id) if leaf_id is not None else entries[-1]
    if target is None:
        raise ValueError(f"Unknown entry '{leaf_id}'")

    # Walk parent_id back to the root, collecting root-to-leaf order.
    path: List[SessionEntry[T]] = []
    current: Optional[SessionEntry[T]] = target
    while current is not None:
        path.insert(0, current)
        current = by_id.get(current.parent_id) if current.parent_id is not None else None

    # Topology repair.
    repaired: List[SessionEntry[T]] = []
    for i, node in enumerate(path):
        repaired.append(node)
        next_on_path = path[i + 1].id if i + 1 < len(path) else None
        siblings = children_of.get(node.id, [])
        for sibling in siblings:
            if sibling.id != next_on_path:
                repaired.append(sibling)

    return ReconstructResult(messages=[entry.message for entry in repaired], entries=repaired)
