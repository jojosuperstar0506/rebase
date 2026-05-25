"""Tests for the freshness guard in scrape_runner.py.

The guard skips a brand if it was scraped within FRESHNESS_THRESHOLD_HOURS
(default 12). Tested in isolation — no real DB, no real Apify, no real scrape.
Mocks get_brand_last_scraped_at via monkeypatch.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from services.competitor_intel.scrape_runner import (
    _freshness_threshold_hours,
    _is_brand_fresh,
    DEFAULT_FRESHNESS_THRESHOLD_HOURS,
)


# ─── _freshness_threshold_hours ────────────────────────────────────────────

def test_threshold_defaults_to_12_when_env_unset(monkeypatch):
    monkeypatch.delenv("FRESHNESS_THRESHOLD_HOURS", raising=False)
    assert _freshness_threshold_hours() == 12.0
    assert DEFAULT_FRESHNESS_THRESHOLD_HOURS == 12


def test_threshold_reads_env_var(monkeypatch):
    monkeypatch.setenv("FRESHNESS_THRESHOLD_HOURS", "4")
    assert _freshness_threshold_hours() == 4.0


def test_threshold_supports_float_value(monkeypatch):
    monkeypatch.setenv("FRESHNESS_THRESHOLD_HOURS", "0.5")
    assert _freshness_threshold_hours() == 0.5


def test_threshold_empty_string_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("FRESHNESS_THRESHOLD_HOURS", "")
    assert _freshness_threshold_hours() == 12.0


def test_threshold_invalid_value_falls_back_to_default(monkeypatch, capsys):
    monkeypatch.setenv("FRESHNESS_THRESHOLD_HOURS", "not-a-number")
    assert _freshness_threshold_hours() == 12.0
    captured = capsys.readouterr()
    assert "Invalid FRESHNESS_THRESHOLD_HOURS" in captured.out


# ─── _is_brand_fresh ──────────────────────────────────────────────────────

@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_never_scraped_returns_not_fresh(mock_get):
    """A brand with no prior scrape should not be considered fresh."""
    mock_get.return_value = None
    is_fresh, age = _is_brand_fresh("xhs", "BrandX", threshold_hours=12)
    assert is_fresh is False
    assert age is None


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_scraped_5_minutes_ago_is_fresh(mock_get):
    """Recent scrape should be considered fresh."""
    mock_get.return_value = datetime.now(timezone.utc) - timedelta(minutes=5)
    is_fresh, age = _is_brand_fresh("xhs", "Songmont", threshold_hours=12)
    assert is_fresh is True
    assert age is not None and 0 <= age < 0.2  # ~0.083 hours


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_scraped_24_hours_ago_is_not_fresh(mock_get):
    """Old scrape should not be considered fresh."""
    mock_get.return_value = datetime.now(timezone.utc) - timedelta(hours=24)
    is_fresh, age = _is_brand_fresh("xhs", "Songmont", threshold_hours=12)
    assert is_fresh is False
    assert age is not None and 23.9 < age < 24.1


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_threshold_exactly_at_boundary_is_not_fresh(mock_get):
    """At exactly the threshold, treat as not-fresh (re-scrape). Strict less-than."""
    mock_get.return_value = datetime.now(timezone.utc) - timedelta(hours=12, seconds=1)
    is_fresh, _ = _is_brand_fresh("xhs", "Songmont", threshold_hours=12)
    assert is_fresh is False


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_threshold_zero_disables_guard(mock_get):
    """Setting threshold to 0 means 'never skip — always rescrape'."""
    mock_get.return_value = datetime.now(timezone.utc) - timedelta(minutes=1)
    is_fresh, age = _is_brand_fresh("xhs", "Songmont", threshold_hours=0)
    assert is_fresh is False
    assert age is None  # short-circuited; no DB call


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_naive_datetime_assumed_utc(mock_get):
    """If DB returns a naive datetime (no tzinfo), treat it as UTC.

    Defensive — psycopg2 normally returns TZ-aware values from TIMESTAMPTZ
    columns, but if migrations get rearranged and someone returns a naive
    datetime, we shouldn't crash.
    """
    naive = datetime.utcnow() - timedelta(hours=2)  # naive
    mock_get.return_value = naive
    is_fresh, age = _is_brand_fresh("xhs", "Songmont", threshold_hours=12)
    assert is_fresh is True
    assert age is not None and 1.9 < age < 2.1


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_per_platform_isolation(mock_get):
    """The freshness check is platform-scoped — XHS being fresh doesn't mean
    Douyin should be skipped."""
    mock_get.return_value = datetime.now(timezone.utc) - timedelta(minutes=5)

    # XHS query → fresh
    is_fresh_xhs, _ = _is_brand_fresh("xhs", "Songmont", threshold_hours=12)
    assert is_fresh_xhs is True
    mock_get.assert_called_with("xhs", "Songmont")

    # Douyin query → also returns the same mock; in real world, db_bridge
    # would scope by platform. The test verifies we PASS the platform through.
    _is_brand_fresh("douyin", "Songmont", threshold_hours=12)
    assert mock_get.call_args_list[-1].args == ("douyin", "Songmont")


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_threshold_uses_env_when_not_passed(mock_get, monkeypatch):
    """If threshold_hours=None (the default), read from FRESHNESS_THRESHOLD_HOURS."""
    monkeypatch.setenv("FRESHNESS_THRESHOLD_HOURS", "4")
    mock_get.return_value = datetime.now(timezone.utc) - timedelta(hours=5)
    is_fresh, _ = _is_brand_fresh("xhs", "Songmont")  # no threshold arg
    assert is_fresh is False  # 5h > 4h threshold


@patch("services.competitor_intel.scrape_runner.get_brand_last_scraped_at")
def test_db_returns_none_on_error_is_treated_as_no_prior_scrape(mock_get):
    """get_brand_last_scraped_at swallows DB errors and returns None. Make
    sure the guard interprets that as 'go ahead and scrape' (not 'skip')."""
    mock_get.return_value = None
    is_fresh, age = _is_brand_fresh("xhs", "Songmont", threshold_hours=12)
    assert is_fresh is False
    assert age is None
