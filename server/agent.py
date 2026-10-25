"""The assistant's server side (T38): one Claude call per request, checked and counted in the database.

The browser drives the loop (T40): it sends the chat so far, runs the tools in the browser and sends their results
back as the next request. This module confirms the user with Supabase Auth, asks agent_begin (T36) whether the call
may run, makes the call with the server's own system prompt and tools, and writes the usage row with agent_record.
Nothing is kept between requests apart from what is read at startup. Plan: docs/discussions/2026-10-24-ai-agent.md.
"""

import json
import os
import re
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal, Protocol
from uuid import UUID

import anthropic
import httpx
from pydantic import BaseModel, Field, model_validator

from supabase_env import ENV_FILE, key_headers, load_config, read_env_file

REPO = Path(__file__).resolve().parent.parent
TOOLS_FILE = REPO / "shared" / "agent-tools.json"
HELP_DIR = REPO / "web" / "src" / "help"
# The order web/src/help/helpText.ts lists them in. A fixed order keeps the cached prefix the same across requests.
HELP_PAGES = ("index", "start", "data", "generate", "timetable", "online", "troubleshooting")

MODEL = "claude-opus-5-5"
MAX_TOKENS = 8000
MAX_BODY_BYTES = 300 * 1024
LAST_CALL = 9  # agent_begin allows 9 calls per question; the last one gets no tools
BETAS = ["server-side-fallback-2026-07-01"]

# US dollars per million tokens: input, output, cache read, cache write (5-minute TTL, 1.25x input).
# From the claude-api skill's model table and prompt-caching notes, 25 Oct 2026. The fallback models are here too,
# since a refused call is priced as the model that answered.
PRICES: dict[str, tuple[Decimal, Decimal, Decimal, Decimal]] = {
    "claude-opus-5-5": (Decimal("4"), Decimal("20"), Decimal("0.20"), Decimal("5")),
    "claude-opus-5": (Decimal("5"), Decimal("25"), Decimal("0.50"), Decimal("6.25")),
    "claude-opus-4-8": (Decimal("5"), Decimal("25"), Decimal("0.50"), Decimal("6.25")),
}
# A model missing from the table is priced at the highest rates in it, so the monthly stop never undercounts.
PRICE_UNKNOWN = tuple(max(p[i] for p in PRICES.values()) for i in range(4))

INSTRUCTIONS = """\
You are the assistant inside Lattice, a web app that builds college timetables. You answer questions about using \
Lattice and about the user's own data and timetables.

- Answer only about Lattice and the user's timetables. Politely decline anything else.
- For anything about the user's data (sections, teachers, rooms, courses, the timetable, its problems or score), use \
the tools. Don't guess.
- Teachers appear as codes such as T-K3X9Q. Use the codes as they are; the app shows them to the user as names.
- The help pages are below. Link to them as /help/<page>#<anchor>, for example /help/data#lab-batches; the index \
page is /help. Use only anchors given below.
- Reply in the language the user writes in.
- Be short: a few sentences or a short list, then stop."""

COMPACT_PROMPT = """\
Summarise our chat so far for your own later use, in at most 200 words: what I asked, what you found, and the \
sections, teachers (by code) and rooms involved. Write only the summary."""

REFUSAL_TEXT = "Sorry, I can't help with that. I can answer questions about Lattice and your timetables."

FORBIDDEN = {"not_member", "consent_required", "no_access", "expired"}
TOO_MANY = {"used_up", "paused", "question_closed", "unknown_question", "too_many_calls", "too_many_compactions"}


# ── Request and response ────────────────────────────────────────────────────────────────────────────────


class Message(BaseModel, extra="allow"):
    role: Literal["user", "assistant"]  # no client-sent system messages
    content: str | list[dict[str, Any]]


class AgentRequest(BaseModel):
    institute_id: UUID
    question_id: UUID | None = None
    kind: Literal["turn", "compact"]
    messages: list[Message] = Field(min_length=1)

    @model_validator(mode="after")
    def compact_continues(self):
        if self.kind == "compact" and self.question_id is None:
            raise ValueError("A compaction continues a question: question_id is required.")
        return self


class AgentResponse(BaseModel):
    question_id: UUID
    content: list[dict[str, Any]]
    stop_reason: str | None
    questions_left: int
    expires_at: str


