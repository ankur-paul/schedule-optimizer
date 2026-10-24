"""Offline tests for the Supabase test helper's config loading."""

import json

import httpx

from supabase_env import key_headers, load_config, read_env_file
from tests.supabase_api import Supabase


def test_read_env_file_missing_is_empty(tmp_path):
    assert read_env_file(tmp_path / "nope.env") == {}


def test_read_env_file_quotes_comments_and_blank_lines(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "# comment\n"
        "\n"
        "SUPABASE_URL='https://abc.supabase.co'\n"
        'SUPABASE_ANON_KEY="sb_publishable_x"\n'
        "PLAIN=value=with=equals\n"
        "QUOTE='it'\\''s'\n"
        "not a pair\n"
    )
    assert read_env_file(env) == {
        "SUPABASE_URL": "https://abc.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_x",
        "PLAIN": "value=with=equals",
        "QUOTE": "it's",
    }


def test_load_config_needs_url_and_service_key(tmp_path, monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(key, raising=False)
    env = tmp_path / ".env"
    env.write_text("SUPABASE_URL='https://abc.supabase.co'\nSUPABASE_SERVICE_ROLE_KEY=''\n")
    assert load_config(env) is None
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_y")
    assert load_config(env) == {
        "SUPABASE_URL": "https://abc.supabase.co",
        "SUPABASE_ANON_KEY": "",
        "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_y",
    }


def test_load_config_environment_wins_over_file(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("SUPABASE_URL='https://file.supabase.co'\nSUPABASE_SERVICE_ROLE_KEY='file'\n")
    monkeypatch.setenv("SUPABASE_URL", "https://env.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    config = load_config(env)
    assert config["SUPABASE_URL"] == "https://env.supabase.co"
    assert config["SUPABASE_SERVICE_ROLE_KEY"] == "file"


def test_key_headers_by_key_style():
    assert key_headers("sb_secret_abc") == {"apikey": "sb_secret_abc"}
    assert key_headers("eyJhbGciOi.x.y") == {"apikey": "eyJhbGciOi.x.y", "Authorization": "Bearer eyJhbGciOi.x.y"}


def test_rpc_sends_args_named_like_its_own_parameters():
    seen = []
    sb = Supabase({"SUPABASE_URL": "https://abc.supabase.co/", "SUPABASE_ANON_KEY": "a", "SUPABASE_SERVICE_ROLE_KEY": "s"})
    sb.http = httpx.Client(transport=httpx.MockTransport(lambda req: seen.append(req) or httpx.Response(204)))
    sb.rpc("create_institute", {"apikey": "a"}, name="GNDEC", headers="x", fn="y")
    assert str(seen[0].url) == "https://abc.supabase.co/rest/v1/rpc/create_institute"
    assert json.loads(seen[0].content) == {"name": "GNDEC", "headers": "x", "fn": "y"}
