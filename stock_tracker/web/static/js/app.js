let mainChart = null;
let priceSeries = null;
let currentPriceLine = null;
let volumeSeries = null;
let sma20Series = null;
let sma50Series = null;

let rsiChart = null;
let rsiSeries = null;

let currentAnalysisTicker = "AAPL";
let currentPeriod = "1y";
let currentChartType = "candlestick";
let currentTool = "pointer";
let isMagnetActive = true; // Default ON for smart peak/valley snapping

let rawChartData = null;
let userDrawings = [];

// Performance: O(1) lookup maps for crosshair & snap
let candleMap = new Map();
let volumeMap = new Map();
let candleList = []; // Chronologically sorted list for fast binary/index search

// Cached DOM refs for crosshair tooltip
let _tooltipEl = null;
let _tooltipDate = null;
let _tooltipClose = null;
let _tooltipOpen = null;
let _tooltipHigh = null;
let _tooltipLow = null;
let _tooltipVol = null;
let _readoutClose = null;
let _readoutOpen = null;
let _readoutHigh = null;
let _readoutLow = null;
let _readoutVolume = null;
let _readoutChange = null;

function cacheDomRefs() {
    _tooltipEl = document.getElementById("floatingTooltip");
    _tooltipDate = document.getElementById("tooltipDate");
    _tooltipClose = document.getElementById("tooltipClose");
    _tooltipOpen = document.getElementById("tooltipOpen");
    _tooltipHigh = document.getElementById("tooltipHigh");
    _tooltipLow = document.getElementById("tooltipLow");
    _tooltipVol = document.getElementById("tooltipVol");
    _readoutClose = document.getElementById("readoutClose");
    _readoutOpen = document.getElementById("readoutOpen");
    _readoutHigh = document.getElementById("readoutHigh");
    _readoutLow = document.getElementById("readoutLow");
    _readoutVolume = document.getElementById("readoutVolume");
    _readoutChange = document.getElementById("readoutChange");
}

let undoStack = [];
let redoStack = [];
let activeDrawing = null;
let activePolylinePoints = []; // For multi-step wave/polyline tool
let currentDrawingColor = "#f59e0b"; // Active drawing color from palette

let compareTicker = null;
let compareSeries = null;
let rawCompareChartData = null;

// Throttling frames
let crosshairRafId = null;
let drawingRafId = null;
let chartScrollRafId = null;

document.addEventListener("DOMContentLoaded", () => {
    cacheDomRefs();
    initTabs();
    initToolbar();
    initColorPalette();
    initCompareModal();
    initDrawingCanvas();
    initTickerSelector();
    initThemeToggle();
    loadWatchlist();
    loadAlerts();
    loadSchedules();

    // Initial chart load on page ready
    loadAnalysis(currentAnalysisTicker, currentPeriod);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
        if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
        if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); }
        if (e.key === "r" || e.key === "R") { e.preventDefault(); zoomReset(); }
        if (e.key === "Escape" || e.key === "Enter") {
            if (activePolylinePoints.length > 1) {
                finishPolyline();
            }
        }
    });

    // Auto-refresh every 5s without resetting zoom/pan
    setInterval(() => {
        loadWatchlist(true);
        if (currentPeriod === "1d" || currentPeriod === "5d") {
            loadAnalysis(currentAnalysisTicker, currentPeriod, true);
        }
    }, 5000);

    // Button event listeners
    document.getElementById("addTickerBtn").addEventListener("click", addTicker);
    document.getElementById("tickerInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") addTicker();
    });
    document.getElementById("createAlertBtn").addEventListener("click", createAlert);
    document.getElementById("evaluateAlertsBtn").addEventListener("click", evaluateAlerts);
    document.getElementById("generateReportBtn").addEventListener("click", generateReport);
    document.getElementById("clearDrawingsBtn").addEventListener("click", clearDrawings);
    document.getElementById("undoBtn").addEventListener("click", undoDrawing);
    document.getElementById("redoBtn").addEventListener("click", redoDrawing);

    // Zoom buttons
    document.getElementById("zoomInBtn").addEventListener("click", zoomIn);
    document.getElementById("zoomOutBtn").addEventListener("click", zoomOut);
    document.getElementById("zoomResetBtn").addEventListener("click", zoomReset);
});

// ═══ TICKER SELECTOR ═══
function initTickerSelector() {
    const select = document.getElementById("tickerSelect");
    const input = document.getElementById("tickerCustomInput");

    select.addEventListener("change", (e) => {
        const symbol = e.target.value;
        if (symbol) loadAnalysis(symbol, currentPeriod);
    });

    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const symbol = input.value.trim().toUpperCase();
            if (symbol) {
                loadAnalysis(symbol, currentPeriod);
                input.value = "";
            }
        }
    });
}

// ═══ THEME MANAGEMENT & MUTATION ═══
function getThemeOptions() {
    const isLight = document.body.classList.contains("light-theme");
    return {
        isLight,
        bgColor: isLight ? "#f5f5f0" : "#000000",
        textColor: isLight ? "#888888" : "#6b6b6b",
        gridColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255, 165, 0, 0.06)",
        borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255, 165, 0, 0.12)",
        crosshairColor: "#ff9800"
    };
}

function updateChartTheme() {
    const theme = getThemeOptions();
    if (mainChart) {
        mainChart.applyOptions({
            layout: {
                backgroundColor: theme.bgColor,
                textColor: theme.textColor
            },
            grid: {
                vertLines: { color: theme.gridColor },
                horzLines: { color: theme.gridColor }
            },
            rightPriceScale: {
                borderColor: theme.borderColor
            },
            timeScale: {
                borderColor: theme.borderColor
            }
        });
    }

    if (rsiChart) {
        rsiChart.applyOptions({
            layout: {
                backgroundColor: theme.bgColor,
                textColor: theme.textColor
            },
            grid: {
                vertLines: { color: theme.gridColor },
                horzLines: { color: theme.gridColor }
            }
        });
    }
}

function initThemeToggle() {
    const checkbox = document.getElementById("themeToggleCheckbox");
    checkbox.checked = document.body.classList.contains("dark-theme");
    
    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
        } else {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
        }
        updateChartTheme();
    });
}

// ═══ TAB SWITCHER ═══
function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const target = tab.getAttribute("data-tab");
            document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
            const activeSec = document.getElementById(`${target}-view`);
            if (activeSec) activeSec.classList.add("active");

            const isChart = (target === "analysis");
            const leftSidebar = document.querySelector(".left-toolbar");
            const footer = document.querySelector(".terminal-footer");
            const compareBtn = document.getElementById("compareBtn");
            const quickReportBtn = document.getElementById("quickReportBtn");

            if (leftSidebar) leftSidebar.style.display = isChart ? "flex" : "none";
            if (footer) footer.style.display = isChart ? "flex" : "none";
            if (compareBtn) compareBtn.style.display = isChart ? "inline-flex" : "none";
            if (quickReportBtn) quickReportBtn.style.display = isChart ? "inline-flex" : "none";

            if (isChart) {
                requestAnimationFrame(() => {
                    handleResize();
                    if (!rawChartData) {
                        loadAnalysis(currentAnalysisTicker, currentPeriod);
                    }
                });
            }
        });
    });
}

// ═══ COLOR PALETTE & COMPARE INIT ═══
function initColorPalette() {
    document.querySelectorAll(".color-dot").forEach(dot => {
        dot.addEventListener("click", () => {
            document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
            dot.classList.add("active");
            currentDrawingColor = dot.getAttribute("data-color") || "#f59e0b";
        });
    });
}

function initCompareModal() {
    const compareBtn = document.getElementById("compareBtn");
    const compareModal = document.getElementById("compareModal");
    const closeCompareModalBtn = document.getElementById("closeCompareModalBtn");
    const applyCompareBtn = document.getElementById("applyCompareBtn");
    const compareSymbolInput = document.getElementById("compareSymbolInput");

    if (compareBtn && compareModal) {
        compareBtn.addEventListener("click", () => {
            compareModal.style.display = "flex";
            if (compareSymbolInput) compareSymbolInput.focus();
        });
    }

    if (closeCompareModalBtn && compareModal) {
        closeCompareModalBtn.addEventListener("click", () => {
            compareModal.style.display = "none";
        });
    }

    if (applyCompareBtn && compareSymbolInput) {
        applyCompareBtn.addEventListener("click", () => {
            const sym = compareSymbolInput.value.trim().toUpperCase();
            if (sym) {
                setCompareTicker(sym);
                if (compareModal) compareModal.style.display = "none";
            }
        });
        compareSymbolInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                applyCompareBtn.click();
            }
        });
    }
}

