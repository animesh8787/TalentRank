"""Self-healing schema sync for databases that predate a model change.

TalentRank has never had a migration framework — `Base.metadata.create_all()`
already creates any table that doesn't exist yet at startup, which is fine
for a brand new database but does nothing for one that already has an older
version of a table that just gained columns (e.g. Render's optional
persistent Postgres, or anyone's long-lived local SQLite file). This module
extends that same "create what's missing" idea to columns: for a table that
already exists, any column present on the model but missing from the live
table is added with `ALTER TABLE ... ADD COLUMN`, backfilled for existing
rows from the model's Python-side default.

Deliberately not a general migration tool: it only ever *adds* a column,
never renames, drops or changes the type of one, and it always adds columns
as nullable regardless of what the model declares — altering a populated
table to NOT NULL without a server-side default is exactly the kind of
migration that needs a human to check data first, not an auto-heal on
startup. New rows still get the Python-side default via the ORM either way,
so relaxed nullability at the DB level costs nothing in practice. If a
future change needs more than "add a column" (renames, drops, backfilling
computed values, non-nullable columns on a populated table), that's the
point to introduce a real migration tool such as Alembic instead.
"""
from __future__ import annotations

import enum as py_enum
import logging

from sqlalchemy import Enum as SAEnum, inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.schema import Column, Table

from app.models import Base

logger = logging.getLogger(__name__)


def sync_schema(engine: Engine) -> None:
    """Create any missing table, then add any column missing from the rest.

    Safe to call on every startup: `create_all` is already idempotent, and
    the column check below only ever adds a column that isn't already there.
    """
    Base.metadata.create_all(engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # just created above by create_all, already complete
            existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                _add_column(conn, table, column)


def _add_column(conn: Connection, table: Table, column: Column) -> None:
    dialect = conn.dialect

    # A native enum type (Postgres) needs its CREATE TYPE emitted separately
    # before a column can use it — create_all does this automatically as
    # part of creating a whole table, but a manual ALTER on an existing
    # table doesn't trigger that. SQLite has no native enum type: the same
    # column compiles to a plain VARCHAR, so this is a no-op there.
    if isinstance(column.type, SAEnum) and hasattr(column.type, "create"):
        column.type.create(conn, checkfirst=True)

    type_sql = column.type.compile(dialect=dialect)
    default_sql = _literal_default(column, dialect.name)

    ddl = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {type_sql}"
    if default_sql is not None:
        ddl += f" DEFAULT {default_sql}"
    logger.info("Schema sync: adding column %s.%s", table.name, column.name)
    conn.execute(text(ddl))

    if default_sql is not None:
        # Belt and suspenders: SQLite and modern Postgres both backfill
        # existing rows from a constant DEFAULT on ADD COLUMN, but an
        # explicit UPDATE guarantees it regardless of dialect/version.
        conn.execute(text(f"UPDATE {table.name} SET {column.name} = {default_sql} WHERE {column.name} IS NULL"))


def _literal_default(column: Column, dialect_name: str) -> str | None:
    """The model's Python-side default as a SQL literal, or None if it has
    none (or isn't a plain scalar — a callable default has nothing to
    backfill existing rows with, so it's simply left NULL)."""
    if column.default is None or not column.default.is_scalar:
        return None
    value = column.default.arg
    if value is None:
        return None
    if isinstance(value, py_enum.Enum):
        value = value.value
    if isinstance(value, bool):
        return ("1" if value else "0") if dialect_name == "sqlite" else ("TRUE" if value else "FALSE")
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None
