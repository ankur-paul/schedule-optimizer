# Deploying the solver (discussion, 22 Oct 2026)

Not started. Pick this up once the app is built (after T18). PLAN.md still says "Vercel deploy of frontend only", so update it when the plan below is final.

## Plan so far

Only free options are on the table.

- **Web app:** Vercel Hobby. Free, but for non-commercial use only. It is a static Vite build, so nothing runs on Vercel's servers.
- **Solver:** AWS Lambda in Mumbai (`ap-south-1`), packaged as a container image and called through a Function URL, on the AWS Free plan.
- **Live-demo fallback:** run the server on a laptop and expose it with a Cloudflare Tunnel. It is the fastest hardware we have and has no quotas.
- **If no solver is reachable**, the app already shows the offline banner and offers a quick draft.

Lambda suits the solver because it is busy for about a minute a day. Lambda bills only the milliseconds a function runs. EC2 bills every second an instance is on, idle or not. Per hour of real work Lambda costs about four times as much as a 4-vCPU EC2 instance, so it stays cheaper as long as the server would be busy less than about a quarter of the time.

## Solve times (measured 22 Oct)

The sample college, pinned with `taskset` to 1, 2, 4 and 6 CPU threads, 20 s time limit, two seeds each. All 210 sessions were placed in every run. Score is the penalty total; lower is better.

| CPUs | Lambda memory that gives this | Time | Score |
|---|---|---|---|
| 1 | 1,769 MB | 20 s (time limit) | 521–675 |
| 2 | ~3,008–3,538 MB | 20 s (time limit) | 18, not proven optimal |
| 4 | 7,168 MB | 5.7–6.2 s | 18, optimal |
| 6 | 10,240 MB | 7.2–7.8 s | 18, optimal |

Lambda gives 1 vCPU per 1,769 MB of memory. Four vCPUs is the target. Two find the same timetable on the sample but use the whole time limit. One is not usable. Lambda's cores are probably slower than this desktop's, so time real solves after deploying.

Importing the solver and OR-Tools takes 0.7 s. Expect a cold start of roughly 1–3 s on top; this is not measured.

A 7 GB solve uses about 43 GB-seconds and a 3 GB solve about 60, so the bigger setting is both faster and cheaper. The always-free allowance of 400K GB-seconds a month covers about 9,000 or 6,600 solves respectively.

## Our AWS account (as of 22 Oct)

- **Plan:** Free plan with a $100 credit. Another $100 is available for finishing the onboarding tasks on the Free Tier page.
  - A Free-plan account cannot be charged. It closes after 6 months or when the credit runs out. Check the end date on the Free Tier page.
  - The always-free Lambda allowance (1M requests and 400K GB-seconds a month, per third-party sources) is separate from the credit.
- **Concurrent executions:** 10. The AWS default is 1,000.
- **Max function memory:** 3,008 MB. Saving a higher value fails with `'MemorySize' value failed to satisfy constraint: Member must have value less than or equal to 3008`.
  - This limit is not listed in Service Quotas. Ask through Support Center, then **Create case**, then **Service limit increase**, with the service set to **Lambda**. If the category list shows SMS, voice and SES, the service field is still on the wrong service.
  - A case asking for 10,240 MB and 1,000 concurrent executions was being filed on 22 Oct. Check whether it went through.
- **Lambda MicroVMs** are switched off for the account (0 GB allocated), so they are no way around the memory cap.
- **Ephemeral storage:** leave it at 512 MB. The solver writes no files.

Until the memory cap is raised, deploy at 3,008 MB with 2 workers and accept 20 s solves.

## Code changes before deploying (any host)

1. **Health check timeout.** `HEALTH_TIMEOUT_MS` in `web/src/engine/solveClient.ts` is 1 s, which a cold start will exceed. The app would show "offline" with the server up.
   - Raise it to about 5 s.
   - Ping `/health` when the site opens and again when step 3 opens. `GenerateStep.tsx` checks only once, when step 3 mounts.