// ═══ TOOLBAR INIT ═══
function initToolbar() {
    // Timeframe buttons
    document.querySelectorAll(".tf-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tf-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentPeriod = btn.getAttribute("data-period");
            loadAnalysis(currentAnalysisTicker, currentPeriod);
        });
    });

    // Chart style segmented control
    document.querySelectorAll(".type-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentChartType = btn.getAttribute("data-type");
            if (rawChartData && mainChart) {
                switchChartType(currentChartType);
            }
        });
    });

    // Indicator chips
    document.getElementById("toggleSma20").addEventListener("click", function() {
        this.classList.toggle("active");
        if (sma20Series) sma20Series.applyOptions({ visible: this.classList.contains("active") });
    });

    document.getElementById("toggleSma50").addEventListener("click", function() {
        this.classList.toggle("active");
        if (sma50Series) sma50Series.applyOptions({ visible: this.classList.contains("active") });
    });

    document.getElementById("toggleRsi").addEventListener("click", function() {
        this.classList.toggle("active");
        const rsiBox = document.getElementById("rsiContainer");
        const isActive = this.classList.contains("active");
        rsiBox.style.display = isActive ? "block" : "none";
        
        if (isActive && rawChartData && rawChartData.rsi) {
            initOrUpdateRsiChart(rawChartData);
        }
        handleResize();
    });

    // Set initial active state for magnet
    const magnetBtn = document.querySelector('.tool-icon-btn[data-tool="magnet"]');
    if (magnetBtn) {
        magnetBtn.classList.toggle("active", isMagnetActive);
    }

    // Left sidebar drawing tools
    document.querySelectorAll(".tool-icon-btn[data-tool]").forEach(btn => {
        btn.addEventListener("click", () => {
            const tool = btn.getAttribute("data-tool");
            
            if (tool === "magnet") {
                isMagnetActive = !isMagnetActive;
                btn.classList.toggle("active", isMagnetActive);
                return;
            }

            // Finish active polyline if switching tools
            if (activePolylinePoints.length > 1) {
                finishPolyline();
            } else {
                activePolylinePoints = [];
            }

            document.querySelectorAll(".tool-icon-btn[data-tool]").forEach(b => {
                if (b.getAttribute("data-tool") !== "magnet") b.classList.remove("active");
            });
            btn.classList.add("active");
            currentTool = tool;

            const canvas = document.getElementById("drawingCanvas");
            if (currentTool === "pointer") {
                canvas.classList.remove("drawing-active");
                canvas.style.pointerEvents = "none";
                canvas.style.cursor = "default";
                if (mainChart) {
                    mainChart.applyOptions({
                        crosshair: {
                            mode: LightweightCharts.CrosshairMode.Hidden,
                            vertLine: { visible: false, labelVisible: false },
                            horzLine: { visible: false, labelVisible: false }
                        }
                    });
                }
            } else if (currentTool === "crosshair") {
                canvas.classList.remove("drawing-active");
                canvas.style.pointerEvents = "none";
                canvas.style.cursor = "crosshair";
                if (mainChart) {
                    mainChart.applyOptions({
                        crosshair: {
                            mode: LightweightCharts.CrosshairMode.Normal,
                            vertLine: { visible: true, labelVisible: true },
                            horzLine: { visible: true, labelVisible: true }
                        }
                    });
                }
            } else if (currentTool === "eraser") {
                canvas.classList.add("drawing-active");
                canvas.style.pointerEvents = "auto";
                canvas.style.cursor = "pointer";
            } else {
                canvas.classList.add("drawing-active");
                canvas.style.pointerEvents = "auto";
                canvas.style.cursor = "crosshair";
            }
            scheduleRedraw();
        });
    });
}

// ═══ WATCHLIST ═══
async function loadWatchlist(silent = false) {
    try {
        const res = await fetch("/api/watchlist");
        const data = await res.json();
        renderWatchlistTable(data.quotes);
        updateStatusBadge(data.quotes);
    } catch (err) {
        if (!silent) console.error("Failed to load watchlist:", err);
    }
}

function updateStatusBadge(quotes) {
    if (!quotes || quotes.length === 0) return;
    const first = quotes[0];
    const badge = document.getElementById("marketBadge");
    const stateText = document.getElementById("marketStateText");
    
    if (stateText) stateText.textContent = first.exchange || "NYSE/NASDAQ";
    if (badge) {
        if (first.market_state === "REGULAR" || first.market_state === "OPEN") {
            badge.className = "status-badge live";
            badge.textContent = "● LIVE";
        } else {
            badge.className = "status-badge closed";
            badge.textContent = `● CLOSED (${first.market_state || 'CLOSED'})`;
        }
    }
}

