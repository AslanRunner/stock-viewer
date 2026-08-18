import pytest
from stock_tracker.core.alert_engine import alert_engine

def test_evaluate_price_above_rule():
    rule = {"ticker": "AAPL", "condition": "price_above", "threshold": 200.0}
    quote = {"ticker": "AAPL", "price": 220.0, "change_percent": 1.5}
    ta_summary = {"rsi": 55.0}

    triggered, msg = alert_engine.evaluate_rule(rule, quote, ta_summary)
    assert triggered is True
    assert "PRICE ALERT" in msg

def test_evaluate_rsi_below_rule():
    rule = {"ticker": "META", "condition": "rsi_below", "threshold": 30.0}
    quote = {"ticker": "META", "price": 500.0, "change_percent": -2.0}
    ta_summary = {"rsi": 25.0}

    triggered, msg = alert_engine.evaluate_rule(rule, quote, ta_summary)
    assert triggered is True
    assert "Oversold" in msg
