"""Ask the assistant 22 fixed questions about the sample college through the real API (T40, T44), and print each
answer, its tool calls, the change cards it proposed, tokens and cost.

    cd server && uv run scripts/agent_eval.py          # asks before spending
    cd server && uv run scripts/agent_eval.py --yes    # doesn't ask

It costs real money, so it is run by hand before a release and never by pytest. It needs ANTHROPIC_API_KEY (the
environment or server/.env) and Node: the tools, the name masking and the scenarios come from
web/scripts/agent-eval-tools.ts, the browser's own code. Each question is a new chat, and the loop is the panel's:
send the question, run the tools the reply asks for, send their results back, until the reply is an answer. The
server half is agent.Agent itself, with the Supabase checks replaced by an in-memory stand-in that counts calls the
way agent_begin does and keeps the usage rows.

The write questions (T44) end in change cards. Each proposal is dry-run as the panel does, against an editor linked
to a saved timetable; nothing is applied, online or not. A proposal that fails its dry run is listed with its errors.
"""

import argparse
import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Protocol

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import anthropic  # noqa: E402

import agent  # noqa: E402
from supabase_env import ENV_FILE, read_env_file  # noqa: E402

WEB = Path(__file__).resolve().parents[2] / "web"
INSTITUTE = uuid.uuid4()

# (scenario, question). built: the sample college with its solved timetable; partial: two CSE A classes unplaced;
# impossible: CSE A booked for more periods than the week has, after a Generate that said *Can't be built*.
# lateFinishOff: built, with *Finish each day as early as possible* (S5) switched off.
QUESTIONS: list[tuple[str, str]] = [
    ("built", "How do I lock a class so it stays where it is when I regenerate?"),
    ("built", "How do I bring my own college in from Excel?"),
    ("built", "Where does my score come from?"),
    ("built", "Which sections have the same subject twice on one day?"),
    ("built", "When is Dr. Meera Iyer free on Tuesday?"),
    ("built", "Is CSE Lab 1 free on Wednesday afternoon?"),
    ("built", "What does CSE B have on Monday?"),
    ("built", "Who teaches Database Systems to CSE A?"),
    ("built", "Is anything wrong with my data?"),
    ("impossible", "Why can't my timetable be built?"),
    ("impossible", "What is the smallest change that makes it buildable?"),
    ("partial", "Why wasn't CSE A's Data Structures lecture placed?"),
    ("partial", "How can I place the classes that were left over?"),
    ("built", "मेरे टाइमटेबल का स्कोर इतना क्यों है?"),
    ("built", "Write me a short poem about the monsoon."),
    # Write questions (T44): each should end in a card that passes the dry run, except the delete, which gets steps.
    ("built", "Move CSE A's Data Structures lecture off Monday."),
    ("built", "Add a classroom LH-5 for CSE and regenerate."),
    ("built", "Lock all of CSE B's labs where they are."),
    ("built", "Add a teacher Ravi Sharma to CSE and give him CSE A's Operating Systems."),
    ("built", "Save this online."),
    ("built", "Publish the latest version."),
    ("built", "Delete this timetable."),
    # T54: with Late finish off, a card turning it on and regenerating; with it on (built), an explanation.
    ("lateFinishOff", "Make the days finish earlier."),
    ("built", "Make the days finish earlier."),
]


class Tools(Protocol):
    def mask(self, scenario: str, text: str) -> str: ...
    def unmask(self, scenario: str, text: str) -> str: ...
    def run(self, scenario: str, name: str, tool_input: object, n: int = 1) -> dict: ...