function renderWatchlistTable(quotes) {
    const tbody = document.getElementById("watchlistBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!quotes || quotes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No tickers in watchlist. Add one above!</td></tr>`;
        return;
    }

    quotes.forEach(q => {
        const tr = document.createElement("tr");
        const isPos = q.change >= 0;
        const chgClass = isPos ? "green" : "red";
        const chgSign = isPos ? "+" : "";
        tr.innerHTML = `
            <td><strong style="color:var(--text-bold); font-size:0.88rem;">${q.ticker}</strong><br><small style="color:var(--text-muted); font-size:0.72rem;">${q.name || ''}</small></td>
            <td><strong style="color:var(--text-bold);">$${q.price.toFixed(2)}</strong></td>
            <td class="${chgClass}">${chgSign}$${q.change.toFixed(2)}</td>
            <td><span class="status-badge ${isPos ? 'live' : 'closed'}">${chgSign}${q.change_percent.toFixed(2)}%</span></td>
            <td style="color:var(--text-muted);">${q.volume_str}</td>
            <td style="color:var(--text-muted);">${q.market_cap_str}</td>
            <td style="color:var(--text-muted); font-size:0.75rem;">$${q.fifty_two_week_low.toFixed(2)} - $${q.fifty_two_week_high.toFixed(2)}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm" onclick="loadAnalysis('${q.ticker}', currentPeriod); switchTab('analysis');">Analyze</button>
                <button class="btn btn-sm" style="color:var(--red-down); border-color:var(--border-subtle);" onclick="removeTicker('${q.ticker}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addTicker() {
    const input = document.getElementById("tickerInput");
    const val = input.value.trim();
    if (!val) return;
    try {
        const res = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: val })
        });
        if (res.ok) { input.value = ""; loadWatchlist(); }
    } catch (err) { console.error("Failed to add ticker:", err); }
}

async function removeTicker(ticker) {
    try {
        const res = await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
        if (res.ok) loadWatchlist();
    } catch (err) { console.error("Failed to delete ticker:", err); }
}

function switchTab(tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.click();
}

// ═══ CHART ENGINE (SINGLETON & 60FPS OPTIMIZED) ═══

async function loadAnalysis(ticker, period = "1y", silent = false) {
    const isTickerChange = (currentAnalysisTicker !== ticker.toUpperCase());
    currentAnalysisTicker = ticker.toUpperCase();
    
    const select = document.getElementById("tickerSelect");
    if (select) {
        const opt = Array.from(select.options).find(o => o.value === currentAnalysisTicker);
        if (opt) select.value = currentAnalysisTicker;
    }

    try {
        const res = await fetch(`/api/analysis/${currentAnalysisTicker}?period=${period}`);
        if (!res.ok) {
            if (!silent) console.error("Analysis fetch failed:", res.status);
            return;
        }
        const data = await res.json();
        rawChartData = data.chart_data;
        updateHeaderReadout(data.quote);
        updatePrimaryAssetCard(data.quote, data.summary);
        renderLightweightChart(data.chart_data, silent && !isTickerChange);

        if (compareTicker) {
            loadCompareAnalysis(compareTicker, period);
        }
    } catch (err) {
        if (!silent) console.error("Failed to load analysis:", err);
    }
}

function updateHeaderReadout(quote) {
    if (!quote) return;
    if (_readoutOpen) _readoutOpen.textContent = quote.price ? (quote.price - (quote.change || 0)).toFixed(2) : '0.00';
    if (_readoutHigh) _readoutHigh.textContent = quote.fifty_two_week_high ? quote.fifty_two_week_high.toFixed(2) : quote.price.toFixed(2);
    if (_readoutLow) _readoutLow.textContent = quote.fifty_two_week_low ? quote.fifty_two_week_low.toFixed(2) : quote.price.toFixed(2);
    if (_readoutClose) _readoutClose.textContent = quote.price.toFixed(2);
    if (_readoutVolume) _readoutVolume.textContent = quote.volume_str || "0M";

    if (_readoutChange) {
        const isPos = quote.change >= 0;
        _readoutChange.className = isPos ? "green" : "red";
        _readoutChange.textContent = `${isPos ? '+' : ''}${quote.change.toFixed(2)} (${isPos ? '+' : ''}${quote.change_percent.toFixed(2)}%)`;
    }
}

function updatePrimaryAssetCard(quote, summary) {
    if (!quote) return;
    const tickerEl = document.getElementById("assetCardTicker");
    const nameEl = document.getElementById("assetCardName");
    const badgeEl = document.getElementById("assetCardTrendBadge");
    
    if (tickerEl) tickerEl.textContent = quote.ticker;
    if (nameEl) nameEl.textContent = quote.name || "";
    
    const closeEl = document.getElementById("kpiClosePrice");
    if (closeEl) closeEl.textContent = `$${quote.price.toFixed(2)}`;

    const chgEl = document.getElementById("kpiChange");
    if (chgEl) {
        const isPos = quote.change >= 0;
        chgEl.className = `kpi-val ${isPos ? 'green' : 'red'}`;
        chgEl.textContent = `${isPos ? '+' : ''}$${quote.change.toFixed(2)} (${isPos ? '+' : ''}${quote.change_percent.toFixed(2)}%)`;
    }

    const volEl = document.getElementById("kpiVolume");
    if (volEl) volEl.textContent = quote.volume_str || "0M";

    const capEl = document.getElementById("kpiMarketCap");
    if (capEl) capEl.textContent = quote.market_cap_str || "N/A";

    const w52El = document.getElementById("kpi52Week");
    if (w52El) w52El.textContent = `$${quote.fifty_two_week_low.toFixed(2)} - $${quote.fifty_two_week_high.toFixed(2)}`;

    if (summary) {
        const rsiEl = document.getElementById("kpiRsi");
        if (rsiEl) rsiEl.textContent = summary.rsi ? `${summary.rsi} (${(summary.rsi_status || '').split(' ')[0]})` : "N/A";

        const sma20El = document.getElementById("kpiSma20");
        if (sma20El) sma20El.textContent = summary.sma_20 ? `$${summary.sma_20}` : "N/A";

        const sma50El = document.getElementById("kpiSma50");
        if (sma50El) sma50El.textContent = summary.sma_50 ? `$${summary.sma_50}` : "N/A";

        if (badgeEl) {
            const trend = summary.overall_trend || "Neutral";
            badgeEl.textContent = trend.toUpperCase();
            if (trend.toLowerCase().includes("bullish")) {
                badgeEl.className = "trend-badge bullish";
            } else if (trend.toLowerCase().includes("bearish")) {
                badgeEl.className = "trend-badge bearish";
            } else {
                badgeEl.className = "trend-badge neutral";
            }
        }
    }
}

function updateSecondaryCompareCard(quote, summary) {
    const card = document.getElementById("secondaryCompareCard");
    if (!card) return;
    if (!quote) {
        card.style.display = "none";
        return;
    }
    card.style.display = "block";

    const tickerEl = document.getElementById("compCardTicker");
    const nameEl = document.getElementById("compCardName");
    const badgeEl = document.getElementById("compCardTrendBadge");
    
    if (tickerEl) tickerEl.textContent = quote.ticker;
    if (nameEl) nameEl.textContent = quote.name || "";
    
    const closeEl = document.getElementById("compKpiClosePrice");
    if (closeEl) closeEl.textContent = `$${quote.price.toFixed(2)}`;

    const chgEl = document.getElementById("compKpiChange");
    if (chgEl) {
        const isPos = quote.change >= 0;
        chgEl.className = `kpi-val ${isPos ? 'green' : 'red'}`;
        chgEl.textContent = `${isPos ? '+' : ''}$${quote.change.toFixed(2)} (${isPos ? '+' : ''}${quote.change_percent.toFixed(2)}%)`;
    }

    const volEl = document.getElementById("compKpiVolume");
    if (volEl) volEl.textContent = quote.volume_str || "0M";

    const capEl = document.getElementById("compKpiMarketCap");
    if (capEl) capEl.textContent = quote.market_cap_str || "N/A";

    const w52El = document.getElementById("compKpi52Week");
    if (w52El) w52El.textContent = `$${quote.fifty_two_week_low.toFixed(2)} - $${quote.fifty_two_week_high.toFixed(2)}`;

    if (summary) {
        const rsiEl = document.getElementById("compKpiRsi");
        if (rsiEl) rsiEl.textContent = summary.rsi ? `${summary.rsi} (${(summary.rsi_status || '').split(' ')[0]})` : "N/A";

        const sma20El = document.getElementById("compKpiSma20");
        if (sma20El) sma20El.textContent = summary.sma_20 ? `$${summary.sma_20}` : "N/A";

        const sma50El = document.getElementById("compKpiSma50");
        if (sma50El) sma50El.textContent = summary.sma_50 ? `$${summary.sma_50}` : "N/A";

        if (badgeEl) {
            const trend = summary.overall_trend || "Neutral";
            badgeEl.textContent = trend.toUpperCase();
            if (trend.toLowerCase().includes("bullish")) {
                badgeEl.className = "trend-badge bullish";
            } else if (trend.toLowerCase().includes("bearish")) {
                badgeEl.className = "trend-badge bearish";
            } else {
                badgeEl.className = "trend-badge neutral";
            }
        }
    }
}

async function setCompareTicker(ticker) {
    if (!ticker) return;
    compareTicker = ticker.toUpperCase();
    
    // Update active compare banner in modal
    const banner = document.getElementById("activeCompareBanner");
    const bannerTxt = document.getElementById("activeCompareTickerText");
    if (banner && bannerTxt) {
        banner.style.display = "block";
        bannerTxt.textContent = compareTicker;
    }

    // Update legend
    const legend = document.getElementById("chartCompareLegend");
    const legTxt = document.getElementById("compareLegendTickerText");
    if (legend && legTxt) {
        legend.style.display = "flex";
        legTxt.textContent = compareTicker;
    }

    await loadCompareAnalysis(compareTicker, currentPeriod);
}

function clearCompareTicker() {
    compareTicker = null;
    if (compareSeries && mainChart) {
        mainChart.removeSeries(compareSeries);
        compareSeries = null;
    }
    const banner = document.getElementById("activeCompareBanner");
    if (banner) banner.style.display = "none";
    const legend = document.getElementById("chartCompareLegend");
    if (legend) legend.style.display = "none";
    const card = document.getElementById("secondaryCompareCard");
    if (card) card.style.display = "none";
}

async function loadCompareAnalysis(ticker, period) {
    try {
        const res = await fetch(`/api/analysis/${ticker}?period=${period}`);
        if (!res.ok) return;
        const data = await res.json();
        rawCompareChartData = data.chart_data;

        // Update Compare Card
        updateSecondaryCompareCard(data.quote, data.summary);

        // Update Legend price
        const legPrice = document.getElementById("compareLegendPriceText");
        if (legPrice && data.quote) {
            legPrice.textContent = `$${data.quote.price.toFixed(2)}`;
        }

        // Plot on chart
        if (mainChart && data.chart_data && data.chart_data.candlesticks) {
            if (!compareSeries) {
                compareSeries = mainChart.addLineSeries({
                    color: '#06b6d4',
                    lineWidth: 2,
                    title: ticker,
                    priceScaleId: 'right'
                });
            }
            const lineData = data.chart_data.candlesticks.map(c => ({
                time: c.time,
                value: c.close
            }));
            compareSeries.setData(lineData);
        }
    } catch (e) {
        console.error("Failed to load compare analysis:", e);
    }
}

function initMainChart() {
    const container = document.getElementById("chartContainer");
    if (!container || typeof LightweightCharts === "undefined") return;

    const theme = getThemeOptions();
    const width = container.clientWidth || 900;
    const height = container.clientHeight || 420;

    container.innerHTML = "";

    mainChart = LightweightCharts.createChart(container, {
        width: width,
        height: height,
        layout: {
            backgroundColor: theme.bgColor,
            textColor: theme.textColor,
            fontFamily: "'Roboto Mono', monospace"
        },
        grid: {
            vertLines: { color: theme.gridColor },
            horzLines: { color: theme.gridColor }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: theme.crosshairColor, width: 1, style: LightweightCharts.LineStyle.Dashed },
            horzLine: { color: theme.crosshairColor, width: 1, style: LightweightCharts.LineStyle.Dashed }
        },
        rightPriceScale: {
            borderColor: theme.borderColor,
            scaleMargins: {
                top: 0.08,
                bottom: 0.22, // Keeps candlesticks safely in upper 78% of chart
            },
        },
        timeScale: {
            borderColor: theme.borderColor,
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 5,
            barSpacing: 8,
            minBarSpacing: 2,
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false,
        },
        handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
        },
    });

    createPriceSeries();

    // Volume histogram series in dedicated scale to prevent candlestick overlap
    volumeSeries = mainChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: {
            top: 0.82, // Strictly confines volume to bottom 18%
            bottom: 0,
        },
    });

    if (mainChart.priceScale('volume')) {
        mainChart.priceScale('volume').applyOptions({
            scaleMargins: {
                top: 0.82,
                bottom: 0,
            }
        });
    }

    // SMA overlays
    const sma20Active = document.getElementById("toggleSma20").classList.contains("active");
    sma20Series = mainChart.addLineSeries({
        color: '#ff9800',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'SMA 20',
        visible: sma20Active
    });

    const sma50Active = document.getElementById("toggleSma50").classList.contains("active");
    sma50Series = mainChart.addLineSeries({
        color: '#ab47bc',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'SMA 50',
        visible: sma50Active
    });

    // Optimization 1: Synchronize drawings on chart pan / scroll / zoom via single rAF gate
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRedraw);
    mainChart.timeScale().subscribeVisibleTimeRangeChange(scheduleRedraw);

    // Crosshair tooltip sync with requestAnimationFrame throttling
    mainChart.subscribeCrosshairMove(param => {
        if (crosshairRafId) cancelAnimationFrame(crosshairRafId);
        crosshairRafId = requestAnimationFrame(() => {
            if (!param || !param.time || !param.seriesPrices || !param.seriesPrices.get(priceSeries)) {
                if (_tooltipEl) _tooltipEl.style.display = "none";
                return;
            }
            const priceVal = param.seriesPrices.get(priceSeries);
            const candleItem = candleMap.get(param.time);
            const volItem = volumeMap.get(param.time);

            if (_tooltipEl) {
                _tooltipEl.style.display = "block";
                _tooltipDate.textContent = param.time;
                _tooltipClose.textContent = `$${typeof priceVal === 'number' ? priceVal.toFixed(2) : (priceVal.close || 0).toFixed(2)}`;
                if (candleItem) {
                    _tooltipOpen.textContent = `$${candleItem.open.toFixed(2)}`;
                    _tooltipHigh.textContent = `$${candleItem.high.toFixed(2)}`;
                    _tooltipLow.textContent = `$${candleItem.low.toFixed(2)}`;
                    if (_readoutClose) _readoutClose.textContent = candleItem.close.toFixed(2);
                    if (_readoutOpen) _readoutOpen.textContent = candleItem.open.toFixed(2);
                    if (_readoutHigh) _readoutHigh.textContent = candleItem.high.toFixed(2);
                    if (_readoutLow) _readoutLow.textContent = candleItem.low.toFixed(2);
                }
                if (volItem) {
                    const volStr = volItem.value >= 1e6 ? `${(volItem.value/1e6).toFixed(1)}M` : `${volItem.value}`;
                    _tooltipVol.textContent = volStr;
                    if (_readoutVolume) _readoutVolume.textContent = volStr;
                }
            }
        });
    });

    // Resize observer for responsive layout
    const resizeObserver = new ResizeObserver(() => {
        handleResize();
    });
    const stage = document.querySelector(".chart-stage");
    if (stage) resizeObserver.observe(stage);
}

function createPriceSeries() {
    if (!mainChart) return;
    if (priceSeries) {
        mainChart.removeSeries(priceSeries);
        priceSeries = null;
    }

    if (currentChartType === "candlestick") {
        priceSeries = mainChart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: true,
            borderColor: '#26a69a',
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
    } else if (currentChartType === "area") {
        priceSeries = mainChart.addAreaSeries({
            topColor: 'rgba(255, 152, 0, 0.25)',
            bottomColor: 'rgba(255, 152, 0, 0.0)',
            lineColor: '#ff9800',
            lineWidth: 2,
        });
    } else if (currentChartType === "line") {
        priceSeries = mainChart.addLineSeries({
            color: '#ff9800',
            lineWidth: 2,
        });
    }
}

function switchChartType(type) {
    currentChartType = type;
    createPriceSeries();
    if (rawChartData) {
        populateSeriesData(rawChartData, true);
    }
}

function populateSeriesData(chartData, preserveZoom = false) {
    if (!priceSeries) return;

    if (currentChartType === "candlestick") {
        priceSeries.setData(chartData.candlesticks || []);
    } else {
        priceSeries.setData((chartData.candlesticks || []).map(c => ({ time: c.time, value: c.close })));
    }

    // Price line
    if (currentPriceLine) {
        try { priceSeries.removePriceLine(currentPriceLine); } catch (e) {}
        currentPriceLine = null;
    }
    if (chartData.candlesticks && chartData.candlesticks.length > 0) {
        const lastCandle = chartData.candlesticks[chartData.candlesticks.length - 1];
        currentPriceLine = priceSeries.createPriceLine({
            price: lastCandle.close,
            color: '#26a69a',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: '',
        });
    }

    // Volume
    if (volumeSeries) {
        const volumeData = (chartData.volume || []).map(v => ({
            time: v.time,
            value: v.value,
            color: (v.color && (v.color.includes('239') || v.color.includes('68') || v.color.includes('244'))) ? 'rgba(239, 83, 80, 0.28)' : 'rgba(38, 166, 154, 0.28)'
        }));
        volumeSeries.setData(volumeData);
    }

    // SMAs
    if (sma20Series && chartData.sma_20) sma20Series.setData(chartData.sma_20);
    if (sma50Series && chartData.sma_50) sma50Series.setData(chartData.sma_50);

    // RSI
    initOrUpdateRsiChart(chartData);

    if (!preserveZoom && mainChart) {
        mainChart.timeScale().fitContent();
    }
}

// Optimization 3: Dual-chart synchronization with lock flag to prevent feedback loops
let isSyncing = false;

function syncCharts(sourceChart, targetChart) {
    if (!sourceChart || !targetChart) return;
    sourceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (isSyncing || !range) return;
        isSyncing = true;
        try {
            targetChart.timeScale().setVisibleLogicalRange(range);
        } catch (e) {}
        isSyncing = false;
    });
}

function initOrUpdateRsiChart(chartData) {
    const rsiBox = document.getElementById("rsiContainer");
    const rsiActive = document.getElementById("toggleRsi").classList.contains("active");
    if (!rsiBox || !rsiActive || !chartData.rsi || chartData.rsi.length === 0) return;

    const theme = getThemeOptions();
    const rsiW = rsiBox.clientWidth || 900;
    const rsiH = rsiBox.clientHeight || 110;

    if (!rsiChart) {
        rsiChart = LightweightCharts.createChart(rsiBox, {
            width: rsiW,
            height: rsiH,
            layout: { backgroundColor: theme.bgColor, textColor: theme.textColor },
            grid: { vertLines: { color: theme.gridColor }, horzLines: { color: theme.gridColor } },
            timeScale: { visible: false }
        });

        rsiSeries = rsiChart.addLineSeries({
            color: '#ff9800',
            lineWidth: 1.5,
            title: 'RSI 14'
        });

        if (mainChart) {
            syncCharts(mainChart, rsiChart);
            syncCharts(rsiChart, mainChart);
        }
    }

    if (rsiSeries) {
        rsiSeries.setData(chartData.rsi);
    }
}

function renderLightweightChart(chartData, isIncremental = false) {
    const container = document.getElementById("chartContainer");
    if (!container) return;

    if (typeof LightweightCharts === "undefined") {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--red-down);">Chart library loading...</div>`;
        return;
    }

    // Fast O(1) Map lookups & array sorting
    candleMap = new Map();
    volumeMap = new Map();
    candleList = (chartData.candlesticks || []).slice();
    candleList.forEach(c => candleMap.set(c.time, c));
    (chartData.volume || []).forEach(v => volumeMap.set(v.time, v));

    if (!mainChart) {
        initMainChart();
    }

    if (mainChart) {
        mainChart.applyOptions({
            timeScale: {
                timeVisible: chartData.is_intraday
            }
        });
    }

    populateSeriesData(chartData, isIncremental);
    resizeCanvas();
    redrawUserShapes();
}

function handleResize() {
    const container = document.getElementById("chartContainer");
    if (mainChart && container && container.clientWidth > 0) {
        mainChart.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight
        });
    }

    const rsiBox = document.getElementById("rsiContainer");
    if (rsiChart && rsiBox && rsiBox.clientWidth > 0) {
        rsiChart.applyOptions({
            width: rsiBox.clientWidth,
            height: rsiBox.clientHeight
        });
    }

    resizeCanvas();
}

