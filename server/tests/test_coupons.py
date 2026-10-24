"""Coupon codes and their hash (T36). No network: issue() runs against a mock transport."""

import json
import re

import httpx
import pytest

from coupons import ALPHABET, code_hash, issue, new_code, normalise

# Shared with test_rls_agent.py, which redeems this code against the database's private.coupon_hash.
VECTOR_CODE = "LTC-ABCD-EFGH-JKMN-PQRS"
VECTOR_HASH = "f598056127fcd4387651a49b3a4235d8ce50d71f4091068df51511cfc10f388f"


def test_alphabet_is_31_characters_without_look_alikes():
    assert len(ALPHABET) == len(set(ALPHABET)) == 31
    assert set(ALPHABET) == set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    assert not set("0O1IL") & set(ALPHABET)


def test_new_code_format():
    for _ in range(200):
        code = new_code()
        assert re.fullmatch(r"LTC(-[A-Z2-9]{4}){4}", code), code
        assert set(normalise(code)) <= set(ALPHABET)
        assert len(normalise(code)) == 16


def test_new_codes_differ():
    assert len({new_code() for _ in range(1000)}) == 1000


def test_hash_vector():
    assert code_hash(VECTOR_CODE) == VECTOR_HASH


@pytest.mark.parametrize(
    "typed",
    [
        "LTC-ABCD-EFGH-JKMN-PQRS",
        "ltc-abcd-efgh-jkmn-pqrs",
        "abcdefghjkmnpqrs",
        "ABCD EFGH JKMN PQRS",
        "  LTC ABCD-EFGH\tJKMN-PQRS \n",
        "LTCABCDEFGHJKMNPQRS",
    ],
)
def test_loose_typing_gives_the_same_hash(typed):
    assert normalise(typed) == "ABCDEFGHJKMNPQRS"
    assert code_hash(typed) == VECTOR_HASH


def test_only_a_leading_ltc_is_dropped():
    assert normalise("ABCD-LTC") == "ABCDLTC"
    assert code_hash("ABCDEFGHJKMNPQRT") != VECTOR_HASH


def test_issue_stores_only_the_hash():
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(201)

    config = {"SUPABASE_URL": "https://abc.supabase.co/", "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_x"}
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        code = issue(config, 50, 7, "tester", http)

    [req] = sent
    assert req.method == "POST"
    assert str(req.url) == "https://abc.supabase.co/rest/v1/agent_coupons"
    assert req.headers["apikey"] == "sb_secret_x"
    body = json.loads(req.content)
    assert body == {"code_hash": code_hash(code), "questions": 50, "days": 7, "note": "tester"}
    assert normalise(code) not in req.content.decode()


def test_issue_raises_when_the_insert_fails():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Invalid API key"})

    config = {"SUPABASE_URL": "https://abc.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "bad"}
    with httpx.Client(transport=httpx.MockTransport(handler)) as http, pytest.raises(httpx.HTTPStatusError):
        issue(config, 200, 30, None, http)
