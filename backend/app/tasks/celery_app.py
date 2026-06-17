from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "mf_attribution",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.nav_ingestion",
        "app.tasks.attribution_compute",
        "app.tasks.report_generation",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    result_expires=86400,  # 24 hours
    task_routes={
        "app.tasks.nav_ingestion.*": {"queue": "ingestion"},
        "app.tasks.attribution_compute.*": {"queue": "compute"},
        "app.tasks.report_generation.*": {"queue": "reports"},
    },
    beat_schedule={
        "sync-amfi-nav-daily": {
            "task": "app.tasks.nav_ingestion.sync_amfi_nav",
            "schedule": crontab(hour=22, minute=0),  # 10 PM IST
        },
        "refresh-holdings-nightly": {
            "task": "app.tasks.attribution_compute.refresh_all_holdings",
            "schedule": crontab(hour=23, minute=0),  # 11 PM IST
        },
    },
)