// ═══ ZOOM CONTROLS ═══
function zoomIn() {
    if (!mainChart) return;
    const ts = mainChart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const halfSpan = (range.to - range.from) / 2 * 0.7;
    ts.setVisibleLogicalRange({ from: center - halfSpan, to: center + halfSpan });
}

function zoomOut() {
    if (!mainChart) return;
    const ts = mainChart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const halfSpan = (range.to - range.from) / 2 * 1.4;
    ts.setVisibleLogicalRange({ from: center - halfSpan, to: center + halfSpan });
}

function zoomReset() {
    if (!mainChart) return;
    mainChart.timeScale().fitContent();
}

// ═══ DYNAMIC CHART-TO-SCREEN COORDINATE MAPPING ═══
// Converts stored Price & Time/Logical index into current live pixel X and Y
function chartPointToScreen(point) {
    if (!point) return { x: 0, y: 0, price: 0 };
    if (!mainChart || !priceSeries) return { x: point.x, y: point.y, price: point.price, time: point.time };

    let screenX = null;
    let screenY = null;

    // 1. Time / Logical -> Screen X
    if (point.time !== undefined && point.time !== null) {
        screenX = mainChart.timeScale().timeToCoordinate(point.time);
    }
    if ((screenX === null || isNaN(screenX)) && point.logical !== undefined && point.logical !== null) {
        screenX = mainChart.timeScale().logicalToCoordinate(point.logical);
    }
    if (screenX === null || isNaN(screenX)) {
        screenX = point.x;
    }

    // 2. Price -> Screen Y
    if (point.price !== undefined && point.price !== null) {
        screenY = priceSeries.priceToCoordinate(point.price);
    }
    if (screenY === null || isNaN(screenY)) {
        screenY = point.y;
    }

    return {
        x: screenX,
        y: screenY,
        price: point.price,
        time: point.time,
        logical: point.logical
    };
}

