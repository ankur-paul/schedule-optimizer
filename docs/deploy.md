# Deploying Lattice

How Lattice runs in production and how a commit gets there, so all of it can be redone from scratch. Plan and
reasons: [`discussions/2026-10-25-deploy.md`](discussions/2026-10-25-deploy.md).

## Where things run

| Part | Where | Address / name |
|---|---|---|
| Web app (static Vite build) | Cloudflare Pages, project `lattice` | `https://uselattice.app`; `www` redirects there |
| Solver (`/health`, `/solve`) | AWS Lambda `lattice-solver`, Mumbai, 3,008 MB, 150 s | its Function URL (`VITE_SOLVER_URL`) |
| Assistant (`/agent`) | AWS Lambda `lattice-agent`, Mumbai, 512 MB, 300 s, same image | its Function URL (`VITE_AGENT_URL`) |
| Accounts, institutes, timetables | Supabase project `lattice-prod`, Mumbai, Free (dev is a separate project) | `VITE_SUPABASE_URL` |
| Sign-in emails | Resend, through Supabase's custom SMTP | `Lattice <no-reply@uselattice.app>` |
| `privacy@uselattice.app` | Cloudflare Email Routing | forwards to the operator's inbox |
| DNS | Cloudflare (Free) | nameservers set at Name.com |
| Domain registration | Name.com | `uselattice.app`, auto-renew on |
| Google sign-in | Google Cloud, the dev project's consent screen ("Lattice", published) | OAuth client *Lattice Supabase production* |
| Images | ECR `lattice-server`, Mumbai | tagged with the commit SHA, last 10 kept |
| CI and deploys | GitHub Actions on `ankur-paul/schedule-optimizer` | `ci.yml`, `deploy.yml`, `rollback.yml`, `keepalive.yml` |

Accounts: Cloudflare, Name.com, Resend, Supabase, Google Cloud, AWS, Anthropic, GitHub, all the operator's.

## Setting it up from scratch

[`scripts/go-live-wizard.sh`](../scripts/go-live-wizard.sh) walks through every step in order, opens each page,
says what to click, runs the CLI parts itself (`dig` checks, `migrate-prod.sh`, `aws-setup.sh`, `smoke.sh`) and
writes the public values into `web/.env.production`. Secrets are pasted straight into the dashboard that keeps
them; the wizard never sees them, except the Pages deploy hook, which it puts in GitHub.

```bash
scripts/go-live-wizard.sh        # all 21 stages
scripts/go-live-wizard.sh 14     # from stage 14; earlier values come back from web/.env.production
```

Needs `dig`, `curl`, `aws` (2.32 or newer, for `aws login`), `gh` logged in, `npx`, and `podman` or `docker`.

| # | Stage | What it sets up |
|---|---|---|
| 1–2 | Cloudflare, Name.com | the zone (Name.com's three parking `A` records, `*`, apex and `www`, deleted); Cloudflare's nameservers at Name.com, DNSSEC off there, auto-renew on |
| 3 | `www` | a proxied `AAAA www 100::` placeholder and a 301 redirect rule `www` → apex, keeping path and query |
| 4 | `privacy@` | Email Routing: `privacy@` → the operator's inbox (verified); Cloudflare's MX and SPF on the apex; catch-all off |
| 5 | Resend | the domain verified: its MX and SPF on `send.uselattice.app`, DKIM on `resend._domainkey`; `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:privacy@uselattice.app` |
| 6–7 | Supabase project | `lattice-prod`, Mumbai, Free, default security options; URL and publishable key into `web/.env.production` |
| 8 | Migrations | `scripts/migrate-prod.sh`, then `scripts/smoke.sh migrations` |
| 9 | Auth URLs | Site URL `https://uselattice.app`; redirect URL `https://uselattice.app/**` |
| 10 | SMTP | a Resend key (sending access, this domain only); Supabase SMTP: `smtp.resend.com`, port 465, user `resend`, sender `Lattice <no-reply@uselattice.app>`; default email templates |
| 11 | Email test | an invite from Supabase (SPF, DKIM, DMARC pass; user deleted), and a mail to `privacy@` |
| 12–13 | Google client | a second OAuth client for production's `https://<ref>.supabase.co/auth/v1/callback`; Supabase's Google provider |
| 14 | AWS | `aws login`; `scripts/aws-setup.sh <budget email>`; both Function URLs into `web/.env.production` |
| 15–16 | Lambda env vars | set in the console, see the table below; then `scripts/smoke.sh server` |
| 17 | Pages | Git connection, root `web`, build `npm ci && npm run build`, output `dist`, `NODE_VERSION=24` |
| 18 | Deploy hook | automatic production deploys off, previews off; hook `github-deploy` on `main` tried once, saved as `PAGES_DEPLOY_HOOK` (or the fallback below) |
| 19 | Custom domain | `uselattice.app` on the Pages project |
| 20 | Consent screen | name Lattice, no logo; home, privacy and terms on the domain; authorized domains; published |
| 21 | GitHub | variable `AWS_DEPLOY_ROLE_ARN`; checks the CI secrets |

Then commit `web/.env.production`, push to `main`, watch `deploy.yml`, and run `keepalive.yml` once by hand.

Email records: SPF lives on two names, each with exactly one record: Cloudflare's on `uselattice.app` (for
forwarding) and Resend's on `send.uselattice.app` (the return path Resend sends with). DMARC passes on Resend's
DKIM signature. Start DMARC at `p=none`; after a few weeks of clean reports to `privacy@`, raise it to
`p=quarantine`.

