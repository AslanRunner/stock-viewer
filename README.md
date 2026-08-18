# Stock Viewer — Financial Terminal & Market Intelligence Suite

<div align="center">

![Python Version](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat-square&logo=fastapi)
![TradingView Lightweight Charts](https://img.shields.io/badge/TradingView-Lightweight_Charts_v4-131722?style=flat-square&logo=tradingview)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Build](https://img.shields.io/badge/tests-8%20passed-brightgreen?style=flat-square)

**A high-performance financial analytics workstation, institutional charting canvas, and automated market intelligence engine built with Python, FastAPI, and TradingView Lightweight Charts.**

[Overview](#overview) • [Core Capabilities](#core-capabilities) • [Installation](#installation--setup) • [Quickstart](#quickstart) • [Architecture](#architecture) • [Testing](#running-tests) • [License](#license)

</div>

---

## Overview

Stock Viewer is a full-stack financial analytics workstation designed for real-time equity tracking, multi-asset comparative analysis, institutional technical drawing tools, dynamic alert triggers, and automated cron-scheduled email reports.

The platform combines a modern, hardware-accelerated web interface with an interactive terminal CLI, providing institutional-grade charting performance and automated portfolio intelligence.

---

## Core Capabilities

### 1. Interactive Technical Charting Engine
* **60 FPS Hardware Acceleration:** Rendered via TradingView Lightweight Charts with atomic `requestAnimationFrame` render gating, Frustum Culling (skipping off-screen objects), and HiDPI Retina pixel scaling.
* **Magnetic Wick Snapping:** Automatically aligns drawing anchor points to exact candlestick High or Low wicks.
* **Technical Drawing Tools:**
  * **Trend Lines:** Peak-to-valley support/resistance vectors with live delta price and percentage change indicators.
  * **Parallel Regression Channels:** Upper resistance, lower support, and dashed equilibrium midlines.
  * **Fibonacci Retracements:** Standard golden ratio retracement levels (`0.0%`, `23.6%`, `38.2%`, `50.0%`, `61.8%`, `78.6%`, `100.0%`).
  * **Elliott Wave / Polylines:** Multi-point impulse wave structure counting (`1`, `2`, `3`, `4`, `5`).
  * **Supply and Demand Zones:** Translucent boundary boxes (`12%` alpha) with price level tags that preserve candlestick visibility.
  * **Measurement Ruler:** Calculates price spread, percentage variance, and bar interval counts.
  * **Single-Item Eraser:** Targeted deletion of individual drawing shapes without clearing the canvas.
  * **Color Palette:** Six color tiers (Amber, Emerald, Coral, Electric Blue, Purple, White) for visual separation of analysis layers.
  * **Undo / Redo Stack:** Multi-step history management via keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`).

### 2. Multi-Asset Comparison Mode
* Overlays secondary benchmark instruments (e.g., `SPY`, `QQQ`, `NVDA`, `MSFT`) as normalized percentage return curves on top of the primary chart.
* Provides side-by-side fundamental metric comparisons.

### 3. Automated Alert Engine
* Real-time trigger evaluation across configured portfolios:
  * Price target breakouts (`price_above`)
  * Stop-loss triggers (`price_below`)
  * Volatility and percentage momentum spikes (`change_above`)
  * RSI overbought conditions (`rsi_above > 70`)
  * RSI oversold conditions (`rsi_below < 30`)
* Dispatches SMTP email notifications and logs real-time audit entries in the console.

### 4. Scheduled Report Dispatcher
* Background daemon thread for scheduled automated market briefings:
  * **Frequencies:** Daily or Weekly (selectable day of the week).
  * **Execution Time:** Precise local time dispatching (`HH:MM`).
  * **Format Support:** Generates structured PDF documents and responsive HTML briefing summaries.
  * **On-Demand Generation:** Instant manual report compilation and export.

### 5. Asset Fundamentals and Technical Metrics
* Real-time metrics panel positioned beneath the chart:
  * Last Close Price and 24-Hour Net / Percentage Change
  * Trading Volume and Market Capitalization
  * 52-Week High / Low Range Bar
  * RSI (14) Momentum Indicator
  * 20-Day and 50-Day Simple Moving Averages (SMA 20, SMA 50)
  * Overall Trend Classification (`BULLISH`, `BEARISH`, `NEUTRAL`)

---

## Installation & Setup

### Prerequisites
* Python 3.10 or higher
* Git

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/stock-viewer.git
cd stock-viewer
```

### 2. Install Dependencies
```bash
python -m pip install -r requirements.txt
```

### 3. Configure Environment Variables (Optional)
Copy `.env.example` to `.env` and provide your SMTP credentials for email alerts and automated reports:
```bash
cp .env.example .env
```
```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SENDER_EMAIL=your_email@gmail.com
RECIPIENT_EMAIL=your_email@gmail.com
CACHE_EXPIRY_SECONDS=300
```

---

## Quickstart

### 1. Launch Web Dashboard
```bash
python main.py web
```
Open `http://localhost:8000` in your web browser.

### 2. Launch Interactive Terminal CLI
```bash
python main.py cli
```

### 3. Compile Market Report
```bash
python main.py report
```
Generates PDF and HTML report files inside the `data/reports/` directory.

---

## Architecture

```
stock-viewer/
├── stock_tracker/
│   ├── config/
│   │   └── settings.py            # Environment settings loader
│   ├── database/
│   │   └── storage.py             # Persistent JSON storage layer
│   ├── core/
│   │   ├── data_fetcher.py        # Market data retrieval and caching
│   │   ├── technical_analysis.py  # Mathematical indicator algorithms
│   │   ├── alert_engine.py        # Alert trigger evaluation and email dispatcher
│   │   ├── report_generator.py    # PDF and HTML report compiler
│   │   └── scheduler.py           # Background cron job scheduler
│   ├── cli/ 
│   │   └── interface.py           # Rich terminal interactive dashboard
│   └── web/
│       ├── app.py                 # FastAPI application and REST endpoints
│       ├── templates/
│       │   └── index.html         # Single-page application interface
│       └── static/
│           ├── css/style.css      # Institutional design system and typography
│           └── js/app.js          # Charting, drawing tools, and API client
├── tests/
│   ├── test_data_fetcher.py       # Data pipeline unit tests
│   ├── test_technical_analysis.py # Indicator math unit tests
│   ├── test_alert_engine.py       # Alert evaluation unit tests
│   └── test_scheduler.py          # Cron scheduler unit tests
├── data/
│   ├── stock_data.json            # Application data store
│   └── reports/                   # Generated briefing documents
├── main.py                        # Application entrypoint
├── requirements.txt               # Python dependency manifest
├── .env.example                   # Environment configuration template
├── .gitignore                     # Version control ignore rules
└── README.md                      # Project documentation
```

---

## Running Tests

Execute the automated test suite with `pytest`:
```bash
python -m pytest
```