// ═══ SMART MAGNET & PEAK/VALLEY SNAPPING ENGINE ═══
function findMagnetSnapPoint(rawX, rawY) {
    if (!mainChart || !priceSeries || candleList.length === 0) {
        const p = priceSeries ? priceSeries.coordinateToPrice(rawY) : 0;
        return { x: rawX, y: rawY, isSnapped: false, price: p, time: null, logical: null };
    }

    try {
        const timeScale = mainChart.timeScale();
        const logicalIndex = timeScale.coordinateToLogical(rawX);
        if (logicalIndex === null || isNaN(logicalIndex)) {
            const p = priceSeries.coordinateToPrice(rawY);
            return { x: rawX, y: rawY, isSnapped: false, price: p, time: null, logical: null };
        }

        const idx = Math.max(0, Math.min(candleList.length - 1, Math.round(logicalIndex)));
        const candle = candleList[idx];
        if (!candle) {
            const p = priceSeries.coordinateToPrice(rawY);
            return { x: rawX, y: rawY, isSnapped: false, price: p, time: null, logical: null };
        }

        const candleX = timeScale.logicalToCoordinate(idx);
        if (candleX === null || isNaN(candleX)) {
            const p = priceSeries.coordinateToPrice(rawY);
            return { x: rawX, y: rawY, isSnapped: false, price: p, time: null, logical: null };
        }

        // Calculate exact Y pixel coordinates for High (Peak), Low (Valley), Open, Close
        const highY = priceSeries.priceToCoordinate(candle.high);
        const lowY = priceSeries.priceToCoordinate(candle.low);
        const openY = priceSeries.priceToCoordinate(candle.open);
        const closeY = priceSeries.priceToCoordinate(candle.close);

        const candidates = [
            { y: highY, price: candle.high, type: "PEAK (High)" },
            { y: lowY, price: candle.low, type: "VALLEY (Low)" },
            { y: closeY, price: candle.close, type: "Close" },
            { y: openY, price: candle.open, type: "Open" }
        ].filter(c => c.y !== null && !isNaN(c.y));

        if (candidates.length === 0) {
            const p = priceSeries.coordinateToPrice(rawY);
            return { x: rawX, y: rawY, isSnapped: false, price: p, time: candle.time, logical: idx };
        }

        candidates.sort((a, b) => Math.abs(a.y - rawY) - Math.abs(b.y - rawY));
        const best = candidates[0];

        const distX = Math.abs(candleX - rawX);
        const distY = Math.abs(best.y - rawY);

        const maxSnapDist = isMagnetActive ? 65 : 24;

        if (distX < maxSnapDist && distY < maxSnapDist) {
            return {
                x: candleX,
                y: best.y,
                isSnapped: true,
                price: best.price,
                time: candle.time,
                logical: idx,
                type: best.type,
                candle: candle
            };
        }

        const fallbackPrice = priceSeries.coordinateToPrice(rawY);
        return {
            x: distX < 15 ? candleX : rawX,
            y: rawY,
            isSnapped: false,
            price: fallbackPrice,
            time: candle.time,
            logical: idx
        };
    } catch (e) {
        const p = priceSeries ? priceSeries.coordinateToPrice(rawY) : 0;
        return { x: rawX, y: rawY, isSnapped: false, price: p, time: null, logical: null };
    }
}

// ═══ GEOMETRIC HIT-TESTING FOR ERASER TOOL ═══
function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function findShapeAtScreenPoint(px, py, threshold = 14) {
    for (let i = userDrawings.length - 1; i >= 0; i--) {
        const item = userDrawings[i];
        if (isShapeHit(item, px, py, threshold)) {
            return i;
        }
    }
    return -1;
}

function isShapeHit(item, px, py, threshold) {
    if (!item) return false;
    if (item.type === "line" || item.type === "fib" || item.type === "channel") {
        const p1 = chartPointToScreen(item.p1);
        const p2 = chartPointToScreen(item.p2);
        if (distToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= threshold) return true;

        if (item.type === "channel") {
            const h = item.heightOffset || 40;
            if (distToSegment(px, py, p1.x, p1.y + h, p2.x, p2.y + h) <= threshold) return true;
        }
        if (item.type === "fib") {
            const dy = p2.y - p1.y;
            const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
            for (let lvl of levels) {
                const ly = p1.y + dy * lvl;
                if (Math.abs(py - ly) <= threshold) return true;
            }
        }
    } else if (item.type === "rectangle" || item.type === "measure") {
        const p1 = chartPointToScreen(item.p1);
        const p2 = chartPointToScreen(item.p2);
        const minX = Math.min(p1.x, p2.x) - threshold;
        const maxX = Math.max(p1.x, p2.x) + threshold;
        const minY = Math.min(p1.y, p2.y) - threshold;
        const maxY = Math.max(p1.y, p2.y) + threshold;
        if (px >= minX && px <= maxX && py >= minY && py <= maxY) return true;
    } else if (item.type === "polyline" || item.type === "pen") {
        const screenPts = (item.points || []).map(p => chartPointToScreen(p));
        for (let j = 0; j < screenPts.length - 1; j++) {
            if (distToSegment(px, py, screenPts[j].x, screenPts[j].y, screenPts[j + 1].x, screenPts[j + 1].y) <= threshold) {
                return true;
            }
        }
    } else if (item.type === "horizontal") {
        let y = item.y;
        if (priceSeries && item.price) {
            const cy = priceSeries.priceToCoordinate(item.price);
            if (cy !== null && !isNaN(cy)) y = cy;
        }
        if (Math.abs(py - y) <= threshold) return true;
    } else if (item.type === "text") {
        const p1 = chartPointToScreen(item);
        if (Math.hypot(px - p1.x, py - p1.y) <= threshold * 2) return true;
    }
    return false;
}

// ═══ DRAWING CANVAS (MULTI-TOOL & 60FPS COMPOSITING) ═══

let hoverSnapPoint = null;

