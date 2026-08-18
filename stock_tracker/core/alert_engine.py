import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from typing import List, Dict, Any, Tuple, Optional
from stock_tracker.config import settings
from stock_tracker.database import storage
from stock_tracker.core.data_fetcher import fetcher
from stock_tracker.core.technical_analysis import ta_engine

logger = logging.getLogger(__name__)

class AlertEngine:
    """Evaluates configured alert conditions and triggers notifications."""

    def __init__(self):
        self.storage = storage

    def evaluate_rule(self, rule: Dict[str, Any], quote: Dict[str, Any], ta_summary: Dict[str, Any]) -> Tuple[bool, str]:
        """Checks if a single alert rule matches current market conditions."""
        condition = rule.get("condition")
        threshold = rule.get("threshold", 0.0)
        ticker = rule.get("ticker", "").upper()

        price = quote.get("price", 0.0)
        change_pct = quote.get("change_percent", 0.0)
        rsi = ta_summary.get("rsi")

        if condition == "price_above" and price >= threshold:
            return True, f"PRICE ALERT: {ticker} reached ${price:.2f} (Target: >= ${threshold:.2f})"
        
        elif condition == "price_below" and price <= threshold:
            return True, f"PRICE ALERT: {ticker} dropped to ${price:.2f} (Target: <= ${threshold:.2f})"

        elif condition == "change_above" and abs(change_pct) >= threshold:
            return True, f"VOLATILITY ALERT: {ticker} moved {change_pct:+.2f}% (Threshold: >= {threshold:.2f}%)"

        elif condition == "rsi_above" and rsi is not None and rsi >= threshold:
            return True, f"TECHNICAL ALERT: {ticker} RSI reached {rsi:.1f} (Overbought >= {threshold:.1f})"

        elif condition == "rsi_below" and rsi is not None and rsi <= threshold:
            return True, f"TECHNICAL ALERT: {ticker} RSI dropped to {rsi:.1f} (Oversold <= {threshold:.1f})"

        return False, ""

    def check_all_alerts(self) -> List[Dict[str, Any]]:
        """Evaluates all enabled user alerts against live stock data."""
        alerts = [a for a in self.storage.get_alerts() if a.get("enabled", True)]
        triggered = []

        for rule in alerts:
            ticker = rule.get("ticker")
            if not ticker:
                continue

            quote = fetcher.get_stock_quote(ticker)
            df = fetcher.get_historical_data(ticker, period="3mo")
            ta_summary = ta_engine.get_analysis_summary(df)

            is_triggered, msg = self.evaluate_rule(rule, quote, ta_summary)
            if is_triggered:
                alert_event = {
                    "rule_id": rule.get("id"),
                    "ticker": ticker,
                    "condition": rule.get("condition"),
                    "threshold": rule.get("threshold"),
                    "message": msg,
                    "price": quote.get("price")
                }
                triggered.append(alert_event)
                self.storage.log_alert(alert_event)
                logger.info(f"Triggered: {msg}")

        return triggered

    def send_email_notification(self, subject: str, body_text: str, body_html: str = "", recipient: Optional[str] = None) -> bool:
        """Sends SMTP email if configured in settings/environment variables."""
        target_email = recipient or settings.RECIPIENT_EMAIL
        if not (settings.SMTP_USERNAME and settings.SMTP_PASSWORD and target_email):
            logger.warning("SMTP configuration missing or no recipient. Email notification skipped.")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.SENDER_EMAIL or settings.SMTP_USERNAME
            msg["To"] = target_email

            msg.attach(MIMEText(body_text, "plain"))
            if body_html:
                msg.attach(MIMEText(body_html, "html"))

            with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.sendmail(msg["From"], [target_email], msg.as_string())
            
            logger.info(f"Email sent successfully to {target_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")
            return False

alert_engine = AlertEngine()
