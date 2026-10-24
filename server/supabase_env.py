"""Supabase settings for the server, its scripts and the `supabase`-marked tests.

Reads SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from the environment, then from server/.env
(written by scripts/setup-supabase-cli.sh). Works with both key styles: legacy JWT keys (anon / service_role) and
the newer sb_publishable_ / sb_secret_ keys.
"""

import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent / ".env"
KEYS = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")


def read_env_file(path: Path) -> dict[str, str]:
    """Parse KEY=value lines; values may be wrapped in single or double quotes. Missing file -> {}."""
    if not path.is_file():
        return {}
    env = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] == "'":
            value = value[1:-1].replace("'\\''", "'")  # the wizard's write_env escaping
        elif len(value) >= 2 and value[0] == value[-1] == '"':
            value = value[1:-1]
        env[key.strip()] = value
    return env


def load_config(env_file: Path = ENV_FILE) -> dict[str, str] | None:
    """The three settings, the environment winning over the file; None if URL or service key is missing."""
    file_env = read_env_file(env_file)
    config = {key: os.environ.get(key) or file_env.get(key, "") for key in KEYS}
    if not config["SUPABASE_URL"] or not config["SUPABASE_SERVICE_ROLE_KEY"]:
        return None
    return config


def key_headers(key: str) -> dict[str, str]:
    """Headers that authenticate with a project key. New-style keys go only in `apikey`; JWT keys in both."""
    headers = {"apikey": key}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return headers