function initDrawingCanvas() {
    const canvas = document.getElementById("drawingCanvas");
    const ctx = canvas.getContext("2d");

    let isDrawing = false;
    let startPoint = null;
    let currentDragPoint = null;

    canvas.addEventListener("mousedown", (e) => {
        if (currentTool === "pointer" || currentTool === "crosshair") return;
        const rect = canvas.getBoundingClientRect();
        const rawPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        // Eraser Tool handling
        if (currentTool === "eraser") {
            const hitIndex = findShapeAtScreenPoint(rawPoint.x, rawPoint.y);
            if (hitIndex !== -1) {
                userDrawings.splice(hitIndex, 1);
                redoStack = [];
                redrawUserShapes();
            }
            return;
        }

        const snap = findMagnetSnapPoint(rawPoint.x, rawPoint.y);
        const pt = {
            x: snap.x,
            y: snap.y,
            price: snap.price,
            time: snap.time,
            logical: snap.logical
        };

        // Polyline / Wave mode (multi-click)
        if (currentTool === "polyline") {
            activePolylinePoints.push(pt);
            redrawUserShapes();
            return;
        }

        // Single-click tools
        if (currentTool === "horizontal") {
            const price = snap.price || (priceSeries ? priceSeries.coordinateToPrice(pt.y) : 0);
            saveDrawing({
                type: "horizontal",
                price: price,
                y: snap.y,
                color: currentDrawingColor
            });
            return;
        }

        if (currentTool === "text") {
            const note = prompt("Enter Target / Note Annotation:", "Resistance Zone $");
            if (note) {
                const price = snap.price || (priceSeries ? priceSeries.coordinateToPrice(pt.y) : 0);
                saveDrawing({
                    type: "text",
                    price: price,
                    time: pt.time,
                    logical: pt.logical,
                    x: pt.x,
                    y: pt.y,
                    text: note,
                    color: currentDrawingColor
                });
            }
            return;
        }

        // Drag tools (line, measure, fib, channel, rectangle, pen)
        isDrawing = true;
        startPoint = pt;
        currentDragPoint = pt;

        if (currentTool === "pen") {
            activeDrawing = {
                type: "pen",
                points: [{
                    x: rawPoint.x,
                    y: rawPoint.y,
                    price: snap.price || (priceSeries ? priceSeries.coordinateToPrice(rawPoint.y) : 0),
                    time: snap.time,
                    logical: snap.logical
                }],
                color: currentDrawingColor
            };
        }
    });

    canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const rawPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const snap = findMagnetSnapPoint(rawPoint.x, rawPoint.y);
        hoverSnapPoint = snap;

        if (isDrawing) {
            currentDragPoint = {
                x: snap.x,
                y: snap.y,
                price: snap.price,
                time: snap.time,
                logical: snap.logical
            };
            if (currentTool === "pen" && activeDrawing) {
                activeDrawing.points.push({
                    x: rawPoint.x,
                    y: rawPoint.y,
                    price: snap.price || (priceSeries ? priceSeries.coordinateToPrice(rawPoint.y) : 0),
                    time: snap.time,
                    logical: snap.logical
                });
            }
        }

        if (!drawingRafId) {
            drawingRafId = requestAnimationFrame(() => {
                redrawUserShapes();

                // Live preview during drag
                if (isDrawing && startPoint && currentDragPoint) {
                    if (currentTool === "line") {
                        drawTrendLine(ctx, startPoint, currentDragPoint, currentDrawingColor, true);
                    } else if (currentTool === "channel") {
                        drawParallelChannel(ctx, startPoint, currentDragPoint, null, currentDrawingColor, true);
                    } else if (currentTool === "measure") {
                        drawMeasureBox(ctx, startPoint, currentDragPoint, true);
                    } else if (currentTool === "fib") {
                        drawFibRetracement(ctx, startPoint, currentDragPoint, currentDrawingColor, canvas.width, true);
                    } else if (currentTool === "rectangle") {
                        drawRectangleZone(ctx, startPoint, currentDragPoint, currentDrawingColor, true);
                    } else if (currentTool === "pen" && activeDrawing) {
                        const screenPoints = activeDrawing.points.map(p => chartPointToScreen(p));
                        drawFreehandPen(ctx, screenPoints, currentDrawingColor);
                    }
                }

                // Live polyline preview
                if (currentTool === "polyline" && activePolylinePoints.length > 0) {
                    const screenPoints = [...activePolylinePoints, { x: snap.x, y: snap.y, price: snap.price, time: snap.time, logical: snap.logical }].map(p => chartPointToScreen(p));
                    drawPolylineWave(ctx, screenPoints, currentDrawingColor, true);
                }

                // Magnet snap indicator
                if (snap.isSnapped && currentTool !== "eraser") {
                    drawMagnetIndicator(ctx, snap);
                }

                drawingRafId = null;
            });
        }
    });

    canvas.addEventListener("mouseup", (e) => {
        if (!isDrawing) return;
        isDrawing = false;
        const rect = canvas.getBoundingClientRect();
        const rawPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const snap = findMagnetSnapPoint(rawPoint.x, rawPoint.y);
        const endPoint = {
            x: snap.x,
            y: snap.y,
            price: snap.price,
            time: snap.time,
            logical: snap.logical
        };

        const dist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        if (dist < 4 && currentTool !== "pen") {
            redrawUserShapes();
            return;
        }

        if (currentTool === "line") {
            saveDrawing({ type: "line", p1: startPoint, p2: endPoint, color: currentDrawingColor });
        } else if (currentTool === "channel") {
            const priceOffset = Math.abs((startPoint.price || 100) * 0.035);
            saveDrawing({
                type: "channel",
                p1: startPoint,
                p2: endPoint,
                priceOffset: priceOffset,
                color: currentDrawingColor
            });
        } else if (currentTool === "measure") {
            saveDrawing({ type: "measure", p1: startPoint, p2: endPoint });
        } else if (currentTool === "fib") {
            saveDrawing({ type: "fib", p1: startPoint, p2: endPoint, color: currentDrawingColor });
        } else if (currentTool === "rectangle") {
            saveDrawing({ type: "rectangle", p1: startPoint, p2: endPoint, color: currentDrawingColor });
        } else if (currentTool === "pen" && activeDrawing) {
            saveDrawing(activeDrawing);
            activeDrawing = null;
        }
        redrawUserShapes();
    });

    // Double click to finish polyline
    canvas.addEventListener("dblclick", () => {
        if (currentTool === "polyline" && activePolylinePoints.length > 1) {
            finishPolyline();
        }
    });
}

function finishPolyline() {
    if (activePolylinePoints.length > 1) {
        saveDrawing({ type: "polyline", points: [...activePolylinePoints], color: currentDrawingColor });
    }
    activePolylinePoints = [];
    redrawUserShapes();
}

function saveDrawing(item) {
    item.color = item.color || currentDrawingColor;
    userDrawings.push(item);
    undoStack.push(item);
    redoStack = [];
    redrawUserShapes();
}

function undoDrawing() {
    if (userDrawings.length > 0) {
        redoStack.push(userDrawings.pop());
        redrawUserShapes();
    }
}

function redoDrawing() {
    if (redoStack.length > 0) {
        userDrawings.push(redoStack.pop());
        redrawUserShapes();
    }
}

// Optimization 5: HiDPI / Retina Screen Scaling with dimension-change check
function resizeCanvas() {
    const canvas = document.getElementById("drawingCanvas");
    const stage = document.querySelector(".chart-stage");
    if (!canvas || !stage) return;

    const dpr = window.devicePixelRatio || 1;
    const width = stage.clientWidth || 900;
    const height = stage.clientHeight || 420;

    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
    }
    scheduleRedraw();
}

function clearDrawings() {
    userDrawings = [];
    undoStack = [];
    redoStack = [];
    activeDrawing = null;
    activePolylinePoints = [];
    scheduleRedraw();
}

// Optimization 1: Atomic rAF render gate
let isRenderPending = false;

function scheduleRedraw() {
    if (!isRenderPending) {
        isRenderPending = true;
        requestAnimationFrame(() => {
            renderCanvasDrawings();
            isRenderPending = false;
        });
    }
}

// Alias for backward compatibility
function redrawUserShapes() {
    scheduleRedraw();
}

// Optimization 2: Frustum Culling (skip off-screen drawings)
function isShapeInVisibleRange(shape, logicalRange) {
    if (!logicalRange) return true;
    const margin = 10;
    const fromL = logicalRange.from - margin;
    const toL = logicalRange.to + margin;

    if (shape.type === "horizontal") return true;

    if (shape.p1 && shape.p2) {
        const l1 = shape.p1.logical;
        const l2 = shape.p2.logical;
        if (l1 !== null && l1 !== undefined && l2 !== null && l2 !== undefined) {
            const minL = Math.min(l1, l2);
            const maxL = Math.max(l1, l2);
            if (maxL < fromL || minL > toL) return false;
        }
    } else if (shape.points && shape.points.length > 0) {
        const logicals = shape.points.map(p => p.logical).filter(l => l !== null && l !== undefined);
        if (logicals.length > 0) {
            const minL = Math.min(...logicals);
            const maxL = Math.max(...logicals);
            if (maxL < fromL || minL > toL) return false;
        }
    }
    return true;
}

