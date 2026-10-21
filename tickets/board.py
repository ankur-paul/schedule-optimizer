#!/usr/bin/env python3
"""Ticket board, computed from the ticket files on every branch and worktree, so it is never stale.

    python3 tickets/board.py           # the whole board
    python3 tickets/board.py --next    # the next ticket to claim, e.g. "T15 t15-contract" (exit 1 if none)

Each ticket's own **Status:** line is the source of truth (rules in tickets/README.md). The board reads that line
from main, from every local branch and from every worktree, uncommitted edits included. The most recently changed
copy wins, except that DONE on main is final. A local branch named tNN-… claims ticket TNN.
"""
from __future__ import annotations

import re
import subprocess
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

MAIN = "main"
TICKETS_DIR = "tickets"
STALE_HOURS = 2
STATUSES = ("TODO", "IN PROGRESS", "BLOCKED", "PARKED", "DONE")
# Board states, in the order the summary line counts them.
STATES = ("DONE", "MERGE PENDING", "IN PROGRESS", "BLOCKED", "PARKED", "READY", "WAITING")

FILE_RE = re.compile(r"^(T\d\d)-[\w.-]*\.md$")
TITLE_RE = re.compile(r"^# (T\d\d) — (.+)$", re.M)
STATUS_RE = re.compile(r"^\*\*Status:\*\* (.+)$", re.M)
STATUS_VALUE_RE = re.compile(r"^(TODO|IN PROGRESS|BLOCKED|PARKED|DONE)(?: \((.+)\))?$")
PREREQS_RE = re.compile(r"\*\*Prereqs:\*\* ([^·\n]+)")
BRANCH_RE = re.compile(r"\*\*Branch:\*\* (\S+)")
TICKET_ID_RE = re.compile(r"^T\d\d$")
CLAIM_RE = re.compile(r"^t(\d\d)-")


@dataclass
class Ticket:
    id: str
    title: str = ""
    status: str = "TODO"
    reason: str = ""
    prereqs: list[str] = field(default_factory=list)
    branch: str = ""
    problems: list[str] = field(default_factory=list)


@dataclass
class Version:
    """One copy of a ticket file: where it was read and when it last changed (Unix seconds)."""
    source: str
    time: float
    ticket: Ticket


@dataclass
class Claim:
    branch: str
    ahead: int  # commits on the branch that main doesn't have
    last_commit: float | None  # time of the branch's newest commit, if it has any of its own


@dataclass
class Row:
    ticket: Ticket
    state: str  # one of STATES
    detail: str = ""


def parse_ticket(ticket_id: str, text: str) -> Ticket:
    t = Ticket(ticket_id)
    if m := TITLE_RE.search(text):
        t.title = m.group(2).strip()
        if m.group(1) != ticket_id:
            t.problems.append(f"title says {m.group(1)} but the file is {ticket_id}")
    else:
        t.problems.append("no '# TNN — Title' line")

    m = STATUS_RE.search(text)
    value = STATUS_VALUE_RE.match(m.group(1).strip()) if m else None
    if value:
        t.status, t.reason = value.group(1), value.group(2) or ""
    else:
        t.problems.append(f"**Status:** must be one of {', '.join(STATUSES)}, optionally followed by (reason)")

    if m := PREREQS_RE.search(text):
        raw = m.group(1).strip()
        if raw not in ("—", "-", ""):
            for token in (p.strip() for p in raw.split(",")):
                if TICKET_ID_RE.match(token):
                    t.prereqs.append(token)
                else:
                    t.problems.append(f"prereq '{token}' is not a ticket id (list whole tickets only, e.g. T01, T02)")
    else:
        t.problems.append("no **Prereqs:** field")

    if m := BRANCH_RE.search(text):
        t.branch = m.group(1)
    else:
        t.problems.append("no **Branch:** field")
    return t


