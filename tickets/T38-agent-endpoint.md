# T38 — Assistant endpoint
**Status:** IN PROGRESS
**Lane:** B · **Prereqs:** T36 · **Branch:** t38-agent-endpoint

## Goal
`POST /agent` on the FastAPI app: it confirms the user, asks the database whether the call may run, makes one Claude
call and records what it cost. It stays stateless; the browser (T40) drives the loop. Plan:
[`docs/discussions/2026-10-24-ai-agent.md`](../docs/discussions/2026-10-24-ai-agent.md) (How it's built, Cost, Q32).

## Scope / files
- `server/agent.py` (the logic, with the Claude client and Supabase calls injected so tests can fake them), the
  route in `server/main.py`, request and response models in `server/models.py` or `agent.py`.
- `server/pyproject.toml`: add `anthropic` and move `httpx` from dev to runtime dependencies.
- `server/tests/test_agent.py` (fake client, no network) and a `supabase`-marked test against T36's functions.
- Read the `claude-api` skill before writing the Claude call.

## Details
- **Request:** `Authorization: Bearer <Supabase access token>` and `{ institute_id, question_id: uuid | null, kind:
  "turn" | "compact", messages }`. `messages` is the chat as the API takes it: masked text, earlier assistant
  content returned unchanged (thinking blocks included), and tool results. The body is capped at 300 KB (413 above).
- **Response:** `{ question_id, content, stop_reason, questions_left, expires_at }`. `content` holds the assistant
  blocks exactly as the API returned them, so the browser can send them back unchanged.
- **Steps:**
  1. Confirm the token with Supabase Auth (`GET /auth/v1/user`) and get the user ID. Fail → 401.
  2. Call `agent_begin` with the service-role key and `budget_cents` from `AGENT_MONTHLY_USD` (default 10). Map its
     hints to responses: 403 with `{ reason }` for `not_member`, `consent_required`, `no_access` and `expired`; 429
     with `{ reason }` for `used_up`, `paused`, `question_closed`, `unknown_question` (a question ID that isn't this
     user's in this institute; T36 added it), `too_many_calls` and `too_many_compactions`. The panel shows a state for
     each.
  3. Make one Claude call (below).
  4. Call `agent_record` with the usage and cost.
  5. Return.
  An Anthropic error → 502 with `{ reason: "model_error" }`. Its question has already been charged.
- **The Claude call** (`claude-opus-5-5`):
  - **Settings:** effort `low`, adaptive thinking, no streaming, `max_tokens` 8000, and the server-side refusal
    fallback (`fallbacks: "default"`) as the `claude-api` skill describes. Check `stop_reason` before using the
    content: a `refusal` returns a polite "I can't help with that" block.
  - **System prompt:** fixed instructions, then the full help text, marked for caching.
    - Instructions: answer about Lattice and the user's timetables only; use the tools for anything about their
      data; teachers appear as codes such as `T-K3X9Q` (T37), which the panel shows as names; link help as `/help/<page>#<anchor>`; reply in the user's language; be short.
    - Help text: `web/src/help/*.md` with image lines dropped. Read once at startup from `AGENT_HELP_DIR` (default:
      the repo's `web/src/help`) in a fixed order, so the cached prefix doesn't change between requests.
  - **Tools:** `shared/agent-tools.json` (T37), loaded at startup. The client never sends tools or a system prompt.
  - **On the 9th call of a question** (the last that `agent_begin` allows), send no tools, so the model answers with
    what it has. `agent_begin` returns the call number for this.
  - **`kind: "compact"`:** one call without tools that asks for a short summary of the chat so far (what was asked,
    what was found, which sections, teachers and rooms). The response's `content` is that summary; the browser
    replaces the old turns with it. It doesn't use a question from the allowance.
- **Cost:**
  - **Prices:** a table in `agent.py` per model, for input, output, cache read and cache write, in US dollars per
    million tokens. Add a comment with the date and source. Opus 5.5 is $4 input and $20 output; take the cache
    prices from the `claude-api` skill.
  - **Usage:** from `response.usage`, including the cache fields. If the fallback answered, price it as the model
    that answered (`response.model`).
- **No state in memory** apart from what's read at startup. Read the Anthropic and Supabase clients' settings from
  env: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and the anon key if Auth needs it).
  Missing keys make `/agent` answer 503 `{ reason: "not_configured" }`, and `/solve` keeps working.
- **CORS:** allow the `Authorization` header. Take the allowed origins from env, defaulting to the current
  localhost list. This is the deploy pass's to-do, done here because the agent needs it.

## Tests
- Pytest with a fake Claude client and fake Supabase calls:
  - a turn returns the content and records usage;
  - a bad token gives 401; each `agent_begin` hint maps to its status and reason;
  - the request sent to Claude has the server's system prompt and tools, never the client's;
  - the system prompt is byte-identical across two requests (cache prefix);
  - help image lines are dropped;
  - the 9th call goes without tools;
  - compact sends no tools and doesn't start a question;
  - the cost sums include cache tokens; a fallback answer is priced as the model that answered;
  - a 300 KB+ body gives 413;
  - missing keys give 503 while `/solve` still works;
  - an Anthropic error gives 502 and records nothing.
- Pytest (`supabase`): a full turn against the dev project's T36 functions with the fake Claude client: a usage row
  appears and the allowance drops by one.
- By hand, once, with a real key: one question about the sample college through `curl`; note the cost in
  PROGRESS.md.

## Done when
- [ ] `POST /agent` works as above; `/solve` unchanged
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] New env vars noted in `docs/v2-roadmap.md`'s deploy list if they differ from the plan
- [ ] PROGRESS.md line
- [ ] Committed: `T38: assistant endpoint`
