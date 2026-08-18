import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from stock_tracker.config import settings

class StorageManager:
    """JSON-backed persistent storage manager for Watchlists, Alerts, and Logs."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.DB_PATH
        self._ensure_db()

    def _ensure_db(self):
        if not self.db_path.exists():
            default_data = {
                "watchlist": settings.DEFAULT_TICKERS,
                "alerts": [
                    {
                        "id": "1",
                        "ticker": "AAPL",
                        "condition": "price_above",
                        "threshold": 250.0,
                        "enabled": True,
                        "created_at": datetime.now().isoformat()
                    },
                    {
                        "id": "2",
                        "ticker": "META",
                        "condition": "rsi_below",
                        "threshold": 30.0,
                        "enabled": True,
                        "created_at": datetime.now().isoformat()
                    }
                ],
                "alert_logs": []
            }
            self._save_raw(default_data)

    def _load_raw(self) -> Dict[str, Any]:
        try:
            with open(self.db_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"watchlist": settings.DEFAULT_TICKERS, "alerts": [], "alert_logs": []}

    def _save_raw(self, data: Dict[str, Any]):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.db_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    # Watchlist Methods
    def get_watchlist(self) -> List[str]:
        return self._load_raw().get("watchlist", [])

    def add_ticker(self, ticker: str) -> List[str]:
        ticker = ticker.strip().upper()
        data = self._load_raw()
        if ticker and ticker not in data["watchlist"]:
            data["watchlist"].append(ticker)
            self._save_raw(data)
        return data["watchlist"]

    def remove_ticker(self, ticker: str) -> List[str]:
        ticker = ticker.strip().upper()
        data = self._load_raw()
        if ticker in data["watchlist"]:
            data["watchlist"].remove(ticker)
            self._save_raw(data)
        return data["watchlist"]

    # Alert Methods
    def get_alerts(self) -> List[Dict[str, Any]]:
        return self._load_raw().get("alerts", [])

    def add_alert(self, ticker: str, condition: str, threshold: float) -> Dict[str, Any]:
        data = self._load_raw()
        alert = {
            "id": str(len(data["alerts"]) + 1),
            "ticker": ticker.strip().upper(),
            "condition": condition,
            "threshold": float(threshold),
            "enabled": True,
            "created_at": datetime.now().isoformat()
        }
        data["alerts"].append(alert)
        self._save_raw(data)
        return alert

    def delete_alert(self, alert_id: str) -> bool:
        data = self._load_raw()
        initial_len = len(data["alerts"])
        data["alerts"] = [a for a in data["alerts"] if a.get("id") != alert_id]
        if len(data["alerts"]) < initial_len:
            self._save_raw(data)
            return True
        return False

    def log_alert(self, alert_info: Dict[str, Any]):
        data = self._load_raw()
        alert_info["timestamp"] = datetime.now().isoformat()
        data.setdefault("alert_logs", []).append(alert_info)
        self._save_raw(data)

    def get_alert_logs(self, limit: int = 20) -> List[Dict[str, Any]]:
        logs = self._load_raw().get("alert_logs", [])
        return logs[-limit:]

    # Scheduled Reports Methods
    def get_schedules(self) -> List[Dict[str, Any]]:
        return self._load_raw().get("schedules", [])

    def add_schedule(self, frequency: str, time_str: str, recipient: str, day_of_week: Optional[str] = None) -> Dict[str, Any]:
        data = self._load_raw()
        data.setdefault("schedules", [])
        schedule = {
            "id": str(len(data["schedules"]) + 1),
            "frequency": frequency.lower(),
            "day_of_week": (day_of_week.lower() if day_of_week else "monday") if frequency == "weekly" else None,
            "time": time_str.strip(),
            "recipient": recipient.strip(),
            "enabled": True,
            "last_run": None,
            "created_at": datetime.now().isoformat()
        }
        data["schedules"].append(schedule)
        self._save_raw(data)
        return schedule

    def delete_schedule(self, schedule_id: str) -> bool:
        data = self._load_raw()
        schedules = data.get("schedules", [])
        initial_len = len(schedules)
        data["schedules"] = [s for s in schedules if str(s.get("id")) != str(schedule_id)]
        if len(data["schedules"]) < initial_len:
            self._save_raw(data)
            return True
        return False

    def update_schedule_last_run(self, schedule_id: str, run_time: str):
        data = self._load_raw()
        for s in data.get("schedules", []):
            if str(s.get("id")) == str(schedule_id):
                s["last_run"] = run_time
                break
        self._save_raw(data)

storage = StorageManager()