## Settings per place

**Lambda environment variables**, set by hand in the console (Configuration → Environment variables), never by a
deploy. A function gets only what it uses.

| Function | Variable | Value |
|---|---|---|
| `lattice-solver` | `SOLVER_WORKERS` | `2` (4 at 7 GB, see below) |
| | `CORS_ORIGINS` | `https://uselattice.app` |
| `lattice-agent` | `ANTHROPIC_API_KEY` | an Anthropic key named `lattice-production` (secret) |
| | `SUPABASE_URL` | production's project URL |
| | `SUPABASE_SERVICE_ROLE_KEY` | production's secret (or service_role) key (secret) |
| | `CORS_ORIGINS` | `https://uselattice.app` |
| | `AGENT_MONTHLY_USD` | `10` |

**`web/.env.production`** (committed, public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SOLVER_URL`,
`VITE_AGENT_URL`, `VITE_CONTACT_EMAIL`. See *Production settings* below.

**GitHub** (Settings → Secrets and variables → Actions): secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (all **dev**, for CI) and `PAGES_DEPLOY_HOOK`; variable `AWS_DEPLOY_ROLE_ARN`.

**Supabase production** (dashboard): Auth URL configuration, custom SMTP, the Google provider's client ID and
secret. **Cloudflare Pages**: build settings, branch control, the deploy hook, the custom domain.

## Looking after it

**Rotating a key.** Make the new one, put it where it's used, then delete the old one:
- Anthropic: a new key → `lattice-agent`'s `ANTHROPIC_API_KEY` → Save (the next request uses it).
- Supabase secret key: Project Settings → API keys → a new secret key → `lattice-agent`'s
  `SUPABASE_SERVICE_ROLE_KEY`; then delete the old key. A legacy service_role JWT rotates only with the JWT secret,
  which also signs everyone out.
- Resend: a new sending key → Supabase SMTP password → Save.
- Google client secret: add a secret on the client → Supabase's Google provider → Save → disable the old one.
- Pages deploy hook: delete it, add a new one, `gh secret set PAGES_DEPLOY_HOOK`.
- The database password (only `migrate-prod.sh` uses it): Project Settings → Database → Reset.

**Raising the solver's memory.** When AWS approves 10,240 MB: `lattice-solver` → Configuration → General
configuration → Memory 7168 MB; Environment variables → `SOLVER_WORKERS` = `4`. No new build.

**What pauses or expires:**

| What | When | Fix |
|---|---|---|
| Supabase Free project | pauses after 7 days without activity | `keepalive.yml` every 3 days; if paused, Restore in the dashboard |
| GitHub schedules | off after 60 days without a commit | Actions → Keep-alive → Enable workflow |
| `uselattice.app` | 24 Oct 2027 | auto-renew at Name.com; keep the card current |
| AWS Free plan | the operator's to watch | the $5 budget alert emails |
| Resend Free | 100 emails a day, 3,000 a month | only sign-in links and invites use it |

## CI

`.github/workflows/ci.yml` runs on every push to a branch other than `main`, every pull request, and as a reusable
workflow for the deploy (a push to `main` runs it only through `deploy.yml`, so `main` isn't tested twice):

- `web`: `npm ci`, `npm test`, `npx tsc -b`, `npm run build` on Node 24.
- `server`: `uv sync --frozen`, `uv run pytest`, including the `supabase` tests against the **dev** project.

A pull request from a branch in this repository shows the checks of the push run; its own `pull_request` run skips
both jobs (shown as skipped), so each commit is tested once. A pull request from a fork runs them itself.

Only one `server` job runs at a time (concurrency group `supabase-dev`): the tests share the dev project, and the
agent budget test reads the month's spend across every run. GitHub keeps one waiting run per group, so if a third
push comes in while one runs and one waits, the waiting one is cancelled (it shows as cancelled, not failed).

### GitHub secrets

Repository secrets for the **dev** Supabase project, passed only to the `server` job's test step. Nothing for
production goes here.

| Secret | Where to find it |
|---|---|
| `SUPABASE_URL` | dev project → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | same page, the anon (or publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the service_role (or secret) key |

They are the same values as `server/.env`. Set them under GitHub → repository → Settings → Secrets and variables →
Actions → New repository secret, or from that file with the GitHub CLI:

```bash
cd server && set -a && . ./.env && set +a
for k in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do gh secret set "$k" --body "${!k}"; done
```

Without them (forks, or before they are set), the `supabase` tests skip and the job still passes.

## Server image (T47)

One image runs the FastAPI server on AWS Lambda and, unchanged, on a laptop. The [`Dockerfile`](../Dockerfile) is
at the repo root because the image also carries `shared/` (the assistant's tools, the contract version) and
`web/src/help/*.md` (the assistant's system prompt); [`.dockerignore`](../.dockerignore) lets in only those and the
server code, never a `.env` file.

- Base: `python:3.12-slim`, `linux/amd64`. Dependencies come from `server/uv.lock` (`uv sync --frozen --no-dev`)
  in a build stage; the final stage has no uv and no build tools. Bytecode is compiled at build time.
- [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) **1.1.0** is copied in as an
  extension (`/opt/extensions/lambda-adapter`). On Lambda it forwards Function URL requests to uvicorn on `PORT`
  (8080) once `AWS_LWA_READINESS_CHECK_PATH=/health` answers; outside Lambda it does nothing. Invoke mode stays
  `buffered` (the default), as nothing streams.
- uvicorn runs one worker process without its access log, as user `nobody`. Nothing writes outside `/tmp`
  (`PYTHONDONTWRITEBYTECODE=1`), since Lambda's filesystem is read-only.
- Settings come from the environment only (`server/.env` is not in the image). With no keys, `/solve` works and
  `/agent` answers 503 `not_configured`.

Build and run from the repo root:

```bash
podman build --platform linux/amd64 -t lattice-server .
podman run --rm -p 8080:8080 lattice-server                 # the solver at http://localhost:8080
podman run --rm -p 8080:8080 --env-file server/.env lattice-server   # with the assistant's keys too
```

`docker` takes the same arguments. Point the web app at it with `VITE_SOLVER_URL=http://localhost:8080`.

Smoke test: [`server/scripts/image_smoke.sh`](../server/scripts/image_smoke.sh) builds the image, runs it read-only
like Lambda, waits for `/health`, solves the sample college with a 10 s limit (every session must be placed) and
checks that `/agent` refuses with `not_configured`. It prints the image size and the time to the first `/health`.
`SMOKE_PORT` picks another host port.

## Deploy pipeline (T50)

| Workflow | When | What |
|---|---|---|
| [`deploy.yml`](../.github/workflows/deploy.yml) | every push to `main` | CI, then the migration check, the image, both functions, the web app, the smoke check |
| [`rollback.yml`](../.github/workflows/rollback.yml) | Actions → Rollback → Run workflow, with a SHA | both functions back to that commit's image, then the server smoke check |
| [`keepalive.yml`](../.github/workflows/keepalive.yml) | every 3 days, or Run workflow | `schema_version()` and the smoke check |

`deploy.yml` and `rollback.yml` share the concurrency group `deploy`: one at a time, none cancelled. A push that
comes in during a deploy waits; if a third comes, GitHub drops the older waiting run (it shows as cancelled) and
deploys the newest.

### deploy.yml, step by step

1. **CI** (`ci.yml` through `workflow_call`, with the repository's secrets). The deploy job needs it to pass.
2. **Migration check:** `scripts/smoke.sh migrations` calls production's `schema_version()` with the anon key and
   fails with "run scripts/migrate-prod.sh" if it is older than the newest file in `supabase/migrations/`. Nothing
   has been deployed at that point.
3. **Image:** logs in to AWS through OIDC as the role in the repository variable `AWS_DEPLOY_ROLE_ARN`, builds
   the [`Dockerfile`](../Dockerfile) for `linux/amd64` with `--provenance=false` (Lambda refuses an image index)
   and pushes it to ECR as `lattice-server:<commit SHA>`. It signs in to ECR Public first, where the Lambda
   adapter comes from: anonymous pulls share a per-IP cap with everyone on the runner's address and fail with 429
   "Data limit exceeded" (the first deploy hit it). If that sign-in fails it warns and pulls anonymously.
4. **Functions:** `aws lambda update-function-code` on `lattice-solver` and `lattice-agent`, then waits for both
   updates to finish. It **never** calls `update-function-configuration`: env vars, memory and timeout are set by
   hand in the console, and a deploy leaves them alone.
5. **Web:** POSTs the Pages deploy hook (secret `PAGES_DEPLOY_HOOK`) and waits, up to 15 minutes, until
   `https://uselattice.app/version.txt` shows the commit (`scripts/smoke.sh wait-web <sha>`). Without the secret it
   skips the POST and only waits; see *If the deploy hook is gone* below.
6. **Smoke check:** `scripts/smoke.sh`.

A failure at any step stops the rest; what already changed stays changed. A failure after step 4 leaves the new
server with the old web app; both speak the same contract unless `shared/contract.json` changed, and the web app
warns when they don't (T46). Fix forward, or roll back.

### GitHub settings

On top of CI's secrets above. Repository → Settings → Secrets and variables → Actions.

| Name | Kind | Value |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | variable (not secret) | `arn:aws:iam::<account>:role/lattice-deploy`, printed by `scripts/aws-setup.sh` |
| `PAGES_DEPLOY_HOOK` | secret | Pages project → Settings → Builds → Deploy hooks → the hook's URL, for branch `main` |

```bash
gh variable set AWS_DEPLOY_ROLE_ARN --body "arn:aws:iam::<account>:role/lattice-deploy"
gh secret set PAGES_DEPLOY_HOOK     # paste the URL when asked
```

Anyone holding the hook URL can start a build, nothing more; if it leaks, delete the hook and make a new one.

### Production settings: web/.env.production

The production build's public settings, committed (Q23): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_SOLVER_URL`, `VITE_AGENT_URL` (both Function URLs, no trailing slash) and `VITE_CONTACT_EMAIL`. Until T51 has
the values, those lines are commented out. `.gitignore` ignores every `.env*` file but this one.

Vite reads it for every `npm run build`, over `.env.local`, so a local production build talks to production. To
build against the dev project, copy the dev values into `web/.env.production.local` (ignored), which wins.

`scripts/smoke.sh` and `scripts/migrate-prod.sh` read their URLs, the anon key and the project ref from the same
file.

### Migrations: schema_version() and migrate-prod.sh

[`supabase/migrations/20261029000000_schema_version.sql`](../supabase/migrations/20261029000000_schema_version.sql)
adds `public.schema_version()`: the newest version in `supabase_migrations.schema_migrations`, e.g.
`'20261029000000'`. It is `security definer`, callable by `anon`, and reveals only that timestamp.
`server/tests/test_schema_version.py` checks that dev's equals the newest file name's prefix.

Production migrations run from the operator's laptop, never from CI:

```bash
npx supabase login               # once
scripts/migrate-prod.sh          # the ref from web/.env.production, or: scripts/migrate-prod.sh <ref>
```

It links a temporary copy of `supabase/` (the repo stays linked to dev), asks for the database password (kept in
memory only, passed as `SUPABASE_DB_PASSWORD`), shows `supabase migration list`, and runs `supabase db push`
after you type `yes`. It refuses the ref the repo is linked to. Run it **before** pushing a commit with a new
migration; the deploy stops at step 2 until you have.

### AWS: scripts/aws-setup.sh

Run once with your own AWS login (T51), and again whenever; it prints `+` for what it did and `=` for what was
already there:

```bash
scripts/aws-setup.sh you@example.com    # the address the budget alert emails
```

In `ap-south-1` (Mumbai) it makes:

- **ECR** repository `lattice-server`, with a lifecycle rule keeping the last 10 images (so rollback reaches 10
  deploys back).
- **GitHub's OIDC provider** and the role **`lattice-deploy`**, trusted only for `main` of this repository. The token's subject is
  `repo:ankur-paul/schedule-optimizer:ref:refs/heads/main`, or with immutable ids
  (`repo:ankur-paul@132210959/schedule-optimizer@1428875491:ref:refs/heads/main`) as this repository uses; the
  script asks GitHub which (`gh api repos/<repo>/actions/oidc/customization/sub`) and trusts both. It may push to `lattice-server`, sign in
  to ECR Public (`ecr-public:GetAuthorizationToken`, `sts:GetServiceBearerToken`) and call
  `UpdateFunctionCode`/`GetFunction` on the two functions, nothing else.
- The role **`lattice-lambda`** the functions run as, with `AWSLambdaBasicExecutionRole` (logs only).
- **`lattice-solver`** (3,008 MB, 150 s) and **`lattice-agent`** (512 MB, 300 s), x86_64, from the newest image
  in ECR; if there is none, it builds and pushes one from your checkout with `podman` (or `docker`). Each gets a
  **Function URL** with auth `NONE` and CORS off (FastAPI answers CORS), plus both resource-policy statements a
  public URL needs since October 2025 (`lambda:InvokeFunctionUrl`, and `lambda:InvokeFunction` only through the
  URL). Their log groups keep 14 days.
- The **budget** `lattice-monthly`: an email when the month's cost before credits passes $5.

A function that already exists is left exactly as it is: the script never sets or changes env vars, memory or
timeout. Created functions have no env vars; set them in the console (T51).

### Smoke check: scripts/smoke.sh

```bash
scripts/smoke.sh                  # server + web
scripts/smoke.sh server           # /health on both functions
scripts/smoke.sh web              # https://uselattice.app/privacy
scripts/smoke.sh migrations       # production's schema_version() against supabase/migrations
scripts/smoke.sh wait-web <sha>   # until /version.txt is <sha> (WAIT_WEB_SEC, default 900)
```

- **server:** each Function URL's `/health` answers within 30 s (one retry). The first start on a new image
  takes about 15 s: it outruns Lambda's 10 s init limit, and Lambda starts it again inside the request with the contract
  version in `shared/contract.json`.
- **web:** `/privacy` answers 200 and shows `Version <POLICY_VERSION>` from `web/src/legal/policy.ts`.

URLs come from `web/.env.production`; `SOLVER_URL`, `AGENT_URL`, `SITE_URL`, `SUPABASE_URL` and
`SUPABASE_ANON_KEY` override them. Against a local run (the image twice, as the two functions, and a preview):

```bash
podman run -d --rm -p 8091:8080 lattice-server; podman run -d --rm -p 8092:8080 lattice-server
(cd web && npm run build && npm run preview -- --port 4173)
SOLVER_URL=http://127.0.0.1:8091 AGENT_URL=http://127.0.0.1:8092 SITE_URL=http://127.0.0.1:4173 scripts/smoke.sh
```

Every build writes `version.txt`, the commit it was built from (`CF_PAGES_COMMIT_SHA` on Pages, else `git
rev-parse HEAD`; `vite-plugin-version.ts`).

### Rollback

**Server:** Actions → Rollback → Run workflow (on `main`), with the full SHA of a commit deployed in the last 10.
It checks ECR has that image, points both functions at it, waits, and runs `scripts/smoke.sh server` against that
commit's contract version. The smoke script itself comes from `main`, so a fix to it applies to every rollback.

**Web app:** in the Pages dashboard, Deployments → the deployment to go back to → Rollback to this deployment.

The two roll back separately, so keep them on the same contract: if `shared/contract.json` changed between the
two commits, roll both back; otherwise the web app shows the grey "The solver was updated at a different time"
line (T46) and solves may fail. The next push to `main` deploys both again.

### Keep-alive

`keepalive.yml` runs at 06:17 UTC on days 1, 4, 7, … of each month (gaps of at most 3 days), and from Run
workflow. It calls `schema_version()`, so the free Supabase project never pauses (it does after 7 days without
activity), and runs the smoke check. GitHub emails whoever last changed the schedule when a run fails, so this is the
uptime check too. GitHub turns off schedules after 60 days without a commit to the repo; turn it back on under
Actions then.
It needs no secrets and no AWS login.

### Cloudflare Pages

**Routing (`web/public/_redirects`).** Pages serves `privacy.html`, `terms.html`, `help.html` and
`help/<page>.html` at `/privacy`, `/terms`, `/help` and `/help/<page>` by itself, and redirects the `.html` forms
there (308). The one rule we need is the public timetable link `/<handle>/<id>` → `published.html`. Pages applies
`_redirects` **even where a real file exists** ("Redirects are always followed, regardless of whether or not an
asset matches the incoming request"), first match only, so the file passes `/assets/*` and `/help/*` through as
themselves before the `/:handle/:id` rule. Without those two lines `/help/start` and every help image get the
timetable page. The target is `/published`, not `/published.html`, which would 308.

`web/src/deploy/redirects.test.ts` reads the file the way Pages does and checks the sample paths, and that it
agrees with `isPublishedRewrite`, which `npm run dev` and `npm run preview` use. Checked on the real build with
`npx wrangler@4.152.0 pages dev dist` (Cloudflare's local Pages server; no account): `/acme/abc123` and
`/gndec/k7f3q9xa2m` serve the timetable page; `/`, `/privacy`, `/terms`, `/help`, `/help/start`, a help PNG, an
`/assets/` script, `/favicon.svg` and `/version.txt` serve themselves. Same in `npm run preview`. No `_headers`:
Pages' default caching works with Vite's hashed file names.

**Deploy hook with automatic deploys off (Q24).** What Cloudflare's docs say, read 25 Oct 2026:

- Deploy hooks: Settings → Builds → Add deploy hook, with a name and the branch to build; "receive HTTP POST
  requests in order to initiate new deployments"; no body or auth. (Page updated 21 Apr 2026.)
- Branch control: a checkbox to "enable or disable automatic deployment behavior on the production branch".
- Neither page says whether a hook still builds with that checkbox off. T51 tries it live: hook made, checkbox off,
  one push to `main`.

Pages build settings (T51): root directory `web`, build output `dist`, build command `npm ci && npm run build`,
env var `NODE_VERSION=24` (CI's version).

**If the deploy hook is gone** (decided 25 Oct): leave `PAGES_DEPLOY_HOOK` unset, turn automatic deploys **on** for
`main`, and make the build command `npm ci && npm test && npx tsc -b && npm run build`, so a failing test fails the
Pages build and the old site stays. `deploy.yml` needs no edit: with the secret unset, step 5 only waits for
`version.txt`. Pages then builds without waiting for CI, so a push that fails the server tests can still reach the
web app.

### Checked with

`actionlint` 1.7.12 on the workflows (with shellcheck on their `run:` blocks) and `shellcheck` 0.11.0 on the
three scripts, both clean; run them with `uvx --from actionlint-py actionlint` and
`uvx --from shellcheck-py shellcheck scripts/smoke.sh scripts/migrate-prod.sh scripts/aws-setup.sh`.
`aws-setup.sh` and `migrate-prod.sh` haven't run against production yet (no account); T51 runs them.