function renderCanvasDrawings() {
    const canvas = document.getElementById("drawingCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    // Clear logical coordinates based on unscaled CSS dimensions
    const stage = document.querySelector(".chart-stage");
    const width = stage ? stage.clientWidth : canvas.width;
    const height = stage ? stage.clientHeight : canvas.height;
    ctx.clearRect(0, 0, width, height);

    const logicalRange = mainChart ? mainChart.timeScale().getVisibleLogicalRange() : null;

    userDrawings.forEach(shape => {
        // Optimization 2: Frustum Culling
        if (!isShapeInVisibleRange(shape, logicalRange)) return;

        if (shape.type === "line") {
            const s1 = chartPointToScreen(shape.p1);
            const s2 = chartPointToScreen(shape.p2);
            drawTrendLine(ctx, s1, s2, shape.color);
        } else if (shape.type === "channel") {
            const s1 = chartPointToScreen(shape.p1);
            const s2 = chartPointToScreen(shape.p2);
            drawParallelChannel(ctx, s1, s2, shape.priceOffset, shape.color);
        } else if (shape.type === "polyline") {
            const screenPoints = shape.points.map(p => chartPointToScreen(p));
            drawPolylineWave(ctx, screenPoints, shape.color);
        } else if (shape.type === "measure") {
            const s1 = chartPointToScreen(shape.p1);
            const s2 = chartPointToScreen(shape.p2);
            drawMeasureBox(ctx, s1, s2);
        } else if (shape.type === "horizontal") {
            let y = shape.y;
            if (priceSeries && shape.price) {
                const cy = priceSeries.priceToCoordinate(shape.price);
                if (cy !== null && !isNaN(cy)) y = cy;
            }
            drawHorizontalLine(ctx, y, shape.color, width, shape.price);
        } else if (shape.type === "rectangle") {
            const s1 = chartPointToScreen(shape.p1);
            const s2 = chartPointToScreen(shape.p2);
            drawRectangleZone(ctx, s1, s2, shape.color);
        } else if (shape.type === "pen") {
            const screenPoints = shape.points.map(p => chartPointToScreen(p));
            drawFreehandPen(ctx, screenPoints, shape.color);
        } else if (shape.type === "text") {
            const s = chartPointToScreen(shape);
            drawTextAnnotation(ctx, s.x, s.y, shape.text, shape.color);
        } else if (shape.type === "fib") {
            const s1 = chartPointToScreen(shape.p1);
            const s2 = chartPointToScreen(shape.p2);
            drawFibRetracement(ctx, s1, s2, shape.color, width);
        }
    });

    if (activePolylinePoints.length > 0) {
        const screenPoints = activePolylinePoints.map(p => chartPointToScreen(p));
        drawPolylineWave(ctx, screenPoints, currentDrawingColor, true);
    }
}

// ═══ DISTINCT TOOL RENDERERS ═══

// 1. Magnet Snap Glowing Ring
function drawMagnetIndicator(ctx, snap) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(snap.x, snap.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ff9800";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Pulsing outer halo
    ctx.beginPath();
    ctx.arc(snap.x, snap.y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 152, 0, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.stroke();

    // Snap tag label
    if (snap.type) {
        ctx.font = "bold 10px Roboto Mono, monospace";
        ctx.fillStyle = "#ff9800";
        ctx.fillText(snap.type, snap.x + 12, snap.y - 4);
    }
    ctx.restore();
}

// 2. Trend Line (with Anchor Dots & Delta Badge)
function drawTrendLine(ctx, p1, p2, color, isPreview = false) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (isPreview) ctx.setLineDash([4, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Anchor points
    [p1, p2].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
    });

    // Angle & price badge
    const pr1 = p1.price || (priceSeries ? priceSeries.coordinateToPrice(p1.y) : null);
    const pr2 = p2.price || (priceSeries ? priceSeries.coordinateToPrice(p2.y) : null);
    if (pr1 && pr2) {
        const diff = pr2 - pr1;
        const pct = (diff / pr1) * 100;
        const sign = diff >= 0 ? "+" : "";
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2 - 10;
        
        ctx.font = "bold 10px Roboto Mono, monospace";
        ctx.fillStyle = diff >= 0 ? "#26a69a" : "#ef5350";
        ctx.fillText(`${sign}$${diff.toFixed(2)} (${sign}${pct.toFixed(1)}%)`, midX, midY);
    }
    ctx.restore();
}

// 3. Parallel Channel Tool
function drawParallelChannel(ctx, p1, p2, priceOffset, color, isPreview = false) {
    ctx.save();
    let heightOffset = 45;
    if (priceSeries && priceOffset && p1.price) {
        const lowerY = priceSeries.priceToCoordinate(p1.price - priceOffset);
        if (lowerY !== null && !isNaN(lowerY)) {
            heightOffset = Math.abs(lowerY - p1.y);
        }
    }
    
    // Top line (Resistance)
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bottom line (Support)
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y + heightOffset);
    ctx.lineTo(p2.x, p2.y + heightOffset);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Midline (Dashed)
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y + heightOffset / 2);
    ctx.lineTo(p2.x, p2.y + heightOffset / 2);
    ctx.strokeStyle = "rgba(255, 152, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Channel Fill
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2.x, p2.y + heightOffset);
    ctx.lineTo(p1.x, p1.y + heightOffset);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 152, 0, 0.08)";
    ctx.fill();
    ctx.restore();
}

// 4. Polyline / Elliott Wave Tool
function drawPolylineWave(ctx, points, color, isPreview = false) {
    if (!points || points.length < 1) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Wave point markers (1, 2, 3, 4, 5...)
    points.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#1e1e1e";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();

        ctx.fillStyle = "#ff9800";
        ctx.font = "bold 9px Roboto Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${idx + 1}`, p.x, p.y);
    });
    ctx.restore();
}

// 5. Measure Tool (Delta Price, %, Bars/Time Badge)
function drawMeasureBox(ctx, p1, p2, isPreview = false) {
    ctx.save();
    const left = Math.min(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);

    const pr1 = p1.price || (priceSeries ? priceSeries.coordinateToPrice(p1.y) : 0);
    const pr2 = p2.price || (priceSeries ? priceSeries.coordinateToPrice(p2.y) : 0);
    const isUp = (p2.y < p1.y); // Screen Y is inverted
    const diff = (pr2 && pr1) ? (pr2 - pr1) : 0;
    const pct = (pr1 && pr1 > 0) ? ((diff / pr1) * 100) : 0;
    const sign = diff >= 0 ? "+" : "";

    const barEstimate = Math.max(1, Math.round(width / 8));
    const boxColor = isUp ? "rgba(38, 166, 154, 0.15)" : "rgba(239, 83, 80, 0.15)";
    const strokeColor = isUp ? "#26a69a" : "#ef5350";

    // Measurement Box
    ctx.fillStyle = boxColor;
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]);

    // Center badge
    const badgeX = left + width / 2;
    const badgeY = top + height / 2;
    const text = `${sign}$${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%) • ${barEstimate} Bars`;

    ctx.font = "bold 11px Roboto Mono, monospace";
    const textMetrics = ctx.measureText(text);
    const pad = 6;
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(badgeX - textMetrics.width / 2 - pad, badgeY - 10 - pad, textMetrics.width + pad * 2, 20 + pad);
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(badgeX - textMetrics.width / 2 - pad, badgeY - 10 - pad, textMetrics.width + pad * 2, 20 + pad);

    ctx.fillStyle = strokeColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, badgeX, badgeY);
    ctx.restore();
}

// 6. Horizontal Price Level Line
function drawHorizontalLine(ctx, y, color, width, price) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price badge on right edge
    const pVal = price || (priceSeries ? priceSeries.coordinateToPrice(y) : null);
    if (pVal) {
        const text = `$${pVal.toFixed(2)}`;
        ctx.font = "bold 10px Roboto Mono, monospace";
        ctx.fillStyle = "#ff9800";
        ctx.fillRect(width - 65, y - 10, 60, 20);
        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, width - 35, y);
    }
    ctx.restore();
}

function colorWithAlpha(col, alpha = 0.12) {
    if (!col) return `rgba(245, 158, 11, ${alpha})`;
    if (col.startsWith("rgba")) return col;
    if (col.startsWith("rgb(")) {
        return col.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    }
    if (col.startsWith("#")) {
        let hex = col.slice(1);
        if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
        const num = parseInt(hex, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return col;
}

// 7. Supply / Demand Rectangle Zone
function drawRectangleZone(ctx, p1, p2, color, isPreview = false) {
    ctx.save();
    const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
    const w = Math.abs(p1.x - p2.x), h = Math.abs(p1.y - p2.y);
    
    // Glassmorphic translucent fill so candlesticks stay 100% visible underneath
    ctx.fillStyle = colorWithAlpha(color, 0.12);
    ctx.fillRect(x, y, w, h);
    
    // Clean dashed boundary border
    ctx.strokeStyle = color || "#ff9800";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Boundary price notes
    const prTop = Math.max(p1.price || 0, p2.price || 0) || (priceSeries ? priceSeries.coordinateToPrice(y) : 0);
    const prBottom = Math.min(p1.price || 0, p2.price || 0) || (priceSeries ? priceSeries.coordinateToPrice(y + h) : 0);
    if (prTop && prBottom) {
        ctx.font = "bold 9px Roboto Mono, monospace";
        ctx.fillStyle = color || "#ff9800";
        ctx.fillText(`Top: $${prTop.toFixed(2)}`, x + 6, y + 12);
        ctx.fillText(`Btm: $${prBottom.toFixed(2)}`, x + 6, y + h - 5);
    }
    ctx.restore();
}

// 8. Freehand Pen
function drawFreehandPen(ctx, points, color) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
}

// 9. Text Annotation Badge
function drawTextAnnotation(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = "bold 11px Roboto Mono, monospace";
    const pad = 6;
    const m = ctx.measureText(text);
    
    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Dark pill container
    ctx.fillStyle = "rgba(10, 10, 10, 0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(x + 8, y - 10, m.width + pad * 2, 20);
    ctx.strokeRect(x + 8, y - 10, m.width + pad * 2, 20);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x + 8 + pad, y + 4);
    ctx.restore();
}

