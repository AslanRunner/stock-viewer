import pytest
import pandas as pd
import numpy as np
from stock_tracker.core.technical_analysis import ta_engine

def test_compute_indicators():
    # Create sample synthetic stock data
    dates = pd.date_range("2026-01-01", periods=100)
    prices = np.linspace(100, 200, 100)
    df = pd.DataFrame({
        "Date": dates,
        "Open": prices - 1,
        "High": prices + 2,
        "Low": prices - 2,
        "Close": prices,
        "Volume": 1000000
    }).set_index("Date")

    df_ind = ta_engine.compute_indicators(df)
    assert "SMA_20" in df_ind.columns
    assert "SMA_50" in df_ind.columns
    assert "RSI" in df_ind.columns
    assert "MACD" in df_ind.columns
    assert "MACD_Signal" in df_ind.columns

    # Verify RSI is within [0, 100]
    rsi_vals = df_ind["RSI"].dropna()
    assert (rsi_vals >= 0).all() and (rsi_vals <= 100).all()

def test_get_analysis_summary():
    dates = pd.date_range("2026-01-01", periods=60)
    prices = [100 + i * 0.5 for i in range(60)]
    df = pd.DataFrame({
        "Close": prices,
        "Open": prices,
        "High": prices,
        "Low": prices,
        "Volume": 1000
    }, index=dates)

    summary = ta_engine.get_analysis_summary(df)
    assert "close_price" in summary
    assert "rsi" in summary
    assert "macd" in summary
    assert "overall_trend" in summary
    assert summary["overall_trend"].endswith("Bullish")
