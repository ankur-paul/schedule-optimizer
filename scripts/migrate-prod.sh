#!/usr/bin/env bash
# Applies supabase/migrations to the PRODUCTION project (T50), from the operator's laptop: CI never holds a
# production database credential, and deploy.yml stops until this has run (scripts/smoke.sh migrations).
#
#   scripts/migrate-prod.sh [project-ref]
#
# The ref defaults to the one in web/.env.production's VITE_SUPABASE_URL. Needs `npx supabase login` once. Links
# a throwaway copy of supabase/, so the repo stays linked to the dev project, shows `supabase migration list`, asks
# before `supabase db push`, and never writes the database password anywhere.

set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)

fail() { echo "FAIL: $*" >&2; exit 1; }

url=$(sed -n 's/^VITE_SUPABASE_URL=//p' "$REPO/web/.env.production" 2>/dev/null | tail -1 |
  sed -e 's/^["'\'']//' -e 's/["'\'']$//')
REF=${1:-$(sed -n 's|^https://\([a-z0-9]*\)\.supabase\.co/*$|\1|p' <<<"$url")}
[[ $REF =~ ^[a-z]{20}$ ]] || fail "give the production project ref (20 letters), or set VITE_SUPABASE_URL in web/.env.production"
[[ $REF != "$(cat "$REPO/supabase/.temp/project-ref" 2>/dev/null)" ]] ||
  fail "$REF is the project this repo is linked to (dev); give the production ref"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/supabase"
cp -r "$REPO/supabase/config.toml" "$REPO/supabase/migrations" "$WORK/supabase/"
supabase() { npx --yes supabase --workdir "$WORK" "$@"; }

read -rsp "Database password for $REF (Project Settings → Database): " SUPABASE_DB_PASSWORD
echo
[[ -n $SUPABASE_DB_PASSWORD ]] || fail "no password given"
export SUPABASE_DB_PASSWORD

echo "== link $REF (a temporary copy of supabase/)"
supabase link --project-ref "$REF"

echo "== migrations: local and on $REF"
supabase migration list --linked

read -rp "Apply the migrations missing on $REF to PRODUCTION? Type yes: " answer
[[ $answer == yes ]] || { echo "Nothing applied."; exit 0; }

supabase db push --linked --yes
echo "== done; scripts/smoke.sh migrations checks it"