class AgentError(Exception):
    """An HTTP error with a `reason` the panel shows a state for."""

    def __init__(self, status: int, reason: str):
        super().__init__(reason)
        self.status, self.reason = status, reason


# ── Supabase ────────────────────────────────────────────────────────────────────────────────────────────


@dataclass
class Call:
    """What agent_begin returns."""

    question_id: str
    call_number: int
    questions_left: int
    expires_at: str


class Backend(Protocol):
    def user_id(self, token: str) -> str | None: ...
    def begin(self, user_id: str, institute_id: str, question_id: str | None, kind: str, budget_cents: Decimal) -> Call: ...
    def record(self, question_id: str, kind: str, model: str, usage: dict[str, int], cost_cents: Decimal) -> None: ...


class SupabaseBackend:
    def __init__(self, config: dict[str, str], http: httpx.Client):
        self.url = config["SUPABASE_URL"].rstrip("/")
        self.anon_key = config.get("SUPABASE_ANON_KEY") or config["SUPABASE_SERVICE_ROLE_KEY"]
        self.service = key_headers(config["SUPABASE_SERVICE_ROLE_KEY"])
        self.http = http

    def user_id(self, token: str) -> str | None:
        """The user a Supabase access token belongs to, or None if Auth doesn't accept it."""
        res = self.http.get(
            f"{self.url}/auth/v1/user", headers={"apikey": self.anon_key, "Authorization": f"Bearer {token}"}
        )
        return res.json().get("id") if res.status_code == 200 else None

    def begin(self, user_id, institute_id, question_id, kind, budget_cents) -> Call:
        res = self.rpc(
            "agent_begin",
            user_id=user_id,
            institute_id=institute_id,
            question_id=question_id,
            kind=kind,
            budget_cents=str(budget_cents),
        )
        if res.status_code != 200:
            hint = error_hint(res)
            if hint in FORBIDDEN:
                raise AgentError(403, hint)
            if hint in TOO_MANY:
                raise AgentError(429, hint)
            res.raise_for_status()
        return Call(**res.json())

    def record(self, question_id, kind, model, usage, cost_cents) -> None:
        self.rpc(
            "agent_record", question_id=question_id, kind=kind, model=model, cost_cents=str(cost_cents), **usage
        ).raise_for_status()

    def rpc(self, fn: str, **args) -> httpx.Response:
        return self.http.post(f"{self.url}/rest/v1/rpc/{fn}", headers=self.service, json=args)


def error_hint(res: httpx.Response) -> str | None:
    try:
        return res.json().get("hint")
    except ValueError:
        return None


# ── Prompt ──────────────────────────────────────────────────────────────────────────────────────────────

IMAGE_LINE = re.compile(r"^\s*!\[[^\]]*\]\([^)]*\)\s*$")
HEADING = re.compile(r"^(#{2,6})\s+(.*?)\s*$")
EXPLICIT_ID = re.compile(r"\{#[^}]*\}\s*$")


