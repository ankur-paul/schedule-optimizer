"""Assistant trial coupons (T36): making a code, and the hash the database stores in place of it.

normalise and code_hash must match private.coupon_hash in supabase/migrations/20261026000000_agent_access.sql;
tests/test_coupons.py and tests/test_rls_agent.py share a test vector.
"""

import hashlib
import re
import secrets
import string

import httpx

from supabase_env import key_headers

# No 0 O 1 I L, which look alike. With no L in it, the LTC prefix can't be mistaken for part of a code.
ALPHABET = "".join(c for c in string.ascii_uppercase + "23456789" if c not in "OIL")
LENGTH = 16
PREFIX = "LTC"


def new_code() -> str:
    """A fresh code as printed: LTC-XXXX-XXXX-XXXX-XXXX (16 characters, about 80 bits)."""
    body = "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
    return "-".join([PREFIX, *(body[i : i + 4] for i in range(0, LENGTH, 4))])


def normalise(code: str) -> str:
    """Upper-case, drop spaces and dashes, then drop the LTC prefix, so people can type it loosely."""
    return re.sub(r"[\s-]", "", code.upper()).removeprefix(PREFIX)


def code_hash(code: str) -> str:
    """SHA-256 of the normalised code, as hex."""
    return hashlib.sha256(normalise(code).encode()).hexdigest()


def issue(config: dict[str, str], questions: int, days: int, note: str | None, http: httpx.Client) -> str:
    """Stores a new coupon's hash with the service-role key and returns the code, which is kept nowhere."""
    code = new_code()
    res = http.post(
        f"{config['SUPABASE_URL'].rstrip('/')}/rest/v1/agent_coupons",
        headers={**key_headers(config["SUPABASE_SERVICE_ROLE_KEY"]), "Prefer": "return=minimal"},
        json={"code_hash": code_hash(code), "questions": questions, "days": days, "note": note},
    )
    res.raise_for_status()
    return code