class NodeTools:
    """web/scripts/agent-eval-tools.ts as a long-running process: one JSON line in, one out."""

    def __init__(self):
        self.proc = subprocess.Popen(
            ["npx", "tsx", "scripts/agent-eval-tools.ts"],
            cwd=WEB,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )

    def ask(self, request: dict) -> dict:
        self.proc.stdin.write(json.dumps(request) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError("agent-eval-tools.ts stopped; run `cd web && npm ci` first.")
        return json.loads(line)

    def mask(self, scenario, text):
        return self.ask({"op": "mask", "scenario": scenario, "text": text})["text"]

    def unmask(self, scenario, text):
        return self.ask({"op": "unmask", "scenario": scenario, "text": text})["text"]

    def run(self, scenario, name, tool_input, n=1):
        return self.ask({"op": "tool", "scenario": scenario, "name": name, "input": tool_input, "n": n})

    def close(self):
        self.proc.stdin.close()
        self.proc.wait(timeout=10)


@dataclass
class Usage:
    kind: str
    model: str
    counts: dict[str, int]
    cost_cents: Decimal


class EvalBackend:
    """agent_begin and agent_record without Supabase: every caller is allowed, calls are counted per question (9 at
    most, as in the database), and the usage rows are kept in memory."""

    def __init__(self):
        self.calls: dict[str, int] = {}
        self.usage: dict[str, list[Usage]] = {}

    def user_id(self, token):
        return "eval"

    def begin(self, user_id, institute_id, question_id, kind, budget_cents):
        question = question_id or str(uuid.uuid4())
        calls = self.calls.get(question, 0) + (kind == "turn")
        if calls > agent.LAST_CALL:
            raise agent.AgentError(429, "too_many_calls")
        self.calls[question] = calls
        return agent.Call(question, calls, 999, "2099-01-01T00:00:00+00:00")

    def record(self, question_id, kind, model, usage, cost_cents):
        self.usage.setdefault(question_id, []).append(Usage(kind, model, usage, cost_cents))


@dataclass
class Card:
    """A proposal that passed its dry run, as the panel would show it (teachers unmasked)."""

    n: int
    summary: str
    lines: list[str]
    warnings: list[str]


@dataclass
class Answer:
    text: str
    tool_calls: list[str] = field(default_factory=list)
    usage: list[Usage] = field(default_factory=list)
    cards: list[Card] = field(default_factory=list)
    failed_proposals: list[str] = field(default_factory=list)

    @property
    def cost_cents(self) -> Decimal:
        return sum((u.cost_cents for u in self.usage), Decimal(0))

    def tokens(self) -> dict[str, int]:
        keys = ("input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens")
        return {k: sum(u.counts[k] for u in self.usage) for k in keys}


def ask(assistant: agent.Agent, backend: EvalBackend, tools: Tools, scenario: str, question: str) -> Answer:
    """One question in a new chat, run the way the panel runs it (web/src/features/assistant/useAssistant.ts)."""
    messages: list[dict] = [{"role": "user", "content": tools.mask(scenario, question)}]
    question_id = None
    tool_calls: list[str] = []
    cards: list[Card] = []
    failed: list[str] = []
    while True:
        req = agent.AgentRequest(institute_id=INSTITUTE, question_id=question_id, kind="turn", messages=messages)
        res = assistant.handle("eval", req)
        question_id = res.question_id
        messages.append({"role": "assistant", "content": res.content})
        uses = [b for b in res.content if b.get("type") == "tool_use"] if res.stop_reason == "tool_use" else []
        if not uses:
            text = "\n\n".join(b["text"] for b in res.content if b.get("type") == "text").strip()
            usage = backend.usage.get(str(question_id), [])
            return Answer(tools.unmask(scenario, text), tool_calls, usage, cards, failed)
        results = []
        for use in uses:
            out = tools.run(scenario, use["name"], use.get("input"), len(cards) + 1)
            if use["name"] == "propose_changes":
                if out.get("card"):
                    c = out["card"]
                    unmask = lambda t: tools.unmask(scenario, t)  # noqa: E731
                    cards.append(Card(len(cards) + 1, unmask(c["summary"]), [unmask(x) for x in c["lines"]], [unmask(w) for w in c["warnings"]]))
                elif out["isError"]:
                    failed.append(tools.unmask(scenario, out["content"]))
            tool_calls.append(f"{use['name']}({json.dumps(use.get('input'), ensure_ascii=False)})" + (" → error" if out["isError"] else ""))
            result = {"type": "tool_result", "tool_use_id": use["id"], "content": out["content"]}
            results.append({**result, "is_error": True} if out["isError"] else result)
        messages.append({"role": "user", "content": results})


def cents(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01'))}¢"


def report(n: int, scenario: str, question: str, answer: Answer) -> str:
    t = answer.tokens()
    lines = [
        f"── {n}. [{scenario}] {question}",
        f"   calls: {', '.join(answer.tool_calls) or 'none'}",
        *(f"   failed dry run: {f}" for f in answer.failed_proposals),
        *(
            line
            for card in answer.cards
            for line in [
                f"   card #{card.n}: {card.summary}",
                *(f"     {i}. {text}" for i, text in enumerate(card.lines, 1)),
                *(f"     ! {w}" for w in card.warnings),
            ]
        ),
        f"   model calls: {len(answer.usage)} · in {t['input_tokens']} · out {t['output_tokens']} · cache read "
        f"{t['cache_read_tokens']} · cache write {t['cache_write_tokens']} · {cents(answer.cost_cents)}",
        "",
        *("   " + line for line in answer.text.splitlines()),
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=f"Ask the assistant {len(QUESTIONS)} fixed questions through the real API.")
    parser.add_argument("--yes", action="store_true", help="don't ask before spending")
    parser.add_argument("--only", type=int, nargs="*", help="ask only these question numbers (1-based)")
    args = parser.parse_args(argv)

    api_key = os.environ.get("ANTHROPIC_API_KEY") or read_env_file(ENV_FILE).get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY is not set (environment or server/.env).", file=sys.stderr)
        return 1
    chosen = [(i, q) for i, q in enumerate(QUESTIONS, 1) if not args.only or i in args.only]
    if not args.yes:
        prompt = f"This asks {len(chosen)} questions on {agent.MODEL} with your key: roughly 5 cents each. Go on? [y/N] "
        if input(prompt).strip().lower() not in ("y", "yes"):
            print("Nothing spent.")
            return 1

    backend = EvalBackend()
    assistant = agent.Agent(anthropic.Anthropic(api_key=api_key), backend, agent.HELP_DIR, agent.load_tools(), Decimal(0))  # no monthly stop here
    tools = NodeTools()
    total = Decimal(0)
    answers: list[Answer] = []
    try:
        for n, (scenario, question) in chosen:
            answer = ask(assistant, backend, tools, scenario, question)
            answers.append(answer)
            total += answer.cost_cents
            print(report(n, scenario, question, answer), flush=True)
    finally:
        tools.close()
    cards = sum(len(a.cards) for a in answers)
    failed = sum(len(a.failed_proposals) for a in answers)
    print(f"Total {cents(total)} for {len(chosen)} questions · {cents(total / len(chosen))} a question on average.")
    print(f"Cards: {cards} passed the dry run · {failed} proposals failed it (the model is told why and may retry).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
