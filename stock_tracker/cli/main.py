import sys
import time
from typing import List, Optional
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich.text import Text
from rich.layout import Layout
from rich import print as rprint

from stock_tracker.config import settings
from stock_tracker.database import storage
from stock_tracker.core.data_fetcher import fetcher
from stock_tracker.core.technical_analysis import ta_engine
from stock_tracker.core.alert_engine import alert_engine
from stock_tracker.core.report_generator import report_gen

console = Console()

class StockTrackerCLI:
    """Rich interactive terminal interface for Stock Market Tracker."""

    def __init__(self):
        self.storage = storage

    def print_banner(self):
        banner = Panel.fit(
            f"[bold cyan]{settings.APP_NAME}[/bold cyan] [dim]v{settings.VERSION}[/dim]\n"
            "[italic gold1]Real-time Market Tracker, Technical Analysis & Alert Engine[/italic gold1]",
            border_style="bright_blue"
        )
        console.print(banner)

    def display_watchlist_table(self, tickers: Optional[List[str]] = None):
        """Displays main stock tracker table with colorful formatting."""
        if tickers is None:
            tickers = self.storage.get_watchlist()

        if not tickers:
            console.print("[bold yellow]Watchlist is empty! Add stock tickers to start tracking.[/bold yellow]")
            return

        with console.status("[bold green]Fetching live market data from Yahoo Finance...[/bold green]"):
            quotes = fetcher.get_multiple_quotes(tickers)

        table = Table(
            title=f"📈 Stock Market Watchlist ({time.strftime('%Y-%m-%d %H:%M:%S EST')})",
            title_style="bold blue",
            header_style="bold magenta",
            show_lines=True
        )

        table.add_column("Ticker", style="bold cyan", justify="center")
        table.add_column("Price", justify="right")
        table.add_column("Change ($)", justify="right")
        table.add_column("Change (%)", justify="right")
        table.add_column("Volume", justify="right")
        table.add_column("Market Cap", justify="right")
        table.add_column("52-Week Range", justify="center")

        for q in quotes:
            if "error" in q and q.get("price") == 0.0:
                table.add_row(
                    q["ticker"], "N/A", "N/A", "N/A", "N/A", "N/A", f"[red]{q['error']}[/red]"
                )
                continue

            change = q["change"]
            change_pct = q["change_percent"]
            price_str = f"${q['price']:.2f}"
            
            if change >= 0:
                chg_str = f"[bold green]+${change:.2f}[/bold green]"
                chg_pct_str = f"[bold green]+{change_pct:.2f}%[/bold green]"
            else:
                chg_str = f"[bold red]-${abs(change):.2f}[/bold red]"
                chg_pct_str = f"[bold red]{change_pct:.2f}%[/bold red]"

            range_str = f"${q['fifty_two_week_low']:.2f} - ${q['fifty_two_week_high']:.2f}"

            table.add_row(
                q["ticker"],
                price_str,
                chg_str,
                chg_pct_str,
                q["volume_str"],
                q["market_cap_str"],
                range_str
            )

        console.print(table)

    def display_technical_analysis(self, ticker: str):
        """Displays technical indicator metrics (SMA, RSI, MACD) for a ticker."""
        ticker = ticker.strip().upper()
        console.print(f"\n[bold yellow]Analyzing technical indicators for {ticker}...[/bold yellow]")
        
        with console.status("[bold green]Calculating SMA, RSI & MACD...[/bold green]"):
            quote = fetcher.get_stock_quote(ticker)
            df = fetcher.get_historical_data(ticker, period="6mo")
            ta = ta_engine.get_analysis_summary(df)

        if "error" in ta:
            console.print(f"[bold red]Failed to get technical analysis: {ta['error']}[/bold red]")
            return

        panel_content = f"""
[bold cyan]Stock:[/bold cyan] {quote['ticker']} - {quote['name']}
[bold cyan]Current Price:[/bold cyan] ${quote['price']:.2f} ({quote['change_percent']:+.2f}%)
--------------------------------------------------
[bold green]Moving Averages:[/bold green]
  • SMA 20:  ${ta['sma_20'] if ta['sma_20'] else 'N/A'}
  • SMA 50:  ${ta['sma_50'] if ta['sma_50'] else 'N/A'}
  • SMA 200: ${ta['sma_200'] if ta['sma_200'] else 'N/A'}

[bold green]Oscillators:[/bold green]
  • RSI (14):     {ta['rsi'] if ta['rsi'] else 'N/A'} -> [bold yellow]{ta['rsi_status']}[/bold yellow]
  • MACD Line:   {ta['macd'] if ta['macd'] else 'N/A'}
  • MACD Signal: {ta['macd_signal'] if ta['macd_signal'] else 'N/A'}
  • MACD Status: [bold yellow]{ta['macd_status']}[/bold yellow]

--------------------------------------------------
[bold magenta]Overall Trend Bias:[/bold magenta] [bold highlight]{ta['overall_trend']}[/bold highlight]
"""
        console.print(Panel(panel_content, title=f"📊 Technical Breakdown: {ticker}", border_style="cyan"))

    def manage_alerts(self):
        """Submenu for alert management."""
        while True:
            console.print("\n[bold cyan]=== Alert Rules Manager ===[/bold cyan]")
            alerts = self.storage.get_alerts()
            if not alerts:
                console.print("[yellow]No alert rules configured.[/yellow]")
            else:
                table = Table(show_lines=True)
                table.add_column("ID", justify="center")
                table.add_column("Ticker", justify="center")
                table.add_column("Condition", justify="center")
                table.add_column("Threshold", justify="right")
                table.add_column("Status", justify="center")

                for a in alerts:
                    table.add_row(
                        a["id"],
                        a["ticker"],
                        a["condition"],
                        f"{a['threshold']:.2f}",
                        "[green]Enabled[/green]" if a.get("enabled", True) else "[red]Disabled[/red]"
                    )
                console.print(table)

            console.print("\nOptions: [1] Add Alert  [2] Delete Alert  [3] Test Evaluate Alerts  [4] Back")
            choice = Prompt.ask("Select option", choices=["1", "2", "3", "4"], default="4")

            if choice == "1":
                ticker = Prompt.ask("Enter ticker symbol (e.g. AAPL)").upper()
                cond = Prompt.ask("Select condition", choices=["price_above", "price_below", "change_above", "rsi_above", "rsi_below"])
                thresh = float(Prompt.ask("Enter numeric threshold"))
                self.storage.add_alert(ticker, cond, thresh)
                console.print(f"[bold green]Alert created for {ticker}![/bold green]")
            elif choice == "2":
                aid = Prompt.ask("Enter Alert ID to delete")
                if self.storage.delete_alert(aid):
                    console.print(f"[bold green]Alert ID {aid} deleted.[/bold green]")
                else:
                    console.print("[bold red]Alert ID not found.[/bold red]")
            elif choice == "3":
                with console.status("[bold green]Evaluating all alert rules against live market data...[/bold green]"):
                    triggered = alert_engine.check_all_alerts()
                if triggered:
                    console.print(f"\n[bold red]🚨 {len(triggered)} Alert(s) Triggered![/bold red]")
                    for t in triggered:
                        console.print(f"  • {t['message']}")
                else:
                    console.print("\n[bold green]No alert thresholds crossed at this time.[/bold green]")
            elif choice == "4":
                break

    def generate_report_menu(self):
        """Generates stock report."""
        tickers = self.storage.get_watchlist()
        with console.status("[bold green]Generating Market Report...[/bold green]"):
            res = report_gen.generate_report(tickers)

        console.print(f"\n[bold green][OK] Reports generated successfully![/bold green]")
        console.print(f"HTML Report: [cyan]{res['html_filepath']}[/cyan]")
        console.print(f"PDF Report:  [cyan]{res['pdf_filepath']}[/cyan]")
        
        console.print("\n" + res["text"])

        if Confirm.ask("Would you like to send this report via email?"):
            if alert_engine.send_email_notification(
                subject=f"Market Analysis Report - {res['report_time']}",
                body_text=res["text"],
                body_html=res["html"]
            ):
                console.print("[bold green]Email sent successfully![/bold green]")
            else:
                console.print("[bold yellow]Email not sent. Check your SMTP settings in .env[/bold yellow]")

    def run(self):
        """Main interactive terminal loop."""
        self.print_banner()

        while True:
            console.print("\n[bold cyan]=== Main Menu ===[/bold cyan]")
            console.print("  [1] 📈 Track Watchlist (Real-time Prices)")
            console.print("  [2] 📊 Detailed Technical Analysis (SMA, RSI, MACD)")
            console.print("  [3] ➕ Add Ticker to Watchlist")
            console.print("  [4] ➖ Remove Ticker from Watchlist")
            console.print("  [5] 🚨 Manage Price & Technical Alerts")
            console.print("  [6] 📄 Generate Market Summary Report")
            console.print("  [7] 🔄 Auto-Refresh Watchlist Mode")
            console.print("  [8] ❌ Exit")

            choice = Prompt.ask("Select option", choices=["1", "2", "3", "4", "5", "6", "7", "8"], default="1")

            if choice == "1":
                self.display_watchlist_table()
            elif choice == "2":
                symbol = Prompt.ask("Enter stock ticker symbol (e.g. AAPL, NVDA, TSLA)").upper()
                self.display_technical_analysis(symbol)
            elif choice == "3":
                syms = Prompt.ask("Enter stock ticker(s) separated by comma (e.g. AAPL, META, RKLB)")
                for s in syms.split(","):
                    if s.strip():
                        self.storage.add_ticker(s)
                console.print("[bold green]Tickers added to watchlist![/bold green]")
                self.display_watchlist_table()
            elif choice == "4":
                sym = Prompt.ask("Enter ticker symbol to remove").upper()
                self.storage.remove_ticker(sym)
                console.print(f"[bold yellow]{sym} removed from watchlist.[/bold yellow]")
            elif choice == "5":
                self.manage_alerts()
            elif choice == "6":
                self.generate_report_menu()
            elif choice == "7":
                interval = int(Prompt.ask("Refresh interval in seconds", default="10"))
                console.print(f"[bold green]Starting Live Auto-Refresh Mode (Press Ctrl+C to exit)[/bold green]")
                try:
                    while True:
                        console.clear()
                        self.print_banner()
                        self.display_watchlist_table()
                        time.sleep(interval)
                except KeyboardInterrupt:
                    console.print("\n[yellow]Exited auto-refresh mode.[/yellow]")
            elif choice == "8":
                console.print("[bold cyan]Thank you for using Stock Market Tracker![/bold cyan]")
                sys.exit(0)

def main():
    cli = StockTrackerCLI()
    cli.run()

if __name__ == "__main__":
    main()