def heading_id(text: str) -> str:
    """Same as headingId in helpText.ts: `Lab batches` -> `lab-batches`, `Can't be built` -> `cant-be-built`."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # a link counts as its text
    text = re.sub(r"[`*_]", "", text).lower()
    text = re.sub(r"['’]", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def help_page(name: str, markdown: str) -> str:
    """One page for the prompt: its path, then the markdown with image lines dropped and every `##` and deeper
    heading carrying its anchor, so the model links to anchors that exist."""
    lines = [f"<help_page path=\"{'/help' if name == 'index' else f'/help/{name}'}\">"]
    for line in markdown.splitlines():
        if IMAGE_LINE.match(line):
            continue
        heading = HEADING.match(line)
        if heading and not EXPLICIT_ID.search(line):
            line = f"{line} {{#{heading_id(heading.group(2))}}}"
        lines.append(line)
    lines.append("</help_page>")
    return "\n".join(lines)


def help_text(help_dir: Path) -> str:
    return "\n\n".join(help_page(name, (help_dir / f"{name}.md").read_text()) for name in HELP_PAGES)


def system_prompt(help_dir: Path) -> list[dict]:
    """The instructions, then the help text, with the cache breakpoint after the help (tools come before both)."""
    return [
        {"type": "text", "text": INSTRUCTIONS},
        {"type": "text", "text": help_text(help_dir), "cache_control": {"type": "ephemeral"}},
    ]


# ── Cost ────────────────────────────────────────────────────────────────────────────────────────────────


def usage_counts(usage: Any) -> dict[str, int]:
    return {
        "input_tokens": usage.input_tokens or 0,
        "output_tokens": usage.output_tokens or 0,
        "cache_read_tokens": usage.cache_read_input_tokens or 0,
        "cache_write_tokens": usage.cache_creation_input_tokens or 0,
    }


def cost_cents(model: str, counts: dict[str, int]) -> Decimal:
    """US cents, to the 4 places agent_usage keeps."""
    price_in, price_out, price_read, price_write = PRICES.get(model, PRICE_UNKNOWN)
    dollars = (
        counts["input_tokens"] * price_in
        + counts["output_tokens"] * price_out
        + counts["cache_read_tokens"] * price_read
        + counts["cache_write_tokens"] * price_write
    ) / 1_000_000
    return (dollars * 100).quantize(Decimal("0.0001"))


# ── The endpoint's logic ────────────────────────────────────────────────────────────────────────────────


class Agent:
    def __init__(self, claude: Any, backend: Backend, help_dir: Path, tools: list[dict], budget_cents: Decimal):
        self.claude, self.backend, self.budget_cents = claude, backend, budget_cents
        self.system = system_prompt(help_dir)
        self.tools = tools

    def handle(self, token: str | None, req: AgentRequest) -> AgentResponse:
        user = self.backend.user_id(token) if token else None
        if not user:
            raise AgentError(401, "unauthorized")
        question = str(req.question_id) if req.question_id else None
        call = self.backend.begin(user, str(req.institute_id), question, req.kind, self.budget_cents)

        try:
            message = self.claude.beta.messages.create(**self.params(req, call))
        except anthropic.APIError as e:
            raise AgentError(502, "model_error") from e

        counts = usage_counts(message.usage)
        self.backend.record(call.question_id, req.kind, message.model, counts, cost_cents(message.model, counts))

        if message.stop_reason == "refusal":
            content = [{"type": "text", "text": REFUSAL_TEXT}]
        else:
            content = [block.to_dict() for block in message.content]
        return AgentResponse(
            question_id=call.question_id,
            content=content,
            stop_reason=message.stop_reason,
            questions_left=call.questions_left,
            expires_at=call.expires_at,
        )

    def params(self, req: AgentRequest, call: Call) -> dict:
        messages = [m.model_dump(exclude_unset=True) for m in req.messages]
        if req.kind == "compact":
            messages.append({"role": "user", "content": COMPACT_PROMPT})
        params = {
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": "low"},
            "betas": BETAS,
            "fallbacks": "default",
            "system": self.system,
            "tools": self.tools,
            "cache_control": {"type": "ephemeral"},  # also caches the chat so far, which each tool round resends
            "messages": messages,
        }
        # The last call of a question, and a compaction, must answer in text. The tools stay in the request because
        # the cached prefix starts with them: without them the call rewrites the ~17k-token cache (about 8 cents
        # instead of 1.5, measured). tool_choice none keeps the model from calling one.
        if req.kind == "compact" or call.call_number >= LAST_CALL:
            params["tool_choice"] = {"type": "none"}
        return params


def load_tools(path: Path = TOOLS_FILE) -> list[dict]:
    return json.loads(path.read_text())


def from_env(http: httpx.Client | None = None) -> Agent | None:
    """The agent as configured by the environment (then server/.env, like supabase_env), or None when a key is
    missing (then /agent answers 503)."""
    config = load_config()
    file_env = read_env_file(ENV_FILE)

    def setting(key: str) -> str | None:
        return os.environ.get(key) or file_env.get(key)

    api_key = setting("ANTHROPIC_API_KEY")
    if config is None or not api_key:
        return None
    budget = Decimal(setting("AGENT_MONTHLY_USD") or "10") * 100
    help_dir = Path(setting("AGENT_HELP_DIR") or HELP_DIR)
    return Agent(
        anthropic.Anthropic(api_key=api_key),
        SupabaseBackend(config, http or httpx.Client(timeout=15)),
        help_dir,
        load_tools(),
        budget,
    )
