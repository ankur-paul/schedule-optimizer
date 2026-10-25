"""scripts/agent_eval.py's loop with a fake Claude client and fake tools: no network, no cost, no Node."""

from decimal import Decimal

import pytest

import agent
from scripts import agent_eval
from scripts.agent_eval import EvalBackend, ask, report
from tests.test_agent import FakeClaude, reply

HELP_DIR = agent.HELP_DIR


class SeqClaude(FakeClaude):
    """Answers with each of `answers` in turn."""

    def __init__(self, answers):
        super().__init__()
        self.answers = list(answers)

    def create(self, **params):
        self.requests.append(params)
        return self.answers.pop(0)


class FakeTools:
    def __init__(self):
        self.runs: list[tuple[str, str, object]] = []

    def mask(self, scenario, text):
        return text.replace("Dr. Meera Iyer", "T-AAAAA")

    def unmask(self, scenario, text):
        return text.replace("T-AAAAA", "Dr. Meera Iyer")

    def run(self, scenario, name, tool_input):
        self.runs.append((scenario, name, tool_input))
        if name == "nope":
            return {"content": '{"error": "No tool named nope."}', "isError": True}
        return {"content": '{"free": ["P1"]}', "isError": False}


def make(answers):
    claude, backend = SeqClaude(answers), EvalBackend()
    return claude, backend, agent.Agent(claude, backend, HELP_DIR, agent.load_tools(), Decimal(0))


def test_runs_tools_until_an_answer_and_unmasks_it():
    tool_reply = reply(
        [{"type": "tool_use", "id": "a", "name": "free_periods", "input": {"kind": "teacher", "id": "T-AAAAA"}}],
        stop_reason="tool_use",
    )
    claude, backend, assistant = make([tool_reply, reply([{"type": "text", "text": "T-AAAAA is free in P1."}])])
    tools = FakeTools()
    answer = ask(assistant, backend, tools, "built", "When is Dr. Meera Iyer free?")

    assert answer.text == "Dr. Meera Iyer is free in P1."
    assert answer.tool_calls == ['free_periods({"kind": "teacher", "id": "T-AAAAA"})']
    assert tools.runs == [("built", "free_periods", {"kind": "teacher", "id": "T-AAAAA"})]
    # The masked question went out, and the second call carried the tool result after the tool call.
    first, second = claude.requests
    assert first["messages"] == [{"role": "user", "content": "When is T-AAAAA free?"}]
    assert second["messages"][-1] == {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "a", "content": '{"free": ["P1"]}'}],
    }
    # Two model calls of one question, each with a usage row priced like the server prices it.
    assert len(answer.usage) == 2
    assert answer.cost_cents == 2 * agent.cost_cents("claude-opus-5-5", answer.usage[0].counts)
    assert answer.tokens()["cache_read_tokens"] == 24000


def test_flags_a_bad_tool_call():
    bad = reply([{"type": "tool_use", "id": "x", "name": "nope", "input": {}}], stop_reason="tool_use")
    claude, backend, assistant = make([bad, reply()])
    answer = ask(assistant, backend, FakeTools(), "built", "hi")
    assert answer.tool_calls == ["nope({}) → error"]
    assert claude.requests[1]["messages"][-1]["content"][0]["is_error"] is True


def test_the_ninth_call_gets_no_tools():
    tool_reply = reply([{"type": "tool_use", "id": "a", "name": "overview", "input": {}}], stop_reason="tool_use")
    claude, backend, assistant = make([tool_reply] * 8 + [reply()])
    ask(assistant, backend, FakeTools(), "built", "hi")
    assert len(claude.requests) == 9
    assert claude.requests[-1]["tool_choice"] == {"type": "none"}
    assert "tool_choice" not in claude.requests[-2]


def test_backend_refuses_a_tenth_call():
    backend = EvalBackend()
    call = backend.begin("u", "i", None, "turn", Decimal(0))
    for _ in range(8):
        backend.begin("u", "i", call.question_id, "turn", Decimal(0))
    with pytest.raises(agent.AgentError) as e:
        backend.begin("u", "i", call.question_id, "turn", Decimal(0))
    assert e.value.reason == "too_many_calls"


def test_report_shows_calls_tokens_and_cost():
    claude, backend, assistant = make([reply([{"type": "text", "text": "Line one.\nLine two."}])])
    answer = ask(assistant, backend, FakeTools(), "built", "q")
    text = report(3, "built", "q", answer)
    assert text.startswith("── 3. [built] q\n   calls: none\n   model calls: 1 · in 1000 · out 200")
    assert "   Line one.\n   Line two." in text
    assert text.splitlines()[2].endswith("¢")


def test_asks_before_spending(monkeypatch, capsys):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr("builtins.input", lambda prompt: "n")
    monkeypatch.setattr(agent_eval, "NodeTools", lambda: pytest.fail("must not start the tools"))
    assert agent_eval.main([]) == 1
    assert "Nothing spent." in capsys.readouterr().out


def test_fifteen_questions_cover_every_scenario():
    assert len(agent_eval.QUESTIONS) == 15
    assert {s for s, _ in agent_eval.QUESTIONS} == {"built", "partial", "impossible"}
