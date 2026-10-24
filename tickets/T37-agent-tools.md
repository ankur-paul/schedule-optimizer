# T37 — Assistant tools and name masking
**Status:** TODO
**Lane:** C · **Prereqs:** — · **Branch:** t37-agent-tools

## Goal
The assistant's six read-only tools and the teacher-name masking, as pure TypeScript over the working copy. The
panel (T40) runs them when Claude asks; nothing here touches the network. Plan:
[`docs/discussions/2026-10-24-ai-agent.md`](../docs/discussions/2026-10-24-ai-agent.md) (How it's built, Q6, Q9,
Q26).

## Scope / files
- `shared/agent-tools.json`: the tool definitions as the Anthropic API takes them (`name`, `description`,
  `input_schema` with `additionalProperties: false` and `required`, `strict: true`). The server (T38) sends this
  file as it is; it is the only list of tools.
- `web/src/features/assistant/tools.ts`: `runTool(name, input, data) → result`, plus one function per tool.
- `web/src/features/assistant/mask.ts`: masking for outgoing text and results, unmasking for display.
- Tests next to each file.

## Details
- **Tools.** They read the working copy (`AppData`) and return compact JSON: short keys, labels the user would
  recognise (section and course names, `slotLabel` for times), nothing the question doesn't need. Reuse rather
  than reimplement: `buildGrid`, `sessionLabel` and `slotLabel` (`domain/grid.ts`); `validate`
  (`domain/validator.ts`); `score.ts` and `stats.ts`; `checkData` (`features/data/dataChecks.ts`); and
  `explainInfeasible`, `topCauses` and `causeHelp.ts` (`features/generate/`).
  - `overview`: counts of sections, teachers, rooms, courses and sessions; the status (not generated, built,
    partial with N unplaced, can't be built); the score in total and per soft rule; the number of locks.
  - `schedule(kind: section | teacher | room, id)`: the week as days × periods, each cell with course, section or
    batch, teacher, room and lock flag; breaks and lunch candidates marked.
  - `free_periods(kind, id, day?)`: free teaching periods, lunch candidates marked.
  - `problems`: the data checks, the unplaced sessions grouped by cause, and the *Can't be built* causes with
    their fixes. Each entry carries its help anchor (from `causeHelp.ts`) so answers can link to it.
  - `score_details(rule?: S1 | S2 | S3 | S4)`: each penalty with where it comes from (section or teacher, day,
    periods, points).
  - `find(text)`: sections, rooms, courses and teachers whose name or ID contains the text, ignoring case, at most
    20, each with kind, id and name (teachers by ID only, see masking).
- **Errors.** An unknown tool, an input that doesn't match its schema, or an unknown id returns `{ error: "..." }`
  with a short message the model can act on ("No section with id CSE3X. Use find."). The panel sends it back as an
  error tool result. Tools never throw.
- **Size.** Every result is capped (about 8,000 characters). A longer result is cut, and says so and how to narrow
  the query.
- **Masking.**
  - **What gets masked:** teacher names are the only personal data (as in `withoutPersonalData`).
    - `maskText(text, teachers)`: every teacher name the user typed becomes its id. It matches whole words,
      ignores case, and tries longer names first, so "Ravi Kumar" wins over "Ravi".
    - Tool results carry ids only.
  - **What gets unmasked:** `unmaskText(text, teachers)` turns ids in the model's answer back into names for
    display. It matches whole tokens only, so an id such as `T1` doesn't change `T10`.
  - Section, room and course names are not personal and are sent as they are.
  - **Known limit:** a misspelt teacher name isn't caught. FEATURES.md notes it in T40.
- **Help anchors.** Tool results name anchors through the same typed list as `helpHref`, so the link test covers
  them.

## Tests
- Vitest, each tool on the sample college and the fixed timetable (`shared/fixtures/sample-timetable.json`):
  `overview` totals match `score.ts`; `schedule` matches `buildGrid` for one section, teacher and room;
  `free_periods` is the complement of `schedule` without breaks; `problems` on a can't-be-built case and a partial
  case; `score_details` sums to the score; `find` by name, id, case and the 20 cap.
- Unknown tool, schema mismatch and unknown id return errors and don't throw; an oversized result is cut with the
  note.
- `shared/agent-tools.json`: every tool has a handler and every handler a definition; each schema is strict.
- Masking: whole words, case, longer names first, names containing other names, names next to punctuation;
  unmasking `T1` vs `T10`; a round trip leaves non-teacher text unchanged; no teacher name appears in any tool
  result on the sample college.

## Done when
- [ ] `shared/agent-tools.json`, `tools.ts` and `mask.ts` with the behaviour above
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line
- [ ] Committed: `T37: assistant tools and name masking`
