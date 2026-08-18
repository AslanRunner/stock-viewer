import time
import logging
from typing import Dict, Any, List, Optional
import yfinance as yf
import pandas as pd
from stock_tracker.config import settings

logger = logging.getLogger(__name__)

class StockDataFetcher:
    """Wrapper around yfinance with caching, retries, and data formatting."""

    def __init__(self, cache_ttl: int = settings.CACHE_EXPIRY_SECONDS):
        self.cache_ttl = cache_ttl
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._hist_cache: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def format_large_number(num: Optional[float]) -> str:
        """Format numbers into readable financial notation (K, M, B, T)."""
        if num is None or pd.isna(num):
            return "N/A"
        abs_num = abs(num)
        sign = "-" if num < 0 else ""
        if abs_num >= 1e12:
            return f"{sign}${abs_num / 1e12:.2f}T"
        elif abs_num >= 1e9:
            return f"{sign}${abs_num / 1e9:.2f}B"
        elif abs_num >= 1e6:
            return f"{sign}${abs_num / 1e6:.1f}M"
        elif abs_num >= 1e3:
            return f"{sign}${abs_num / 1e3:.1f}K"
        return f"{sign}${abs_num:.2f}"

    def get_stock_quote(self, ticker: str, force_refresh: bool = False) -> Dict[str, Any]:
        """Fetch quote & key statistics for a single ticker."""
        ticker = ticker.strip().upper()
        now = time.time()

        if not force_refresh and ticker in self._cache:
            cached_item = self._cache[ticker]
            if now - cached_item["timestamp"] < self.cache_ttl:
                return cached_item["data"]

        try:
            yt = yf.Ticker(ticker)
            info = yt.info or {}
            
            # Fetch recent intraday or daily history
            hist = yt.history(period="5d", interval="1d")
            if hist.empty:
                hist = yt.history(period="1d", interval="1m")

            if hist.empty:
                raise ValueError(f"No market data returned for '{ticker}'")

            current_price = (
                info.get("regularMarketPrice") or 
                info.get("currentPrice") or 
                info.get("preMarketPrice") or 
                info.get("postMarketPrice")
            )
            if current_price is None or pd.isna(current_price):
                current_price = float(hist["Close"].iloc[-1])

            prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
            if prev_close is None or pd.isna(prev_close):
                if len(hist) > 1:
                    prev_close = float(hist["Close"].iloc[-2])
                else:
                    prev_close = current_price

            change = current_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close else 0.0

            volume = info.get("volume") or info.get("regularMarketVolume")
            if volume is None or pd.isna(volume):
                volume = float(hist["Volume"].iloc[-1]) if not hist.empty else 0

            market_cap = info.get("marketCap")
            
            fifty_two_high = info.get("fiftyTwoWeekHigh") or (float(hist["High"].max()) if not hist.empty else current_price)
            fifty_two_low = info.get("fiftyTwoWeekLow") or (float(hist["Low"].min()) if not hist.empty else current_price)

            data = {
                "ticker": ticker,
                "name": info.get("shortName") or info.get("longName") or ticker,
                "price": round(current_price, 2),
                "previous_close": round(prev_close, 2),
                "change": round(change, 2),
                "change_percent": round(change_percent, 2),
                "volume": volume,
                "volume_str": f"{volume / 1e6:.1f}M" if volume >= 1e6 else f"{volume:.0f}",
                "market_cap": market_cap,
                "market_cap_str": self.format_large_number(market_cap),
                "fifty_two_week_high": round(fifty_two_high, 2),
                "fifty_two_week_low": round(fifty_two_low, 2),
                "currency": info.get("currency", "USD"),
                "exchange": info.get("exchange", "US"),
                "market_state": info.get("marketState", "CLOSED"),
                "fetch_time": time.strftime("%Y-%m-%d %H:%M:%S")
            }

            self._cache[ticker] = {"timestamp": now, "data": data}
            return data

        except Exception as e:
            logger.error(f"Error fetching quote for ticker {ticker}: {e}")
            return {
                "ticker": ticker,
                "name": ticker,
                "price": 0.0,
                "previous_close": 0.0,
                "change": 0.0,
                "change_percent": 0.0,
                "volume": 0,
                "volume_str": "N/A",
                "market_cap": None,
                "market_cap_str": "N/A",
                "fifty_two_week_high": 0.0,
                "fifty_two_week_low": 0.0,
                "error": str(e),
                "fetch_time": time.strftime("%Y-%m-%d %H:%M:%S")
            }

    def get_multiple_quotes(self, tickers: List[str]) -> List[Dict[str, Any]]:
        """Fetch quotes for a list of tickers."""
        return [self.get_stock_quote(t) for t in tickers]

    def get_historical_data(self, ticker: str, period: str = "6mo", interval: Optional[str] = None, force_refresh: bool = False) -> pd.DataFrame:
        """Fetch OHLC historical data as pandas DataFrame with custom period and interval."""
        ticker = ticker.strip().upper()
        
        # Determine appropriate interval based on period if not specified
        if not interval:
            if period in ["1d"]:
                interval = "5m"
            elif period in ["5d"]:
                interval = "15m"
            elif period in ["1mo"]:
                interval = "1d"
            else:
                interval = "1d"

        cache_key = f"{ticker}_{period}_{interval}"
        now = time.time()
        # Use a short 10s TTL for intraday, or cache_ttl for daily
        ttl = 10 if period in ["1d", "5d"] else self.cache_ttl

        if not force_refresh and cache_key in self._hist_cache:
            item = self._hist_cache[cache_key]
            if now - item["timestamp"] < ttl:
                return item["data"].copy()

        try:
            yt = yf.Ticker(ticker)
            df = yt.history(period=period, interval=interval)
            if not df.empty:
                # Clean dataframe: drop rows with missing or zero Close/Open prices
                df = df.dropna(subset=["Close", "Open", "High", "Low"])
                df = df[df["Close"] > 0]
                if not df.empty:
                    self._hist_cache[cache_key] = {"timestamp": now, "data": df}
            return df
        except Exception as e:
            logger.error(f"Error fetching historical data for {ticker}: {e}")
            return pd.DataFrame()

fetcher = StockDataFetcher()
