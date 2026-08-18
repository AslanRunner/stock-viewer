from typing import Dict, Any, List
import pandas as pd
import numpy as np

class TechnicalAnalysisEngine:
    """Computes technical indicators and trading signals from OHLC stock data."""

    @staticmethod
    def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
        """Applies technical indicators to historical dataframe."""
        if df.empty or "Close" not in df.columns:
            return df

        df = df.dropna(subset=["Close", "Open", "High", "Low"]).copy()
        if df.empty:
            return df
        
        # Simple Moving Averages (SMA)
        df["SMA_20"] = df["Close"].rolling(window=20).mean()
        df["SMA_50"] = df["Close"].rolling(window=50).mean()
        df["SMA_200"] = df["Close"].rolling(window=200).mean()

        # Exponential Moving Averages (EMA)
        df["EMA_12"] = df["Close"].ewm(span=12, adjust=False).mean()
        df["EMA_26"] = df["Close"].ewm(span=26, adjust=False).mean()

        # Relative Strength Index (RSI 14)
        delta = df["Close"].diff()
        gain = (delta.where(delta > 0, 0)).ewm(span=14, adjust=False).mean()
        loss = (-delta.where(delta < 0, 0)).ewm(span=14, adjust=False).mean()
        rs = gain / loss.replace(0, np.nan)
        df["RSI"] = 100 - (100 / (1 + rs))

        # MACD (12, 26, 9)
        df["MACD"] = df["EMA_12"] - df["EMA_26"]
        df["MACD_Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
        df["MACD_Hist"] = df["MACD"] - df["MACD_Signal"]

        # Bollinger Bands (20, 2)
        std_20 = df["Close"].rolling(window=20).std()
        df["BB_Upper"] = df["SMA_20"] + (std_20 * 2)
        df["BB_Lower"] = df["SMA_20"] - (std_20 * 2)

        return df

    @classmethod
    def get_analysis_summary(cls, df: pd.DataFrame) -> Dict[str, Any]:
        """Provides latest indicator values and trend signal interpretation."""
        if df.empty:
            return {"error": "Insufficient data"}

        df_ind = cls.compute_indicators(df)
        latest = df_ind.iloc[-1]

        close = float(latest["Close"])
        sma20 = float(latest.get("SMA_20")) if pd.notna(latest.get("SMA_20")) else None
        sma50 = float(latest.get("SMA_50")) if pd.notna(latest.get("SMA_50")) else None
        sma200 = float(latest.get("SMA_200")) if pd.notna(latest.get("SMA_200")) else None
        rsi = float(latest.get("RSI")) if pd.notna(latest.get("RSI")) else None
        macd = float(latest.get("MACD")) if pd.notna(latest.get("MACD")) else None
        macd_signal = float(latest.get("MACD_Signal")) if pd.notna(latest.get("MACD_Signal")) else None
        macd_hist = float(latest.get("MACD_Hist")) if pd.notna(latest.get("MACD_Hist")) else None

        # Determine RSI Condition
        rsi_status = "Neutral"
        if rsi is not None:
            if rsi >= 70:
                rsi_status = "Overbought (Bearish Risk)"
            elif rsi <= 30:
                rsi_status = "Oversold (Bullish Opportunity)"

        # Determine MACD Signal
        macd_status = "Neutral"
        if macd is not None and macd_signal is not None:
            if macd > macd_signal:
                macd_status = "Bullish (MACD > Signal)"
            else:
                macd_status = "Bearish (MACD < Signal)"

        # Determine Trend Bias
        trend = "Neutral"
        if sma20 and sma50:
            if close > sma20 and sma20 > sma50:
                trend = "Strong Bullish"
            elif close < sma20 and sma20 < sma50:
                trend = "Strong Bearish"
            elif close > sma20:
                trend = "Bullish"
            elif close < sma20:
                trend = "Bearish"

        return {
            "close_price": round(close, 2),
            "sma_20": round(sma20, 2) if sma20 else None,
            "sma_50": round(sma50, 2) if sma50 else None,
            "sma_200": round(sma200, 2) if sma200 else None,
            "rsi": round(rsi, 2) if rsi else None,
            "rsi_status": rsi_status,
            "macd": round(macd, 2) if macd else None,
            "macd_signal": round(macd_signal, 2) if macd_signal else None,
            "macd_hist": round(macd_hist, 2) if macd_hist else None,
            "macd_status": macd_status,
            "overall_trend": trend
        }

    @classmethod
    def get_chart_data(cls, df: pd.DataFrame) -> Dict[str, Any]:
        """Returns TradingView Lightweight Charts formatted series data."""
        if df.empty:
            return {}

        df_ind = cls.compute_indicators(df).reset_index()

        # Handle 'Datetime' or 'Date' or first column name from reset_index()
        date_col = "Datetime" if "Datetime" in df_ind.columns else ("Date" if "Date" in df_ind.columns else df_ind.columns[0])
        df_ind = df_ind.rename(columns={date_col: "Date"})

        candlesticks = []
        volume_series = []
        sma_20_series = []
        sma_50_series = []
        rsi_series = []
        macd_series = []
        macd_signal_series = []

        is_intraday = False
        if len(df_ind) > 0 and hasattr(df_ind["Date"].iloc[0], "hour"):
            # Check if timestamps have non-zero hours/minutes
            try:
                if df_ind["Date"].dt.hour.max() > 0 or df_ind["Date"].dt.minute.max() > 0:
                    is_intraday = True
            except Exception:
                pass

        for _, row in df_ind.iterrows():
            if pd.isna(row.get("Close")) or pd.isna(row.get("Open")) or pd.isna(row.get("High")) or pd.isna(row.get("Low")):
                continue

            dt = row["Date"]
            if is_intraday:
                time_val = int(dt.timestamp())
            else:
                time_val = dt.strftime("%Y-%m-%d")

            open_p = round(float(row["Open"]), 2)
            high_p = round(float(row["High"]), 2)
            low_p = round(float(row["Low"]), 2)
            close_p = round(float(row["Close"]), 2)
            vol = int(row["Volume"]) if pd.notna(row.get("Volume")) else 0

            candlesticks.append({
                "time": time_val,
                "open": open_p,
                "high": high_p,
                "low": low_p,
                "close": close_p
            })

            vol_color = "rgba(34, 197, 94, 0.4)" if close_p >= open_p else "rgba(239, 68, 68, 0.4)"
            volume_series.append({
                "time": time_val,
                "value": vol,
                "color": vol_color
            })

            if pd.notna(row.get("SMA_20")):
                sma_20_series.append({"time": time_val, "value": round(float(row["SMA_20"]), 2)})
            if pd.notna(row.get("SMA_50")):
                sma_50_series.append({"time": time_val, "value": round(float(row["SMA_50"]), 2)})
            if pd.notna(row.get("RSI")):
                rsi_series.append({"time": time_val, "value": round(float(row["RSI"]), 2)})
            if pd.notna(row.get("MACD")):
                macd_series.append({"time": time_val, "value": round(float(row["MACD"]), 2)})
            if pd.notna(row.get("MACD_Signal")):
                macd_signal_series.append({"time": time_val, "value": round(float(row["MACD_Signal"]), 2)})

        return {
            "candlesticks": candlesticks,
            "volume": volume_series,
            "sma_20": sma_20_series,
            "sma_50": sma_50_series,
            "rsi": rsi_series,
            "macd": macd_series,
            "macd_signal": macd_signal_series,
            "is_intraday": is_intraday
        }

ta_engine = TechnicalAnalysisEngine()
