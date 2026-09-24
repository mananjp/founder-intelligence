from celery import Celery

from fi_ai.config import settings

celery_app = Celery("fi_ai", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_acks_late = True  # re-deliver if a worker dies mid-run
celery_app.conf.worker_prefetch_multiplier = 1  # long tasks: don't hoard
celery_app.conf.task_time_limit = 60 * 30


@celery_app.task(name="research.run", bind=True, max_retries=3)
def run_research(self, run_id: str) -> None:
    from fi_ai.research.orchestrator import Orchestrator

    Orchestrator(run_id).execute()


app = celery_app