def ago(seconds: float) -> str:
    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes} min"
    if minutes < 48 * 60:
        return f"{minutes // 60} h"
    return f"{minutes // (24 * 60)} d"


def describe_claim(c: Claim, now: float) -> str:
    if c.ahead == 0 or c.last_commit is None:
        return f"branch {c.branch}, no commits yet"
    text = f"branch {c.branch}, {c.ahead} commit{'' if c.ahead == 1 else 's'} ahead, last {ago(now - c.last_commit)} ago"
    return text + (" (stale?)" if now - c.last_commit > STALE_HOURS * 3600 else "")


def build_board(
    versions: dict[str, list[Version]],
    on_main: dict[str, Ticket],
    claims: dict[str, list[Claim]],
    now: float,
) -> list[Row]:
    """One row per ticket, in id order. Pure: `collect()` does the git reading."""
    done = {tid for tid, t in on_main.items() if t.status == "DONE"}
    rows = []
    for tid in sorted(versions):
        latest = max(versions[tid], key=lambda v: (v.time, STATUSES.index(v.ticket.status)))
        t = latest.ticket
        if tid in done:
            # A newer DONE copy may have fixed its header since; anything else newer is stale, main wins.
            rows.append(Row(t if t.status == "DONE" else on_main[tid], "DONE"))
            continue
        for p in t.prereqs:
            if p not in versions:
                t.problems.append(f"prereq {p} has no ticket file")
        claimed = "; ".join(describe_claim(c, now) for c in claims.get(tid, []))
        if t.status == "DONE":
            where = ", ".join(sorted({v.source for v in versions[tid] if v.ticket.status == "DONE"}))
            rows.append(Row(t, "MERGE PENDING", f"done on {where}, not yet on {MAIN}"))
        elif t.status in ("BLOCKED", "PARKED"):
            rows.append(Row(t, t.status, "; ".join(x for x in (t.reason, claimed) if x)))
        elif t.status == "IN PROGRESS" or claimed:
            rows.append(Row(t, "IN PROGRESS", claimed or f"marked IN PROGRESS on {latest.source}, but no t{tid[1:]}-… branch"))
        else:
            waiting = [p for p in t.prereqs if p not in done]
            rows.append(Row(t, "WAITING", "on " + ", ".join(waiting)) if waiting else Row(t, "READY"))
    return rows


def next_ticket(rows: list[Row]) -> Row | None:
    return next((r for r in rows if r.state == "READY"), None)


def render(rows: list[Row]) -> str:
    counts = Counter(r.state for r in rows)
    lines = [f"Tickets: {len(rows)} · " + " · ".join(f"{counts[s]} {s.lower()}" for s in STATES if counts[s])]
    done = [r.ticket.id for r in rows if r.state == "DONE"]
    if done:
        lines.append(f"{'DONE':<14}{' '.join(done)}")
    for r in rows:
        if r.state != "DONE":
            lines.append(f"{r.state:<14}{r.ticket.id}  {r.ticket.title}" + (f" — {r.detail}" if r.detail else ""))
    nxt = next_ticket(rows)
    if nxt:
        lines.append(f"Next: {nxt.ticket.id}. Claim it: git branch {nxt.ticket.branch} {MAIN}")
    else:
        lines.append("Next: nothing is ready")
    problems = [f"  {r.ticket.id}: {p}" for r in rows for p in r.ticket.problems]
    if problems:
        lines += ["Problems:", *problems]
    return "\n".join(lines)


# --- Reading git -------------------------------------------------------------------------------------------------


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout


def ticket_id(name: str) -> str | None:
    m = FILE_RE.match(name)
    return m.group(1) if m else None


def change_times(repo: Path, ref: str) -> dict[str, float]:
    """Ticket file name → time of the newest commit on `ref` that touched it."""
    out = git(repo, "log", "--format=\x01%ct", "--name-only", ref, "--", f"{TICKETS_DIR}/")
    times: dict[str, float] = {}
    current = 0.0
    for line in out.splitlines():
        if line.startswith("\x01"):
            current = float(line[1:])
        elif line.strip():
            times.setdefault(Path(line).name, current)
    return times


