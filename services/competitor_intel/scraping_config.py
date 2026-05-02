"""
Loader for `scraping_rules.yml` — the central config for all scrapers.

Usage:
    from .scraping_config import load_rules, nav_delay, between_brands_delay

    rules = load_rules("xhs")
    await asyncio.sleep(nav_delay("xhs"))

Design notes:
  - One file, one read at import time. Scrapers call these helpers anywhere
    they'd previously have hardcoded a sleep or a selector.
  - If the YAML is missing or malformed, we FAIL LOUDLY. Silent fallback to
    old hardcoded values would mean "did the rate-limit actually apply?" is
    ambiguous — that ambiguity is what got us banned.
  - Rate-limit helpers return floats (seconds) already-jittered, so callers
    can just `await asyncio.sleep(nav_delay('xhs'))` without repeating the
    random.uniform boilerplate.
"""

from __future__ import annotations

import logging
import random
import socket
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

logger = logging.getLogger(__name__)

_RULES_PATH = Path(__file__).parent / "scraping_rules.yml"


class ScrapingRulesError(RuntimeError):
    """Raised when scraping_rules.yml is missing, unparseable, or missing a platform."""


@lru_cache(maxsize=1)
def _load_all() -> Dict[str, Any]:
    if not _RULES_PATH.exists():
        raise ScrapingRulesError(
            f"scraping_rules.yml not found at {_RULES_PATH}. "
            "This file is required — see Phase C of the plan."
        )
    try:
        with _RULES_PATH.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ScrapingRulesError(f"scraping_rules.yml is not valid YAML: {e}") from e
    if not isinstance(data, dict):
        raise ScrapingRulesError("scraping_rules.yml must parse to a dict at top level")
    return data


def load_rules(platform: str) -> Dict[str, Any]:
    """Return the whole rules dict for one platform."""
    all_rules = _load_all()
    if platform not in all_rules:
        raise ScrapingRulesError(
            f"No rules for platform '{platform}' in scraping_rules.yml. "
            f"Available: {list(all_rules.keys())}"
        )
    return all_rules[platform]


def _rate_limit(platform: str) -> Dict[str, Any]:
    return load_rules(platform).get("rate_limit", {})


def _jittered(range_value: Any, default_lo: float, default_hi: float) -> float:
    """Accept a [lo, hi] list or a single number; return a uniformly-jittered float."""
    if isinstance(range_value, (list, tuple)) and len(range_value) == 2:
        lo, hi = float(range_value[0]), float(range_value[1])
    elif isinstance(range_value, (int, float)):
        return float(range_value)
    else:
        lo, hi = default_lo, default_hi
    return random.uniform(lo, hi)


# ─── Rate-limit helpers (all return seconds, already jittered) ────────────────

def nav_delay(platform: str) -> float:
    """Delay between page.goto() calls within one brand scrape."""
    return _jittered(_rate_limit(platform).get("nav_delay_seconds"), 7.0, 13.0)


def between_brands_delay(platform: str) -> float:
    """Delay between finishing brand N and starting brand N+1."""
    return _jittered(_rate_limit(platform).get("between_brands_seconds"), 300.0, 900.0)


def cooldown_duration(platform: str) -> float:
    """Long idle cooldown triggered after cooldown_after_n_brands."""
    return _jittered(_rate_limit(platform).get("cooldown_duration_seconds"), 3600.0, 7200.0)


def cooldown_after_n_brands(platform: str) -> int:
    return int(_rate_limit(platform).get("cooldown_after_n_brands", 5))


def max_navs_per_brand(platform: str) -> int:
    return int(_rate_limit(platform).get("max_navs_per_brand", 6))


def max_scrapes_per_account_per_day(platform: str) -> int:
    return int(_rate_limit(platform).get("max_scrapes_per_account_per_day", 10))


def active_hours_local(platform: str) -> Tuple[int, int]:
    hours = _rate_limit(platform).get("active_hours_local", [9, 23])
    return int(hours[0]), int(hours[1])


def forbidden_ip_hostname_substrings(platform: str) -> List[str]:
    return list(_rate_limit(platform).get("forbidden_ip_hostname_substrings") or [])


# ─── Safety checks ────────────────────────────────────────────────────────────

def assert_not_on_datacenter_ip(platform: str) -> None:
    """
    Raise ScrapingRulesError if current host's reverse DNS matches any
    forbidden substring for this platform. Call at scraper startup so we
    never accidentally scrape XHS/Douyin from ECS.
    """
    forbidden = forbidden_ip_hostname_substrings(platform)
    if not forbidden:
        return
    try:
        hostname = socket.gethostname()
        # Also try the outbound-facing name if different
        try:
            fqdn = socket.getfqdn()
        except Exception:
            fqdn = hostname
        combined = f"{hostname} {fqdn}".lower()
    except Exception:
        logger.warning("Could not resolve hostname for datacenter-IP check")
        return
    for sub in forbidden:
        if sub.lower() in combined:
            raise ScrapingRulesError(
                f"Refusing to scrape {platform} from datacenter host "
                f"(hostname='{hostname}', fqdn='{fqdn}'). "
                f"Forbidden substring match: '{sub}'. "
                f"Run this from a residential machine (e.g. your Mac)."
            )


def auth_wall_markers(platform: str) -> Tuple[str, ...]:
    return tuple(load_rules(platform).get("auth_wall_markers", []))


# ─── Debug ────────────────────────────────────────────────────────────────────

def dump_summary(platform: str) -> str:
    r = _rate_limit(platform)
    return (
        f"[{platform}] rate-limit summary: "
        f"nav={r.get('nav_delay_seconds')}s, "
        f"between_brands={r.get('between_brands_seconds')}s, "
        f"cooldown_every_n={r.get('cooldown_after_n_brands')}, "
        f"cooldown_duration={r.get('cooldown_duration_seconds')}s, "
        f"daily_cap={r.get('max_scrapes_per_account_per_day')}, "
        f"active_hours={r.get('active_hours_local')}"
    )


if __name__ == "__main__":
    # Quick smoke test: `python -m services.competitor_intel.scraping_config`
    for platform in ("xhs", "douyin", "sycm"):
        print(dump_summary(platform))
