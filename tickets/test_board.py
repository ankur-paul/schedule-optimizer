import os
import subprocess
import time
from pathlib import Path

import board
from board import Claim, Ticket, Version, build_board, next_ticket, parse_ticket, render

NOW = 1_800_000_000.0


def ticket_text(tid: str, status: str = "TODO", prereqs: str = "—", branch: str | None = None, title: str = "Thing") -> str:
    return (
        f"# {tid} — {title}\n**Status:** {status}\n"
        f"**Lane:** A · **Prereqs:** {prereqs} · **Branch:** {branch or tid.lower() + '-x'}\n\n## Goal\n"
    )


def v(tid: str, source: str = "main", at: float = 0.0, **kw) -> Version:
    return Version(source, at, parse_ticket(tid, ticket_text(tid, **kw)))


def board_of(*versions: Version, claims: dict | None = None):
    by_id: dict[str, list[Version]] = {}
    for x in versions:
        by_id.setdefault(x.ticket.id, []).append(x)
    on_main = {x.ticket.id: x.ticket for x in versions if x.source == "main"}
    return {r.ticket.id: r for r in build_board(by_id, on_main, claims or {}, NOW)}


# --- parse_ticket ---


def test_parses_a_full_header():
    t = parse_ticket("T05", ticket_text("T05", status="IN PROGRESS", prereqs="T01, T02", branch="t05-shell", title="Shell"))
    assert (t.title, t.status, t.reason, t.prereqs, t.branch, t.problems) == (
        "Shell", "IN PROGRESS", "", ["T01", "T02"], "t05-shell", []
    )


def test_status_reason_in_brackets():
    t = parse_ticket("T12", ticket_text("T12", status="BLOCKED (needs human: user test)"))
    assert (t.status, t.reason) == ("BLOCKED", "needs human: user test")


def test_unknown_status_is_a_problem():
    t = parse_ticket("T01", ticket_text("T01", status="WIP"))
    assert t.status == "TODO" and "Status" in t.problems[0]


def test_dash_means_no_prereqs():
    assert parse_ticket("T00", ticket_text("T00", prereqs="—")).prereqs == []


def test_prereq_that_is_not_a_whole_ticket_is_a_problem():
    t = parse_ticket("T07", ticket_text("T07", prereqs="T02, T05 (T04 optional)"))
    assert t.prereqs == ["T02"]
    assert "'T05 (T04 optional)'" in t.problems[0]


def test_title_id_must_match_file():
    t = parse_ticket("T03", ticket_text("T04"))
    assert "title says T04" in t.problems[0]


def test_missing_fields_are_problems():
    t = parse_ticket("T01", "just text")
    assert len(t.problems) == 4  # title, status, prereqs, branch


# --- build_board ---


def test_done_on_main_is_final_even_if_a_newer_copy_says_otherwise():
    rows = board_of(v("T01", status="DONE", at=1), v("T01", source="old-branch", at=5, status="TODO"))
    assert rows["T01"].state == "DONE"


def test_done_uses_a_newer_done_copy_for_its_header():
    rows = board_of(v("T01", status="DONE", at=1, title="Old"), v("T01", source="wt", at=5, status="DONE", title="New"))
    assert rows["T01"].ticket.title == "New"


def test_done_only_on_a_branch_is_merge_pending():
    rows = board_of(v("T01", at=1), v("T01", source="t01-x", at=5, status="DONE"))
    assert rows["T01"].state == "MERGE PENDING"
    assert "t01-x" in rows["T01"].detail


def test_newest_copy_wins():
    rows = board_of(v("T12", at=1, status="IN PROGRESS"), v("T12", source="wt", at=9, status="BLOCKED (needs human)"))
    assert (rows["T12"].state, rows["T12"].detail) == ("BLOCKED", "needs human")


def test_ready_when_every_prereq_is_done_on_main():
    rows = board_of(v("T01", status="DONE"), v("T02", prereqs="T01"))
    assert rows["T02"].state == "READY"


def test_waiting_lists_unfinished_prereqs():
    rows = board_of(v("T01"), v("T02", status="DONE"), v("T03", prereqs="T01, T02"))
    assert (rows["T03"].state, rows["T03"].detail) == ("WAITING", "on T01")


def test_prereq_done_only_on_a_branch_still_waits():
    rows = board_of(v("T01", at=1), v("T01", source="t01-x", at=2, status="DONE"), v("T02", prereqs="T01"))
    assert rows["T02"].state == "WAITING"


