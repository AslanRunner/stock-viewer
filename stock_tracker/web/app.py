import uvicorn
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from stock_tracker.config import settings
from stock_tracker.database import storage
from stock_tracker.core.data_fetcher import fetcher
from stock_tracker.core.technical_analysis import ta_engine
from stock_tracker.core.alert_engine import alert_engine
from stock_tracker.core.report_generator import report_gen
from stock_tracker.core.scheduler import scheduler

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Professional Stock Market Analysis & Alert System REST API"
)

@app.on_event("startup")
async def startup_event():
    scheduler.start()

# Mount Static Files & Templates & Reports
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.mount("/reports", StaticFiles(directory=str(settings.REPORTS_DIR)), name="reports")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Pydantic Schemas
class TickerRequest(BaseModel):
    ticker: str = Field(..., example="AAPL")

class AlertCreateRequest(BaseModel):
    ticker: str = Field(..., example="AAPL")
    condition: str = Field(..., example="price_above")
    threshold: float = Field(..., example=250.0)

class ScheduleCreateRequest(BaseModel):
    frequency: str = Field(..., example="daily")
    time: str = Field(..., example="09:00")
    recipient: str = Field(..., example="investor@example.com")
    day_of_week: Optional[str] = Field(None, example="monday")

# Routes
@app.get("/", response_class=HTMLResponse)
async def get_dashboard(request: Request):
    """Render main web dashboard."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "app_name": settings.APP_NAME,
            "version": settings.VERSION
        }
    )

# API Endpoints
@app.get("/api/watchlist")
async def get_watchlist():
    """Fetch real-time quotes for all tickers in watchlist."""
    tickers = storage.get_watchlist()
    quotes = fetcher.get_multiple_quotes(tickers)
    return {"watchlist": tickers, "quotes": quotes}

@app.post("/api/watchlist")
async def add_watchlist_ticker(req: TickerRequest):
    """Add a ticker to watchlist."""
    tickers = storage.add_ticker(req.ticker)
    quote = fetcher.get_stock_quote(req.ticker, force_refresh=True)
    return {"status": "success", "watchlist": tickers, "added_quote": quote}

@app.delete("/api/watchlist/{ticker}")
async def remove_watchlist_ticker(ticker: str):
    """Remove a ticker from watchlist."""
    tickers = storage.remove_ticker(ticker)
    return {"status": "success", "watchlist": tickers}

@app.get("/api/quote/{ticker}")
async def get_quote(ticker: str):
    """Get single quote data."""
    quote = fetcher.get_stock_quote(ticker)
    if "error" in quote and quote.get("price") == 0.0:
        raise HTTPException(status_code=404, detail=f"Stock ticker '{ticker}' not found.")
    return quote

import math

def sanitize_nan(data: Any) -> Any:
    """Recursively replace NaN and Inf with None or safe values."""
    if isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return None
        return data
    elif isinstance(data, dict):
        return {k: sanitize_nan(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_nan(v) for v in data]
    return data

@app.get("/api/analysis/{ticker}")
async def get_analysis(ticker: str, period: str = "6mo"):
    """Get technical analysis indicators and historical chart data."""
    quote = fetcher.get_stock_quote(ticker)
    df = fetcher.get_historical_data(ticker, period=period)
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Historical data unavailable for '{ticker}'")

    summary = ta_engine.get_analysis_summary(df)
    chart_data = ta_engine.get_chart_data(df)

    res = {
        "ticker": ticker.upper(),
        "quote": quote,
        "summary": summary,
        "chart_data": chart_data
    }
    return sanitize_nan(res)

@app.get("/api/alerts")
async def get_alerts():
    """List configured alerts and recent alert logs."""
    alerts = storage.get_alerts()
    logs = storage.get_alert_logs()
    return {"alerts": alerts, "logs": logs}

@app.post("/api/alerts")
async def create_alert(req: AlertCreateRequest):
    """Create a new price or indicator alert."""
    alert = storage.add_alert(req.ticker, req.condition, req.threshold)
    return {"status": "success", "alert": alert}

@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """Delete an alert rule."""
    success = storage.delete_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert ID not found")
    return {"status": "success", "message": f"Alert {alert_id} deleted."}

@app.post("/api/alerts/evaluate")
async def evaluate_alerts():
    """Manually trigger alert evaluation."""
    triggered = alert_engine.check_all_alerts()
    return {"triggered_count": len(triggered), "triggered": triggered}

@app.post("/api/reports/generate")
async def generate_report(send_email: bool = False, recipient: Optional[str] = None):
    """Generate HTML & PDF stock market report."""
    tickers = storage.get_watchlist()
    res = report_gen.generate_report(tickers)
    
    email_status = False
    if send_email:
        email_status = report_gen.generate_and_email_report(tickers, recipient=recipient)

    return {
        "status": "success",
        "report_time": res["report_time"],
        "html_filename": res["html_filename"],
        "pdf_filename": res["pdf_filename"],
        "email_sent": email_status,
        "recipient": recipient or settings.RECIPIENT_EMAIL,
        "stocks_count": len(tickers)
    }

@app.get("/api/reports/schedules")
async def get_report_schedules():
    """Get list of active automated report schedules."""
    schedules = storage.get_schedules()
    return {"status": "success", "schedules": schedules}

@app.post("/api/reports/schedules")
async def create_report_schedule(req: ScheduleCreateRequest):
    """Create a new automated report schedule."""
    schedule = storage.add_schedule(
        frequency=req.frequency,
        time_str=req.time,
        recipient=req.recipient,
        day_of_week=req.day_of_week
    )
    return {"status": "success", "schedule": schedule}

@app.delete("/api/reports/schedules/{schedule_id}")
async def delete_report_schedule(schedule_id: str):
    """Delete an automated report schedule."""
    success = storage.delete_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Schedule ID not found")
    return {"status": "success", "message": f"Schedule {schedule_id} deleted."}

@app.post("/api/reports/schedules/{schedule_id}/run")
async def test_run_schedule(schedule_id: str):
    """Manually test and execute a scheduled report immediately."""
    try:
        res = scheduler.run_schedule_now(schedule_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def start_server(host: str = "127.0.0.1", port: int = 8000):
    uvicorn.run("stock_tracker.web.app:app", host=host, port=port, reload=True)

if __name__ == "__main__":
    start_server()
