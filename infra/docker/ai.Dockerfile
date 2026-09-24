# syntax=docker/dockerfile:1
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=0 \
    UV_LINK_MODE=copy
WORKDIR /app
RUN pip install --no-cache-dir uv==0.9.24
COPY apps/ai/pyproject.toml apps/ai/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/ai/src ./src
RUN useradd --system --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser
ENV PYTHONPATH=/app/src \
    UV_CACHE_DIR=/tmp/uv-cache
EXPOSE 8000
# API:    uvicorn fi_ai.main:app --host 0.0.0.0 --port 8000
# Worker: celery -A fi_ai.worker worker -l info   (same image, different command)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status==200 else 1)"]
CMD ["uv", "run", "uvicorn", "fi_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]