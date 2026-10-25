# T51 — Go live on uselattice.app
**Status:** BLOCKED (needs human: run scripts/go-live-wizard.sh, stages 1–21)
**Lane:** main · **Prereqs:** T46, T49, T50 · **Branch:** t51-go-live

## Goal
Lattice runs at `https://uselattice.app` with the production Supabase project, both Lambda functions and email,
deployed by T50's pipeline, and `docs/deploy.md` says how to do it all again. Plan:
[`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- A setup wizard made with the `wizard` skill (e.g. `scripts/go-live-wizard.sh`) for the steps only the operator
  can do, running the CLI steps itself where it can.
- `docs/deploy.md`: completed, the one place to redo the deploy from scratch.
- `web/.env.production`: the real values.
- `web/scripts/help-shots.ts`: `SITE` → `https://uselattice.app`; rerun `npm run help:shots`.
- `docs/v2-roadmap.md` (#8 built), PROGRESS.md, FEATURES.md (the app's address and what "offline" means now).

## Details
Most steps need the operator's accounts, so set `BLOCKED (needs human: …)` at each wait and say which step.

1. **Cloudflare:** account; add `uselattice.app`; change the nameservers at Name.com; wait for it to go active.
   Redirect rule `www` → apex. Turn on auto-renew at Name.com.
2. **Email:** Email Routing, `privacy@` → the operator's inbox (verify the inbox). Resend: add the domain, its DNS
   records in Cloudflare, verify. One SPF record covering both, one DMARC record (`p=none` to start, reports to
   `privacy@`). Send a test mail to and from the domain; check it lands in the inbox, not spam.
3. **Supabase production project** (free, Mumbai): run `scripts/migrate-prod.sh`; Auth settings: Site URL
   `https://uselattice.app`, redirect allow-list, SMTP through Resend (`Lattice <no-reply@uselattice.app>`), email
   templates as in dev; Google provider with the new client.
4. **Google:** a second OAuth client for the production callback; the consent screen as "Lattice", home and privacy
   URLs on the domain, **no logo**; publish it.
5. **AWS:** `aws login`; run `scripts/aws-setup.sh`; push a first image by hand (or run the deploy) so the functions
   exist; set the env vars by hand from `docs/deploy.md`'s table (solver: `SOLVER_WORKERS=2`, `CORS_ORIGINS`;
   agent: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`, `AGENT_MONTHLY_USD`).
   Check `aws lambda get-account-settings` for the memory cap; if 10,240 MB is approved by now, use ~7 GB and 4
   workers.
6. **Cloudflare Pages:** connect the repo, build `web/` (`npm ci && npm run build`, output `dist`), production
   branch `main`, automatic production deploys **off**, previews off; create the deploy hook. Add the custom domain.
   Confirm a hook call builds `main` with automatic deploys off. **If the hook option is gone:** turn automatic
   production deploys on, set the build command to `npm ci && npm test && npx tsc -b && npm run build`, leave
   `PAGES_DEPLOY_HOOK` unset, and record it in `docs/deploy.md`.
7. **GitHub:** repository secrets (dev Supabase keys from T48, `PAGES_DEPLOY_HOOK`), variable `AWS_ROLE_ARN`.
8. **First deploy:** fill `web/.env.production`, merge to `main`, watch `deploy.yml` go green. Trigger
   `keepalive.yml` by hand once.
9. **Click through on the live site**, on a laptop and a phone:
   - signed out: load the sample, Generate (time the first, cold solve and a warm one), view, print;
   - sign in with Google and with an email link (the email arrives from `no-reply@uselattice.app`); accept v4;
   - create an institute, save online, publish, open the public link signed out;
   - the assistant with a coupon from `issue_coupon.py` against production: one question, one change card;
   - `/privacy`, `/terms`, `/help/start` and a missing page;
   - a rollback to the previous SHA and forward again.
   Record the solve times and anything odd in PROGRESS.md; delete throwaway accounts afterwards.
10. **Docs:** `docs/deploy.md` complete: accounts, every env var per place, the wizard, the workflows, rollback,
    rotating a key, raising the solver's memory, what pauses or expires (Supabase after 7 idle days, GitHub
    schedules after 60, the domain on 24 Oct 2027). The roadmap's *Collected by the passes above* list either done
    or moved into `docs/deploy.md`.

## Tests
- The pipeline's own checks (T50) green on the first deploy.
- The click-through above.

## Done when
- [ ] `https://uselattice.app` serves the app, sign-in works both ways, solves run on Lambda, the assistant answers
- [ ] Deploy, rollback and keep-alive workflows have each run green once
- [ ] `docs/deploy.md` complete; help screenshots retaken with the real domain
- [ ] Roadmap #8 marked built; FEATURES.md, PROGRESS.md
- [ ] Committed: `T51: go live`
