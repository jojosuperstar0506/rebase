"""A5 — XHS cookie freshness monitor.

Runs daily (typically scheduled before the main pipeline). Calls the XHS
Apify actor with a known-safe query; if the response shows login-wall
markers OR comes back empty, the burner cookie has expired or been flagged.
On detection, alerts via Resend email (if configured) and marks the platform
connection as expired so the daily pipeline skips XHS until the cookie is
refreshed.

Usage (manual):
    APIFY_API_TOKEN=apify_api_xxx \\
    XHS_SESSION_COOKIE='web_session=...' \\
        python -m services.competitor_intel.scrapers.cookie_monitor

Cron (suggested — runs before the 2am HK pipeline):
    30 1 * * *  cd ~/rebase && python -m services.competitor_intel.scrapers.cookie_monitor

Exit codes:
    0 — cookie OK, results came back
    1 — login-wall detected or empty results (cookie likely expired)
    2 — config error (missing env vars, apify-client not installed)

When the cron fires and the cookie is stale, refresh procedure:
    1. Open XHS in a browser, log in with the burner account
    2. Cookie-Editor extension → copy the `web_session` cookie value
    3. Update XHS_SESSION_COOKIE in backend/.env on the server
    4. Restart the cron (or wait for next scheduled run)
"""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger(__name__)

KNOWN_GOOD_QUERY = "穿搭"  # "outfit" — high-volume, low-flag-risk search term
EXPECTED_MIN_RESULTS = 3   # below this, treat as suspect


def _send_alert_email(subject: str, body: str) -> None:
    """Send a Resend email if RESEND_API_KEY is configured.

    Falls back to a log warning if Resend isn't set up — never crashes
    the monitor on alert delivery failure.
    """
    resend_key = os.environ.get("RESEND_API_KEY")
    notify_to = os.environ.get("NOTIFICATION_EMAIL")
    if not resend_key or not notify_to:
        logger.warning(
            "ALERT (no Resend configured): %s\n%s\n"
            "Set RESEND_API_KEY + NOTIFICATION_EMAIL to receive these as email.",
            subject, body,
        )
        return

    try:
        import httpx
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
            json={
                "from": "Rebase Monitor <noreply@rebase-lac.vercel.app>",
                "to": [notify_to],
                "subject": subject,
                "text": body,
            },
            timeout=10,
        )
        if resp.status_code >= 300:
            logger.warning("Resend returned %d: %s", resp.status_code, resp.text[:300])
        else:
            logger.info("Cookie-expiry alert sent to %s", notify_to)
    except Exception as exc:
        logger.warning("Resend email failed (%s) — alert logged below:\n%s\n%s",
                       exc, subject, body)


def _mark_xhs_connection_expired() -> None:
    """Mark the XHS connection as expired in the DB so the daily pipeline skips it."""
    try:
        from ..db_bridge import mark_connection_expired
        mark_connection_expired("xhs")
        logger.info("Marked xhs connection as expired in DB")
    except Exception as exc:
        logger.warning("Could not mark xhs connection expired (%s) — DB unreachable?", exc)


def check_xhs_cookie() -> int:
    """Run the freshness check. Returns process exit code."""
    token = os.environ.get("APIFY_API_TOKEN")
    cookie = os.environ.get("XHS_SESSION_COOKIE")

    if not token:
        logger.error("APIFY_API_TOKEN env var not set")
        return 2
    if not cookie:
        logger.error("XHS_SESSION_COOKIE env var not set — nothing to check")
        return 2

    try:
        from .apify_client import ApifyScraperClient, ApifyScrapeError, _LOGIN_WALL_MARKERS
    except ImportError as exc:
        logger.error("apify_client import failed: %s — run: pip install -r services/competitor_intel/requirements.txt", exc)
        return 2

    client = ApifyScraperClient(apify_token=token, xhs_cookie=cookie, max_retries=2)

    logger.info("Running freshness check: search query=%r", KNOWN_GOOD_QUERY)
    try:
        # Call the actor directly via _call_actor (not scrape_xhs_brand, which
        # does the full search+profile dance — we only need search for a heartbeat)
        items = client._call_actor(
            actor_id="zhorex/rednote-xiaohongshu-scraper",
            actor_input={
                "mode": "search",
                "searchQuery": KNOWN_GOOD_QUERY,
                "maxResults": 5,
                "cookieString": cookie,
            },
            mode_label="cookie-monitor",
            brand="(monitor)",
        )
    except ApifyScrapeError as exc:
        logger.error("Cookie check failed with ApifyScrapeError: %s", exc)
        _send_alert_email(
            "🔴 Rebase XHS cookie expired",
            f"The XHS burner cookie failed the daily health check.\n\n"
            f"Error: {exc}\n\n"
            f"Refresh procedure:\n"
            f"  1. Log into XHS with burner in browser\n"
            f"  2. Cookie-Editor → copy 'web_session' value\n"
            f"  3. Update XHS_SESSION_COOKIE in backend/.env\n",
        )
        _mark_xhs_connection_expired()
        return 1
    except Exception as exc:
        logger.exception("Cookie check failed with unexpected error: %s", exc)
        return 1

    # Heuristic 1: empty results
    if not items:
        logger.warning("Cookie check returned 0 items for known-good query — likely flagged")
        _send_alert_email(
            "🟡 Rebase XHS cookie suspect (empty results)",
            f"Query {KNOWN_GOOD_QUERY!r} returned 0 items. Burner may be soft-banned.\n"
            f"Refresh the cookie as a first step; if results stay empty after refresh, "
            f"the burner account may need rotation.",
        )
        _mark_xhs_connection_expired()
        return 1

    # Heuristic 2: login-wall content in results
    text_blob = " ".join(
        str(v) for item in items if isinstance(item, dict)
        for v in item.values() if isinstance(v, str)
    )[:5000]
    if any(marker in text_blob for marker in _LOGIN_WALL_MARKERS):
        logger.warning("Login-wall markers detected in result body")
        _send_alert_email(
            "🔴 Rebase XHS cookie expired (login wall)",
            f"Login-wall content detected in response body. Cookie likely expired.\n"
            f"Refresh per backend/.env procedure.",
        )
        _mark_xhs_connection_expired()
        return 1

    # Heuristic 3: suspiciously few results
    if len(items) < EXPECTED_MIN_RESULTS:
        logger.warning("Only %d items returned (expected ≥%d) — investigate",
                       len(items), EXPECTED_MIN_RESULTS)
        # Don't alert/expire on this alone — could be transient. Log and continue.

    logger.info("✓ Cookie OK — %d items returned for %r", len(items), KNOWN_GOOD_QUERY)
    return 0


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    sys.exit(check_xhs_cookie())
