# T40 — Assistant panel
**Status:** DONE
**Lane:** main · **Prereqs:** T37, T38, T39 · **Branch:** t40-assistant-panel

## Goal
Users meet the assistant: a header button and side panel that shows the right state, unlocks with a coupon, runs the
chat loop with the browser tools, and opens from problem cards. Plus the help section, the eval script and the docs.
Plan: [`docs/discussions/2026-10-24-ai-agent.md`](../docs/discussions/2026-10-24-ai-agent.md) (What changes for the
user, Q8, Q24, Q25, Q29, Q31).

## Scope / files
- `web/src/features/assistant/`: the panel, `useAssistant` (the loop), and pure logic in `chat.ts` (state, compaction
  trigger, caps, request building) and `panelState.ts` (which screen to show), each with Vitest.
- `web/src/engine/agentClient.ts` (or next to the panel): `POST /agent` with the Supabase token. The URL comes from
  `VITE_AGENT_URL` and falls back to `VITE_SOLVER_URL`.
- The header button; *Ask about this* on the problem cards in `features/generate/` and the data checks.
- Help: a new section, *The assistant*, in `web/src/help/online.md` (or a new page if it outgrows a section), with
  screenshots via `npm run help:shots` if it can mock a signed-in, unlocked state.
- `server/scripts/agent_eval.py`.
- FEATURES.md, PROGRESS.md.

## Details
- **Panel states** (`panelState.ts`, from the session, memberships, the institute and its `agent_access` row):
  - **Signed out:** "Sign in to use the assistant" with the sign-in button.
  - **Signed in, no institute:** create or join one first.
  - **Locked, admin:** a short description, the coupon box, and *Request a trial coupon*.
  - **Locked, editor or viewer:** the description and "Your institute's admin (name, email) can unlock it".
  - **Open:** the chat.
  - **Paused (monthly budget) and "not configured":** a plain message.
  - **Which institute:** the working copy's linked institute; otherwise a picker, hidden with one membership.
- **Coupon box:** calls `redeem_coupon`. On success the panel opens; on error it shows the database's message. An
  empty result means a wrong or used code (T36: raising would roll back the counted try): show "That coupon isn't
  valid."
- ***Request a trial coupon*:** `mailto:` to `VITE_CONTACT_EMAIL`, subject "Lattice assistant trial". The body has
  the institute's name and handle and "What will you use it for?". Encode it properly.
- **Header line:** "143 questions left · until 23 Nov", amber under 20 questions or 3 days left. It updates from
  each `/agent` response.
- **The loop** (`useAssistant`):
  1. Mask the user's text (T37) and send it with `question_id: null`.
  2. If the reply asks for tools, run them over the current working copy (`runTool`) and send all the results in
     one message with the same `question_id`. Repeat until the reply is an answer.
  3. Show answers unmasked, with help links opening in a new tab.
  - **Store** the chat exactly as sent and received. Never edit earlier turns: the API rejects edited history.
  - **Errors:** a 403 or 429 `reason` switches to the matching state or message; the chat stays on screen. A 502
    shows "The assistant didn't answer. Try again."
  - **Busy:** while a question runs, show "Thinking…" and a list of the tools used ("Looked at CSE-3A's week").
    Disable sending.
- **Compaction:** after every 20th question has been answered, send `kind: "compact"` with the last question's id.
  From then on, send the summary in place of the earlier turns (as a first user message saying it is a summary of
  the chat so far); the panel still shows everything. *New chat* clears both.
- ***Ask about this*** (signed-in users only): on each *Can't be built* cause, the *Couldn't finish* card, each
  unplaced-cause group and each data check. It opens the panel and starts a question whose text includes the
  card's details (cause, sessions, help anchor), masked. In a locked state it just opens the panel.
- **Layout:** a right-hand panel on desktop, full screen on a phone. Keyboard: Enter sends, Shift+Enter adds a new
  line, Esc closes. The working copy and steps stay usable while the panel is open.
- **Help section:** what the assistant can and can't do (read-only), who can use it, coupons and requesting one,
  the allowance, privacy in one line with a link to `/privacy`, and that answers can be wrong. Add
  `helpHref('online', 'assistant')` links from the panel's locked screens.
- **`agent_eval.py`:**
  - About 15 fixed questions about the sample college, covering a how-to, a cause, an unplaced class, the score,
    free periods, a non-English question and an off-topic question.
  - It runs the same loop as the panel, with the tools reimplemented by calling a small Node script that imports
    `tools.ts`, or by pre-computed tool results.
  - It prints each answer, the calls, tokens and cost, and the total. It needs `ANTHROPIC_API_KEY` and asks for
    confirmation before spending.
  - Run it once and note the cost per question in PROGRESS.md.
- **FEATURES.md:** the assistant bullet and its known limits: read-only; coupons only; misspelt teacher names
  aren't masked; answers can be wrong; no streaming.

## Tests
- Vitest:
  - `panelState` for each state, role and institute case;
  - `chat.ts`: the request for a new question vs a continued one; tool results batched in one message; compaction
    after the 20th question and the summary replacing old turns in the request but not on screen; history sent
    unchanged; each error reason mapped to its state;
  - the `mailto:` link encoding;
  - the header line text and the amber threshold;
  - *Ask about this* question text for each card type, masked.
- Click through with a real key and a coupon from `issue_coupon.py`:
  - every locked state (signed out, no institute, admin, editor);
  - redeem, then ask the sample college "why is the score 34?" and "when is a teacher free on Monday?";
  - *Ask about this* on a *Can't be built* card;
  - a used-up coupon;
  - phone width.

## Done when
- [x] Panel, states, coupon box, loop, compaction and *Ask about this* work as above
- [x] Help section and links; link test green
- [x] `agent_eval.py` run once; cost per question in PROGRESS.md
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md assistant bullet and known limits
- [x] Committed: `T40: assistant panel`
