import pytest
from stock_tracker.database import storage
from stock_tracker.core.scheduler import scheduler

def test_add_and_get_schedule():
    sched = storage.add_schedule(frequency="daily", time_str="18:30", recipient="test@example.com")
    assert sched["id"] is not None
    assert sched["frequency"] == "daily"
    assert sched["time"] == "18:30"
    assert sched["recipient"] == "test@example.com"

    schedules = storage.get_schedules()
    assert any(s["id"] == sched["id"] for s in schedules)

    # Test delete
    deleted = storage.delete_schedule(sched["id"])
    assert deleted is True

def test_weekly_schedule():
    sched = storage.add_schedule(frequency="weekly", time_str="09:00", recipient="weekly@example.com", day_of_week="friday")
    assert sched["day_of_week"] == "friday"
    storage.delete_schedule(sched["id"])