2. **Solve grace.** `SOLVE_GRACE_MS` is 5 s, and the locks probe (T16) alone can take 5 s. Raise it to about 15 s. Changing the time limit under *Advanced* does not help, because the client waits limit plus grace.
3. **Server-side limits.** `time_limit_sec` in `server/models.py` has no upper bound. Add `le=120` and cap the request body size.
   - With 10 concurrent executions AWS won't allow reserved concurrency, so these caps are the main guard.
   - At 3 GB, ten solves running nonstop use up the free allowance in about 4 hours, then about $1.80 an hour of credit. When the credit is gone, the Free plan closes the account.
   - A login does not replace the caps, since a logged-in user can still send a huge time limit. If a gate is wanted, a shared access code checked by the server is enough.
4. **Worker count.** `num_workers = 8` is hard-coded in `server/solver.py`. Read it from an env var such as `SOLVER_WORKERS`. `os.cpu_count()` often reports the host's cores inside containers.
5. **CORS.** `server/main.py` allows only localhost. Read allowed origins from an env var and add the Vercel domain.
6. **Contract version.** Add a version to `/health` and warn in the client on mismatch. Vercel and AWS deploys finish at different times, and Vercel preview builds will call the production solver.
7. **Dockerfile** for `server/` using `uv`.
8. **Deploy workflow** that runs the tests first. The repo has no CI yet, so auto-deploy would ship a broken `main`.

## Lambda setup notes

- Use a **Function URL**, not API Gateway. API Gateway cuts requests at about 30 s, which is shorter than a long solve.
- Use a **container image**, not a zip. The server's installed packages are about 239 MB (OR-Tools 79 MB, pandas 49 MB), close to the 250 MB unzipped zip limit. The image goes in ECR, whose storage may cost a few cents a month from the credit.
- Build the image for the function's architecture. GitHub's default runners are x86.

## Other free options considered

| Option | Verdict |
|---|---|
| Laptop + Cloudflare Tunnel | Good for demos. Free quick tunnels get a new URL each run, so the client must read the solver URL at runtime instead of from `VITE_SOLVER_URL` at build time. Cloudflare cuts requests at about 100 s (not verified). |
| Hugging Face Spaces, CPU Basic | 2 vCPU and 16 GB, Docker supported. Sleeps after 48 h without visits. HF's docs now say Docker Spaces need a paid plan; check before relying on it. |
| Oracle Cloud Always Free | Reportedly cut from 4 to 2 ARM cores in mid-2026, with over-limit instances disabled. Too unstable. |
| Google Cloud Run free tier | Needs a card and bills overage with no hard stop. |
| Render free | 0.1 CPU and about a minute to wake from sleep. |
| Railway, Fly.io | Trials only. Railway was the best fit among paid hosts: it bills actual CPU use and stays running, so there are no cold starts. |
| In-browser exact solver (T14b) | No hosting at all, but it means rewriting the model for a WASM solver. |

## EC2, if it comes up again

- A running instance is billed per second whether or not it handles requests.
- A stopped instance costs only its disk. An Elastic IP is also charged if you keep one.
- A 4-vCPU c7g.xlarge is about $0.10 an hour in Mumbai, about $70 a month left on. That would use up the credit in six weeks. Starting it only for a 3-hour demo costs about $0.30.
- Avoid t3/t4g burstable instances. CP-SAT holds the CPU at 100%, which uses up their CPU credits; they then slow down or bill extra.
- New accounts also cap EC2 vCPUs. Check **Service Quotas**, then **Amazon EC2**, then **Running On-Demand Standard instances**.
- After terminating an instance, delete leftover volumes and release Elastic IPs.

## Sources

Prices come from third-party trackers; check AWS's own pricing pages before relying on them.

- [Rackspace: AWS Free Tier explained 2026](https://spot.rackspace.com/blog/aws-free-tier)
- [tech-insider: What changed in the AWS Free Tier for 2026](https://tech-insider.org/what-changed-in-the-aws-free-tier-for-2026/)
- [Wiz: AWS Lambda cost breakdown 2026](https://www.wiz.io/fr-fr/academy/cloud-cost/aws-lambda-cost-breakdown)
- [DoIT: c7g.xlarge pricing in ap-south-1](https://www.doit.com/compute/spot/ap-south-1/c7g.xlarge)
- [Hugging Face: Spaces overview](https://huggingface.co/docs/hub/en/spaces-overview)
- [InfoQ: Oracle Cloud free tier limits](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- [sota.io: Railway vs Render vs Fly.io pricing 2026](https://sota.io/blog/railway-vs-render-vs-fly-pricing-2026)
