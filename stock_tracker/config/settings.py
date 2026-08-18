import os
from pathlib import Path
from typing import List
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

class Settings(BaseModel):
    APP_NAME: str = "Stock Viewer"
    VERSION: str = "1.0.0"
    
    # Default Watchlist Tickers
    DEFAULT_TICKERS: List[str] = ["AAPL", "META", "TSLA", "MSFT", "NVDA", "RKLB"]
    
    # Cache settings (seconds)
    CACHE_EXPIRY_SECONDS: int = int(os.getenv("CACHE_EXPIRY_SECONDS", "300"))
    
    # SMTP Email Configuration
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SENDER_EMAIL: str = os.getenv("SENDER_EMAIL", "")
    RECIPIENT_EMAIL: str = os.getenv("RECIPIENT_EMAIL", "")
    
    # File Paths
    DB_PATH: Path = DATA_DIR / "stock_data.json"
    REPORTS_DIR: Path = DATA_DIR / "reports"

settings = Settings()
settings.REPORTS_DIR.mkdir(exist_ok=True)
