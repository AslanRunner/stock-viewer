import sys
import argparse
from stock_tracker.cli.main import main as cli_main
from stock_tracker.web.app import start_server
from stock_tracker.database import storage
from stock_tracker.core.report_generator import report_gen

def run_cli():
    cli_main()

def run_web(host: str = "127.0.0.1", port: int = 8000):
    print(f"🚀 Starting Stock Market Analysis Web Dashboard on http://{host}:{port}")
    start_server(host=host, port=port)

def run_report():
    tickers = storage.get_watchlist()
    print("Generating stock market analysis report...")
    res = report_gen.generate_report(tickers)
    print(f"[OK] HTML Report: {res['html_filepath']}")
    print(f"[OK] PDF Report:  {res['pdf_filepath']}")
    print("\n" + res["text"])

def main():
    parser = argparse.ArgumentParser(description="Stock Market Analysis & Alert System")
    parser.add_argument("mode", nargs="?", default="cli", choices=["cli", "web", "report"],
                        help="Run mode: 'cli' (Interactive Terminal), 'web' (FastAPI Web App), 'report' (Generate Report)")
    parser.add_argument("--host", default="127.0.0.1", help="Host address for web server")
    parser.add_argument("--port", type=int, default=8000, help="Port number for web server")

    args = parser.parse_args()

    if args.mode == "web":
        run_web(host=args.host, port=args.port)
    elif args.mode == "report":
        run_report()
    else:
        run_cli()

if __name__ == "__main__":
    main()
