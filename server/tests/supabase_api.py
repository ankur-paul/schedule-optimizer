"""Small httpx client for the Supabase dev project, used by the `supabase`-marked RLS tests.

Reads SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from the environment, then from server/.env
(written by scripts/setup-supabase-cli.sh). Works with both key styles: legacy JWT keys (anon / service_role) and
the newer sb_publishable_ / sb_secret_ keys.
"""

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

import httpx

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
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


@dataclass
class User:
    id: str
    email: str
    token: str


class Supabase:
    def __init__(self, config: dict[str, str]):
        self.url = config["SUPABASE_URL"].rstrip("/")
        self.anon_key = config["SUPABASE_ANON_KEY"]
        self.service_key = config["SUPABASE_SERVICE_ROLE_KEY"]
        self.http = httpx.Client(timeout=30)

    # ── who is calling ──
    def anon(self) -> dict[str, str]:
        return key_headers(self.anon_key)

    def service(self) -> dict[str, str]:
        return key_headers(self.service_key)

    def as_user(self, user: User) -> dict[str, str]:
        return {"apikey": self.anon_key, "Authorization": f"Bearer {user.token}"}

    # ── auth admin ──
    def create_user(self, email: str, name: str | None = None) -> User:
        """A confirmed user with a random password, signed in. Tests only; the app has no passwords."""
        password = secrets.token_urlsafe(24)
        res = self.http.post(
            f"{self.url}/auth/v1/admin/users",
            headers=self.service(),
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": name} if name else {},
            },
        )
        res.raise_for_status()
        user_id = res.json()["id"]
        res = self.http.post(
            f"{self.url}/auth/v1/token?grant_type=password",
            headers={"apikey": self.anon_key},
            json={"email": email, "password": password},
        )
        res.raise_for_status()
        return User(id=user_id, email=email, token=res.json()["access_token"])

    def sign_in_by_email(self, user: User) -> User:
        """`user` signed in again by email code, which records `amr` method otp like the app's email link does (T26).
        The admin API makes the code, so no email is sent."""
        res = self.http.post(
            f"{self.url}/auth/v1/admin/generate_link",
            headers=self.service(),
            json={"type": "magiclink", "email": user.email},
        )
        res.raise_for_status()
        res = self.http.post(
            f"{self.url}/auth/v1/verify",
            headers={"apikey": self.anon_key},
            json={"type": "email", "email": user.email, "token": res.json()["email_otp"]},
        )
        res.raise_for_status()
        return User(id=user.id, email=user.email, token=res.json()["access_token"])

    def delete_user(self, user_id: str) -> None:
        self.http.delete(f"{self.url}/auth/v1/admin/users/{user_id}", headers=self.service()).raise_for_status()

    # ── data API ──
    def select(self, table: str, headers: dict[str, str], **filters: str) -> httpx.Response:
        return self.http.get(f"{self.url}/rest/v1/{table}", headers=headers, params={"select": "*", **filters})

    def rows(self, table: str, headers: dict[str, str], **filters: str) -> list[dict]:
        res = self.select(table, headers, **filters)
        res.raise_for_status()
        return res.json()

    def insert(self, table: str, headers: dict[str, str], row: dict) -> httpx.Response:
        return self.http.post(
            f"{self.url}/rest/v1/{table}", headers={**headers, "Prefer": "return=minimal"}, json=row
        )

    def update(self, table: str, headers: dict[str, str], values: dict, **filters: str) -> httpx.Response:
        return self.http.patch(
            f"{self.url}/rest/v1/{table}",
            headers={**headers, "Prefer": "return=representation"},
            params=filters,
            json=values,
        )

    def delete(self, table: str, headers: dict[str, str], **filters: str) -> httpx.Response:
        return self.http.delete(
            f"{self.url}/rest/v1/{table}",
            headers={**headers, "Prefer": "return=representation"},
            params=filters,
        )

    def rpc(self, fn: str, headers: dict[str, str], /, **args) -> httpx.Response:
        return self.http.post(f"{self.url}/rest/v1/rpc/{fn}", headers=headers, json=args)
