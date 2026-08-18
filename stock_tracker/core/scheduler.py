import time
import asyncio
import threading
import logging
from datetime import datetime
from typing import Dict, Any, List

from stock_tracker.database import storage
from stock_tracker.core.report_generator import report_gen

logger = logging.getLogger(__name__)

class ReportScheduler:
    """Background engine that periodically evaluates and executes scheduled email reports."""

    def __init__(self, check_interval_seconds: int = 30):
        self.check_interval = check_interval_seconds
        self._running = False
        self._thread = None

    def start(self):
        """Starts background checking thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("Automated Report Scheduler started.")

    def stop(self):
        """Stops background checking thread."""
        self._running = False

    def _run_loop(self):
        while self._running:
            try:
                self.check_and_dispatch_schedules()
            except Exception as e:
                logger.error(f"Error in ReportScheduler loop: {e}")
            time.sleep(self.check_interval)

    def check_and_dispatch_schedules(self):
        """Inspects all stored report schedules and triggers matching jobs."""
        now = datetime.now()
        current_time_str = now.strftime("%H:%M")
        current_date_str = now.strftime("%Y-%m-%d")
        current_weekday = now.strftime("%A").lower() # e.g. 'monday'

        schedules = storage.get_schedules()
        tickers = storage.get_watchlist()

        if not tickers:
            return

        for schedule in schedules:
            if not schedule.get("enabled", True):
                continue

            sched_id = str(schedule.get("id"))
            frequency = schedule.get("frequency", "daily").lower()
            sched_time = schedule.get("time", "")
            target_day = (schedule.get("day_of_week") or "monday").lower()
            recipient = schedule.get("recipient", "")
            last_run = schedule.get("last_run")

            # Check if time matches current HH:MM
            if sched_time != current_time_str:
                continue

            # Prevent running multiple times in the same minute/day
            if last_run and last_run.startswith(current_date_str):
                continue

            should_run = False
            if frequency == "daily":
                should_run = True
            elif frequency == "weekly" and current_weekday == target_day:
                should_run = True

            if should_run:
                logger.info(f"Triggering scheduled report dispatch for ID {sched_id} ({frequency}, {sched_time}) to {recipient}")
                try:
                    success = report_gen.generate_and_email_report(tickers, recipient=recipient)
                    storage.update_schedule_last_run(sched_id, now.strftime("%Y-%m-%d %H:%M:%S"))
                    storage.log_alert({
                        "id": f"sched_{sched_id}",
                        "ticker": "REPORTS",
                        "message": f"Automated {frequency.title()} Report dispatched to {recipient} (Status: {'Success' if success else 'Failed'})"
                    })
                except Exception as ex:
                    logger.error(f"Failed to dispatch scheduled report {sched_id}: {ex}")

    def run_schedule_now(self, schedule_id: str) -> Dict[str, Any]:
        """Manually test and execute a specific schedule immediately."""
        schedules = storage.get_schedules()
        schedule = next((s for s in schedules if str(s.get("id")) == str(schedule_id)), None)
        if not schedule:
            raise ValueError(f"Schedule ID {schedule_id} not found.")

        tickers = storage.get_watchlist()
        recipient = schedule.get("recipient")
        res = report_gen.generate_report(tickers)
        email_status = False
        if recipient:
            email_status = report_gen.generate_and_email_report(tickers, recipient=recipient)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        storage.update_schedule_last_run(schedule_id, now_str)

        return {
            "status": "success",
            "schedule_id": schedule_id,
            "report_time": res["report_time"],
            "email_sent": email_status,
            "recipient": recipient,
            "html_filename": res["html_filename"],
            "pdf_filename": res["pdf_filename"]
        }

scheduler = ReportScheduler()
