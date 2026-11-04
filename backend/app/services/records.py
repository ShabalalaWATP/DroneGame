"""The rules for saved records. Each service depends only on the small store interface beside it, so nothing here knows about SQL
or HTTP, and timestamps are always set by the server."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

Record = dict[str, Any]


class NotFound(Exception):
    """The record does not exist."""


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _found(record: Record | None) -> Record:
    if record is None:
        raise NotFound
    return record


def _deleted(existed: bool) -> None:
    if not existed:
        raise NotFound


class LaydownStore(Protocol):
    def list(self) -> list[Record]: ...
    def get(self, laydown_id: int) -> Record | None: ...
    def add(self, data: Record, now: str) -> int: ...
    def replace(self, laydown_id: int, data: Record, now: str) -> bool: ...
    def delete(self, laydown_id: int) -> bool: ...


class LaydownService:
    def __init__(self, store: LaydownStore, clock: Callable[[], str] = utc_now) -> None:
        self.store, self.clock = store, clock

    def list(self) -> list[Record]:
        return self.store.list()

    def get(self, laydown_id: int) -> Record:
        return _found(self.store.get(laydown_id))

    def create(self, data: Record) -> Record:
        return self.get(self.store.add(data, self.clock()))

    def replace(self, laydown_id: int, data: Record) -> Record:
        if not self.store.replace(laydown_id, data, self.clock()):
            raise NotFound
        return self.get(laydown_id)

    def delete(self, laydown_id: int) -> None:
        _deleted(self.store.delete(laydown_id))


class RunStore(Protocol):
    def list(self, limit: int, offset: int) -> tuple[list[Record], int]: ...
    def get(self, run_id: int) -> Record | None: ...
    def add(self, data: Record, now: str) -> int: ...
    def delete(self, run_id: int) -> bool: ...


class RunService:
    """Runs are a record of what happened, so they can be deleted but never edited. Results come from the browser, so they are
    not proof of a score."""

    def __init__(self, store: RunStore, clock: Callable[[], str] = utc_now) -> None:
        self.store, self.clock = store, clock

    def list(self, limit: int, offset: int) -> Record:
        items, total = self.store.list(limit, offset)
        return {"items": items, "total": total}

    def get(self, run_id: int) -> Record:
        return _found(self.store.get(run_id))

    def record(self, data: Record) -> Record:
        return self.get(self.store.add(data, self.clock()))

    def delete(self, run_id: int) -> None:
        _deleted(self.store.delete(run_id))


class FigureSetStore(Protocol):
    def list(self) -> list[Record]: ...
    def get(self, figure_set_id: int) -> Record | None: ...
    def add(self, data: Record, now: str) -> int: ...
    def delete(self, figure_set_id: int) -> bool: ...


class FigureSetService:
    def __init__(self, store: FigureSetStore, clock: Callable[[], str] = utc_now) -> None:
        self.store, self.clock = store, clock

    def list(self) -> list[Record]:
        return self.store.list()

    def get(self, figure_set_id: int) -> Record:
        return _found(self.store.get(figure_set_id))

    def create(self, data: Record) -> Record:
        return self.get(self.store.add(data, self.clock()))

    def delete(self, figure_set_id: int) -> None:
        _deleted(self.store.delete(figure_set_id))
