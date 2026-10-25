"""schema_version() on the Supabase dev project (T50).

The deploy compares it with the newest file in supabase/migrations, so on dev, where every migration is applied, the
two must be equal. Skips without server/.env, like test_rls.py.
"""

import secrets
from pathlib import Path

import pytest

from tests.supabase_api import Supabase, load_config

CONFIG = load_config()
MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

pytestmark = [
    pytest.mark.supabase,
    pytest.mark.skipif(CONFIG is None, reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (server/.env)"),
]


@pytest.fixture(scope="module")
def sb():
    client = Supabase(CONFIG)
    yield client
    client.http.close()


def newest_migration() -> str:
    return max(f.name for f in MIGRATIONS.glob("*.sql")).split("_", 1)[0]


def test_migration_names_start_with_a_14_digit_timestamp():
    for f in MIGRATIONS.glob("*.sql"):
        prefix = f.name.split("_", 1)[0]
        assert len(prefix) == 14 and prefix.isdigit(), f.name


def test_anon_reads_the_newest_applied_migration(sb):
    res = sb.rpc("schema_version", sb.anon())
    assert res.status_code == 200, res.text
    assert res.json() == newest_migration()


def test_signed_in_users_read_it_too(sb):
    user = sb.create_user(f"schema-version-{secrets.token_hex(4)}@example.com")
    try:
        res = sb.rpc("schema_version", sb.as_user(user))
        assert res.status_code == 200, res.text
        assert res.json() == newest_migration()
    finally:
        sb.delete_user(user.id)
