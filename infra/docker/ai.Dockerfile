FROM python:3.12-slim
WORKDIR /app
RUN pip install uv
COPY apps/ai/pyproject.toml apps/ai/uv.lock* ./
RUN uv sync --no-dev
COPY apps/ai/src ./src
ENV PYTHONPATH=/app/src
EXPOSE 8000
# API:    uvicorn fi_ai.main:app --host 0.0.0.0 --port 8000
# Worker: celery -A fi_ai.worker worker -l info   (same image, different command)
CMD ["uv", "run", "uvicorn", "fi_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