def test_a_claim_branch_makes_a_todo_ticket_in_progress():
    rows = board_of(v("T02"), claims={"T02": [Claim("t02-x", 3, NOW - 600)]})
    assert rows["T02"].state == "IN PROGRESS"
    assert rows["T02"].detail == "branch t02-x, 3 commits ahead, last 10 min ago"


def test_fresh_and_stale_claims():
    fresh = board_of(v("T02"), claims={"T02": [Claim("t02-x", 0, None)]})
    stale = board_of(v("T02"), claims={"T02": [Claim("t02-x", 1, NOW - 3 * 3600)]})
    assert fresh["T02"].detail == "branch t02-x, no commits yet"
    assert stale["T02"].detail == "branch t02-x, 1 commit ahead, last 3 h ago (stale?)"


def test_in_progress_without_a_branch_says_so():
    rows = board_of(v("T02", status="IN PROGRESS"))
    assert "no t02-… branch" in rows["T02"].detail


def test_blocked_keeps_its_reason_and_shows_the_branch():
    rows = board_of(v("T12", status="BLOCKED (user test)"), claims={"T12": [Claim("t12-design", 0, None)]})
    assert (rows["T12"].state, rows["T12"].detail) == ("BLOCKED", "user test; branch t12-design, no commits yet")


def test_unknown_prereq_is_a_problem():
    rows = board_of(v("T02", prereqs="T09"))
    assert rows["T02"].state == "WAITING"
    assert "prereq T09 has no ticket file" in rows["T02"].ticket.problems


# --- next / render ---


def test_next_is_the_lowest_ready_ticket():
    rows = board_of(v("T01", status="DONE"), v("T03", prereqs="T01"), v("T02", prereqs="T01"), v("T04", status="PARKED"))
    assert next_ticket(list(rows.values())).ticket.id == "T02"


def test_render_summary_next_and_problems():
    rows = list(board_of(v("T01", status="DONE"), v("T02", prereqs="T01"), v("T03", prereqs="T02, oops")).values())
    out = render(rows)
    assert out.splitlines()[0] == "Tickets: 3 · 1 done · 1 ready · 1 waiting"
    assert "DONE          T01" in out
    assert "Next: T02. Claim it: git branch t02-x main" in out
    assert "T03: prereq 'oops' is not a ticket id" in out


def test_render_with_nothing_ready():
    assert "Next: nothing is ready" in render(list(board_of(v("T01", status="PARKED")).values()))


# --- collect: a real repo with a branch and a worktree ---


def sh(cwd: Path, *args: str) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True, check=True).stdout


def write(root: Path, name: str, text: str) -> None:
    (root / "tickets").mkdir(exist_ok=True)
    (root / "tickets" / name).write_text(text)


def test_collect_reads_main_branches_and_worktrees(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    sh(repo, "init", "-q", "-b", "main")
    write(repo, "T01-a.md", ticket_text("T01", status="DONE"))
    write(repo, "T02-b.md", ticket_text("T02", prereqs="T01", branch="t02-b"))
    write(repo, "T03-c.md", ticket_text("T03", prereqs="T02"))
    write(repo, "T04-d.md", ticket_text("T04", prereqs="T01", branch="t04-d"))
    write(repo, "README.md", "not a ticket")
    sh(repo, "add", ".")
    sh(repo, "commit", "-qm", "tickets")

    # T02: claimed by a branch with one commit of its own, not checked out anywhere.
    sh(repo, "branch", "t02-b")
    sh(repo, "switch", "-q", "t02-b")
    write(repo, "T02-b.md", ticket_text("T02", status="IN PROGRESS", prereqs="T01", branch="t02-b"))
    sh(repo, "commit", "-qam", "claim")
    sh(repo, "switch", "-q", "main")

    # T03: someone marks it BLOCKED in another worktree without committing; a new T05 exists only there.
    wt = tmp_path / "wt"
    sh(repo, "worktree", "add", "-q", "-b", "side", str(wt))
    time.sleep(1.1)  # dirty files are dated by mtime, commits by whole seconds
    write(wt, "T03-c.md", ticket_text("T03", status="BLOCKED (waiting on a person)", prereqs="T02"))
    write(wt, "T05-e.md", ticket_text("T05", prereqs="T04"))

    rows = {r.ticket.id: r for r in build_board(*board.collect(repo), now=time.time())}
    assert {tid: r.state for tid, r in rows.items()} == {
        "T01": "DONE", "T02": "IN PROGRESS", "T03": "BLOCKED", "T04": "READY", "T05": "WAITING",
    }
    assert rows["T02"].detail.startswith("branch t02-b, 1 commit ahead")
    assert rows["T03"].detail == "waiting on a person"
