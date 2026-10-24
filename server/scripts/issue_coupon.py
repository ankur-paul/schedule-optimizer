"""Issue an assistant trial coupon (T36) and print its code once.

    cd server && uv run scripts/issue_coupon.py --questions 200 --days 30 --note "tester: GNDEC CSE"

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the environment or server/.env). Only the code's hash is stored, so
copy the code now: it can't be shown again. The days count from redemption.
"""

import argparse
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from coupons import issue  # noqa: E402
from supabase_env import load_config  # noqa: E402


def positive(text: str) -> int:
    value = int(text)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be more than 0")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Issue an assistant trial coupon and print its code once.")
    parser.add_argument("--questions", type=positive, default=200, help="questions it unlocks (default 200)")
    parser.add_argument("--days", type=positive, default=30, help="days of access from redemption (default 30)")
    parser.add_argument("--note", help='who it is for, e.g. "tester: GNDEC CSE"')
    args = parser.parse_args()

    config = load_config()
    if config is None:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set (environment or server/.env).", file=sys.stderr)
        return 1
    with httpx.Client(timeout=30) as http:
        code = issue(config, args.questions, args.days, args.note, http)
    print(code)
    print(f"{args.questions} questions, {args.days} days from redemption. Not stored anywhere: copy it now.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
