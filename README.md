# 📈 Stock Viewer — Professional Financial Terminal & Analysis Suite

A high-performance financial analytics workstation and automated market intelligence suite built with Python, FastAPI, and TradingView Lightweight Charts.

Designed for real-time equity tracking, multi-asset comparative analysis, institutional technical drawing tools, dynamic alert triggers, and automated cron-scheduled email reports.

---

## 🌟 Key Capabilities

- **Institutional Charting Engine**: Powered by TradingView Lightweight Charts with hardware-accelerated 60FPS canvas compositing, atomic `requestAnimationFrame` render gating, and frustum culling.
- **Multi-Tool Drawing Suite**:
  - Magnet Peak/Valley Snap (Auto-assist)
  - Trend Lines with delta price & percentage readout
  - Parallel Regression Channels (Support/Resistance/Midline)
  - Fibonacci Retracement (0.0% to 100.0% golden ratios)
  - Polyline / Elliott Wave (1, 2, 3, 4, 5+ impulse counting)
  - Glassmorphic Supply & Demand Zones (Translucent with boundary labels)
  - Delta Measurement Box (Price spread, %, bar count)
  - Single-Drawing Eraser Tool & Dynamic 6-Color Palette
  - Multi-step Undo/Redo stack (Ctrl+Z / Ctrl+Y)
- **Multi-Asset Compare Mode**: Overlay secondary benchmark assets (e.g., SPY, QQQ, NVDA) with real-time percentage return tracking.
- **Asset Fundamentals & KPI Overview**: Instant readouts for Last Close, 24h Change, Volume, Market Cap, 52-Week Range, RSI (14), SMA 20/50, and Trend Bias.
- **Automated Intelligence Scheduler**: Background daemon engine for scheduled daily or weekly email dispatching of PDF & HTML market reports.
- **Technical Analysis Pipeline**: Moving Averages (SMA/EMA), RSI (14), MACD, Volume Profile, and momentum metrics.
- **Dual Interface**:
  - Modern Web Dashboard with Obsidian Glassmorphism and responsive layout.
  - Interactive Rich CLI Terminal with live auto-refreshing tables and ANSI formatting.

---

## 🛠️ Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/<your-username>/<your-repo-name>.git
   cd stock-viewer
   ```

2. **Install Dependencies**:
   ```bash
   python -m pip install -r requirements.txt
   ```

3. *(Optional)* **Configure Email SMTP**:
   Copy `.env.example` to `.env` and enter your SMTP credentials for automated alerts and reports:
   ```env
   SMTP_SERVER=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=your_email@gmail.com
   SMTP_PASSWORD=your_app_password
   SENDER_EMAIL=your_email@gmail.com
   RECIPIENT_EMAIL=your_email@gmail.com
   ```

---

## 🚀 Quickstart

### 1. Launch Web Dashboard (Recommended)
```bash
python main.py web
```
Navigate to `http://localhost:8000` in your browser.

### 2. Launch Interactive Terminal CLI
```bash
python main.py cli
```

### 3. Generate Instant Market Report (PDF / HTML)
```bash
python main.py report
```

---

## 🧪 Running Automated Tests

Run the full pytest suite:
```bash
python -m pytest
```

---

## 📁 Project Structure

```
├── stock_tracker/
│   ├── config/          # Configuration loader and settings
│   ├── core/            # Market data pipeline, TA Engine, Alert Engine, Report Generator, Scheduler
│   ├── database/        # Storage manager for watchlists, alerts, and cron schedules
│   ├── cli/             # Interactive Rich terminal CLI
│   └── web/             # FastAPI REST endpoints, HTML templates, and static assets (CSS/JS)
├── tests/               # Automated unit & integration test suite
├── data/                # Data storage, cache, and report output directory
├── main.py              # Application entrypoint
├── requirements.txt     # Python dependencies
├── .env.example         # Environment template
├── .gitignore           # Git ignore rules
└── README.md            # Project documentation
```

---

## 📄 License
MIT License. Open source for traders, developers, and researchers.
