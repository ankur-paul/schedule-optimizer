# The server's image (T47): FastAPI under uvicorn. On AWS Lambda the Lambda Web Adapter extension forwards Function
# URL requests to it; anywhere else the adapter is inert, so the same image runs with `podman run`.
# It sits at the repo root, not in server/, because the build context must hold shared/ and web/src/help as well;
# .dockerignore lets only those and the server code in. Build and run: docs/deploy.md.

FROM ghcr.io/astral-sh/uv:0.12.6 AS uv

# Build stage: dependencies from uv.lock into /app/.venv, compiled to bytecode, since Lambda can't write it later.
FROM docker.io/library/python:3.12-slim AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app/server
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Final stage: no uv, no build tools.
FROM docker.io/library/python:3.12-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0 /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=build /app/.venv /app/.venv
# The repo's layout, so agent.py finds shared/agent-tools.json; the help pages are the assistant's system prompt.
COPY shared /app/shared
COPY web/src/help/*.md /app/web/src/help/
WORKDIR /app/server
COPY server/*.py ./
RUN python -m compileall -q .

# Lambda's filesystem is read-only outside /tmp: no bytecode written at run time.
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/health \
    AGENT_HELP_DIR=/app/web/src/help
USER nobody
EXPOSE 8080
# One worker process (CP-SAT uses threads); no access log, since T45's request-log middleware writes one line
# per request instead.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port \"$PORT\" --workers 1 --no-access-log"]
