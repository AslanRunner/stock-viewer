import pytest
from stock_tracker.core.data_fetcher import fetcher, StockDataFetcher

def test_format_large_number():
    assert fetcher.format_large_number(4010000000000) == "$4.01T"
    assert fetcher.format_large_number(1620000000) == "$1.62B"
    assert fetcher.format_large_number(28600000) == "$28.6M"
    assert fetcher.format_large_number(500) == "$500.00"
    assert fetcher.format_large_number(None) == "N/A"

def test_get_stock_quote_shape():
    quote = fetcher.get_stock_quote("AAPL")
    assert "ticker" in quote
    assert quote["ticker"] == "AAPL"
    assert "price" in quote
    assert "change" in quote
    assert "change_percent" in quote
    assert "volume_str" in quote
    assert "market_cap_str" in quote