def committed_files(repo: Path, ref: str) -> dict[str, str]:
    """Ticket file name → content, as committed on `ref`."""
    names = [n for n in git(repo, "ls-tree", "--name-only", f"{ref}:{TICKETS_DIR}").split() if ticket_id(n)]
    if not names:
        return {}
    batch = "".join(f"{ref}:{TICKETS_DIR}/{n}\n" for n in names).encode()
    out = subprocess.run(["git", "-C", str(repo), "cat-file", "--batch"], input=batch, capture_output=True, check=True).stdout
    files, pos = {}, 0
    for name in names:
        end = out.index(b"\n", pos)
        header = out[pos:end].split()
        if len(header) < 3 or header[1] == b"missing":
            pos = end + 1
            continue
        size = int(header[2])
        files[name] = out[end + 1 : end + 1 + size].decode()
        pos = end + 1 + size + 1
    return files


def worktrees(repo: Path) -> list[tuple[Path, str | None]]:
    """(path, branch or None if detached) for every worktree that still exists."""
    out, result = git(repo, "worktree", "list", "--porcelain"), []
    for block in out.strip().split("\n\n"):
        fields = dict(line.split(" ", 1) if " " in line else (line, "") for line in block.splitlines())
        path = Path(fields.get("worktree", ""))
        if "bare" in fields or not path.is_dir():
            continue
        branch = fields.get("branch", "").removeprefix("refs/heads/") or None
        result.append((path, branch))
    return result


def collect(repo: Path) -> tuple[dict[str, list[Version]], dict[str, Ticket], dict[str, list[Claim]]]:
    versions: dict[str, list[Version]] = {}

    def add(source: str, files: dict[str, str], times: dict[str, float]) -> dict[str, Ticket]:
        parsed = {}
        for name, text in files.items():
            tid = ticket_id(name)
            if tid:
                parsed[tid] = parse_ticket(tid, text)
                versions.setdefault(tid, []).append(Version(source, times.get(name, 0.0), parsed[tid]))
        return parsed

    on_main = add(MAIN, committed_files(repo, MAIN), change_times(repo, MAIN))

    checked_out = set()
    for path, branch in worktrees(repo):
        checked_out.add(branch)
        times = change_times(path, "HEAD")
        dirty = {Path(line[3:]).name for line in git(path, "status", "--porcelain", "--", f"{TICKETS_DIR}/").splitlines()}
        files = {}
        for f in (path / TICKETS_DIR).glob("T*.md"):
            files[f.name] = f.read_text()
            if f.name in dirty:
                times[f.name] = f.stat().st_mtime
        add(f"{branch or path.name} (worktree)", files, times)

    branches = git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads").split()
    for b in branches:
        if b != MAIN and b not in checked_out:
            add(b, committed_files(repo, b), change_times(repo, b))

    claims: dict[str, list[Claim]] = {}
    for b in branches:
        m = CLAIM_RE.match(b)
        tid = f"T{m.group(1)}" if m else None
        if not tid or (tid in on_main and on_main[tid].status == "DONE"):
            continue
        ahead = int(git(repo, "rev-list", "--count", f"{MAIN}..{b}").strip())
        last = float(git(repo, "log", "-1", "--format=%ct", b).strip()) if ahead else None
        claims.setdefault(tid, []).append(Claim(b, ahead, last))
    return versions, on_main, claims


def main(argv: list[str]) -> int:
    repo = Path(__file__).resolve().parent.parent
    rows = build_board(*collect(repo), now=time.time())
    if "--next" in argv:
        nxt = next_ticket(rows)
        if not nxt:
            return 1
        print(nxt.ticket.id, nxt.ticket.branch)
        return 0
    print(render(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