// 10. Fibonacci Retracement Levels
function drawFibRetracement(ctx, p1, p2, color, width, isPreview = false) {
    ctx.save();
    const levels = [
        { lvl: 0, label: "0.0% ($HIGH)", bg: "rgba(255, 152, 0, 0.05)" },
        { lvl: 0.236, label: "23.6%", bg: "rgba(255, 152, 0, 0.08)" },
        { lvl: 0.382, label: "38.2%", bg: "rgba(255, 152, 0, 0.12)" },
        { lvl: 0.5, label: "50.0% (EQUIL)", bg: "rgba(38, 166, 154, 0.15)" },
        { lvl: 0.618, label: "61.8% (GOLDEN)", bg: "rgba(255, 152, 0, 0.18)" },
        { lvl: 0.786, label: "78.6%", bg: "rgba(255, 152, 0, 0.1)" },
        { lvl: 1.0, label: "100.0% ($LOW)", bg: "rgba(239, 83, 80, 0.08)" }
    ];
    const dy = p2.y - p1.y;
    ctx.font = "10px Roboto Mono, monospace";

    levels.forEach((item, idx) => {
        const ly = p1.y + dy * item.lvl;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(width, ly);
        ctx.strokeStyle = item.lvl === 0.5 || item.lvl === 0.618 ? "#ff9800" : "rgba(255, 152, 0, 0.4)";
        ctx.lineWidth = item.lvl === 0.5 || item.lvl === 0.618 ? 1.5 : 1;
        ctx.stroke();

        // Level text with price
        const pr = priceSeries ? priceSeries.coordinateToPrice(ly) : null;
        const prStr = pr ? ` ($${pr.toFixed(2)})` : "";
        ctx.fillStyle = item.lvl === 0.5 || item.lvl === 0.618 ? "#ff9800" : "rgba(255, 255, 255, 0.8)";
        ctx.fillText(`Fib ${item.label}${prStr}`, 12, ly - 4);
    });
    ctx.restore();
}

// ═══ ALERTS ═══
async function loadAlerts() {
    try {
        const res = await fetch("/api/alerts");
        const data = await res.json();
        renderAlertsList(data.alerts);
        renderAlertLogs(data.logs);
    } catch (err) { console.error("Failed to load alerts:", err); }
}

function renderAlertsList(alerts) {
    const tbody = document.getElementById("alertsBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!alerts || alerts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No alerts configured. Deploy one on the left!</td></tr>`;
        return;
    }
    alerts.forEach(a => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code style="font-family:var(--font-mono); color:var(--text-muted);">${a.id}</code></td>
            <td><strong style="color:var(--accent); font-size:0.88rem;">${a.ticker}</strong></td>
            <td><span style="font-size:0.78rem; color:var(--text-primary);">${a.condition}</span></td>
            <td><strong style="color:var(--text-bold); font-family:var(--font-mono);">${a.threshold}</strong></td>
            <td style="text-align:right;">
                <button class="btn btn-sm" style="color:var(--red-down); border-color:var(--border-subtle);" onclick="deleteAlert('${a.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAlertLogs(logs) {
    const container = document.getElementById("alertLogsList");
    if (!container) return;
    container.innerHTML = "";
    if (!logs || logs.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.75rem;">No triggered alert events recorded yet.</p>`;
        return;
    }
    logs.slice(-10).reverse().forEach(log => {
        const div = document.createElement("div");
        div.className = "log-entry";
        div.innerHTML = `
            <div class="log-time">${log.timestamp}</div>
            <div class="log-msg">${log.message}</div>
        `;
        container.appendChild(div);
    });
}

async function createAlert() {
    const ticker = document.getElementById("alertTickerInput").value.trim();
    const condition = document.getElementById("alertConditionSelect").value;
    const threshold = parseFloat(document.getElementById("alertThresholdInput").value);
    if (!ticker || isNaN(threshold)) return;
    try {
        const res = await fetch("/api/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker, condition, threshold })
        });
        if (res.ok) {
            document.getElementById("alertTickerInput").value = "";
            document.getElementById("alertThresholdInput").value = "";
            loadAlerts();
        }
    } catch (err) { console.error("Failed to create alert:", err); }
}

async function deleteAlert(id) {
    try {
        const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
        if (res.ok) loadAlerts();
    } catch (err) { console.error("Failed to delete alert:", err); }
}

async function evaluateAlerts() {
    try {
        const res = await fetch("/api/alerts/evaluate", { method: "POST" });
        const data = await res.json();
        alert(`Evaluated alerts! ${data.triggered_count} triggered.`);
        loadAlerts();
    } catch (err) { console.error("Failed to evaluate alerts:", err); }
}

// REPORTS 
async function generateReport() {
    const sendEmail = document.getElementById("sendEmailCheckbox") ? document.getElementById("sendEmailCheckbox").checked : false;
    const recipientInput = document.getElementById("reportRecipientInput");
    const recipient = recipientInput ? recipientInput.value.trim() : "";

    const btn = document.getElementById("generateReportBtn");
    btn.disabled = true;
    btn.textContent = "Generating...";
    try {
        let url = `/api/reports/generate?send_email=${sendEmail}`;
        if (recipient) {
            url += `&recipient=${encodeURIComponent(recipient)}`;
        }

        const res = await fetch(url, { method: "POST" });
        const data = await res.json();

        let emailBadge = "";
        if (sendEmail) {
            if (data.email_sent) {
                emailBadge = `<div style="margin-top:8px; font-size:0.85rem; color:var(--green-up);">📧 Email successfully sent to: <strong>${data.recipient}</strong></div>`;
            } else {
                emailBadge = `<div style="margin-top:8px; font-size:0.85rem; color:var(--red-down);">⚠️ Email could not be sent. Please check your SMTP settings in .env</div>`;
            }
        }

        document.getElementById("reportStatus").innerHTML = `
            <div style="padding:16px; border-left:4px solid var(--green-up); background:var(--bg-surface); border-radius:6px; margin-top:12px;">
                <div style="font-weight:700; color:var(--green-up);">✓ Reports Generated Successfully!</div>
                ${emailBadge}
                <div style="margin-top:12px;">
                    <a href="/reports/${data.pdf_filename}" target="_blank" class="btn-sm" style="background:var(--accent); color:#000; text-decoration:none; margin-right:8px; padding:6px 12px; font-weight:700;">Download PDF</a>
                    <a href="/reports/${data.html_filename}" target="_blank" class="btn-sm" style="text-decoration:none; padding:6px 12px;">View HTML</a>
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Failed to generate report:", err);
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate Now";
    }
}

// ═══ SCHEDULED REPORTS DISPATCHER ═══
async function loadSchedules() {
    try {
        const res = await fetch("/api/reports/schedules");
        const data = await res.json();
        renderSchedulesTable(data.schedules);
    } catch (err) {
        console.error("Failed to load schedules:", err);
    }
}

function toggleScheduleDaySelect() {
    const freq = document.getElementById("schedFrequencySelect").value;
    const dayRow = document.getElementById("schedDayRow");
    if (dayRow) {
        dayRow.style.display = (freq === "weekly") ? "flex" : "none";
    }
}

async function createSchedule() {
    const frequency = document.getElementById("schedFrequencySelect").value;
    const time = document.getElementById("schedTimeInput").value.trim();
    const recipient = document.getElementById("schedRecipientInput").value.trim();
    const day_of_week = (frequency === "weekly") ? document.getElementById("schedDaySelect").value : null;

    if (!time || !recipient) return;

    try {
        const res = await fetch("/api/reports/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frequency, time, recipient, day_of_week })
        });
        if (res.ok) {
            document.getElementById("schedRecipientInput").value = "";
            loadSchedules();
            alert("✓ Automated report schedule deployed successfully!");
        }
    } catch (err) {
        console.error("Failed to create schedule:", err);
    }
}

async function deleteSchedule(id) {
    try {
        const res = await fetch(`/api/reports/schedules/${id}`, { method: "DELETE" });
        if (res.ok) loadSchedules();
    } catch (err) {
        console.error("Failed to delete schedule:", err);
    }
}

async function testRunSchedule(id) {
    try {
        const res = await fetch(`/api/reports/schedules/${id}/run`, { method: "POST" });
        const data = await res.json();
        alert(`Schedule dispatched! Email status: ${data.email_sent ? 'Sent successfully' : 'Dispatched (Check SMTP in .env)'}`);
        loadSchedules();
    } catch (err) {
        console.error("Failed to test schedule:", err);
    }
}

function renderSchedulesTable(schedules) {
    const tbody = document.getElementById("schedulesBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!schedules || schedules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No automated schedules configured. Set one up on the left!</td></tr>`;
        return;
    }

    schedules.forEach(s => {
        const tr = document.createElement("tr");
        const freqLabel = s.frequency === "weekly" ? `Weekly (${(s.day_of_week || 'Mon').toUpperCase()})` : "Daily";
        tr.innerHTML = `
            <td><code>${s.id}</code></td>
            <td><span class="status-badge live">${freqLabel}</span></td>
            <td><strong style="color:var(--text-bold); font-family:var(--font-mono); font-size:0.88rem;">${s.time}</strong></td>
            <td><strong style="color:var(--accent); font-family:var(--font-mono);">${s.recipient}</strong></td>
            <td style="color:var(--text-muted); font-size:0.75rem;">${s.last_run || 'Not run yet'}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm" onclick="testRunSchedule('${s.id}')">Test Now</button>
                <button class="btn btn-sm" style="color:var(--red-down); border-color:var(--border-subtle);" onclick="deleteSchedule('${s.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
