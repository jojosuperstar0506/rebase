"""
Lightweight HTTP API server for the OMI Competitive Intelligence dashboard.

Serves dashboard data from SQLite and static files.
Uses Python's built-in http.server — no external dependencies.

Endpoints:
    GET /api/brands                         — full brand list with group info
    GET /api/brands/<name>/latest           — latest snapshot for a brand
    GET /api/brands/<name>/metrics?days=30  — metric history for trending
    GET /api/dashboard-data                 — all brands' latest snapshots (single payload)
    GET /*                                  — static files from frontend/public/

Usage:
    python -m services.competitor-intel.api_server
    python -m services.competitor-intel.api_server --port 8080
    python -m services.competitor-intel.api_server --db-path path/to/db
"""

import argparse
import json
import os
import re
import sqlite3
from http.server import HTTPServer, SimpleHTTPRequestHandler
from typing import Optional
from urllib.parse import urlparse, parse_qs

from .config import BRAND_GROUPS
from .storage import (
    DEFAULT_DB_PATH,
    init_db,
    get_all_brands,
    get_latest_snapshot,
    get_metric_history,
    get_product_rankings,
)


# Resolve static files directory (frontend/public/)
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_THIS_DIR, "..", ".."))
_STATIC_DIR = os.path.join(_REPO_ROOT, "frontend", "public")


class DashboardAPIHandler(SimpleHTTPRequestHandler):
    """
    HTTP request handler that serves API endpoints and static files.

    API routes:
        /api/brands
        /api/brands/<name>/latest
        /api/brands/<name>/metrics
        /api/dashboard-data

    Everything else falls through to static file serving from frontend/public/.
    """

    # Class-level database connection (shared across requests)
    db_conn: Optional[sqlite3.Connection] = None

    def __init__(self, *args, **kwargs):
        # Set the directory for static file serving
        super().__init__(*args, directory=_STATIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Route API requests
        if path == "/api/brands":
            self._handle_brands_list()
        elif path == "/api/dashboard-data":
            self._handle_dashboard_data()
        elif path.startswith("/api/brands/") and path.endswith("/latest"):
            brand_name = self._extract_brand_name(path, "/latest")
            self._handle_brand_latest(brand_name)
        elif path == "/api/rankings":
            query_params = parse_qs(parsed.query)
            source = query_params.get("source", ["sycm"])[0]
            limit = int(query_params.get("limit", ["100"])[0])
            date = query_params.get("date", [None])[0]
            self._handle_rankings(source, limit, date)
        elif path.startswith("/api/brands/") and path.endswith("/metrics"):
            brand_name = self._extract_brand_name(path, "/metrics")
            query_params = parse_qs(parsed.query)
            days = int(query_params.get("days", ["30"])[0])
            self._handle_brand_metrics(brand_name, days)
        else:
            # Serve static files
            super().do_GET()

    def _extract_brand_name(self, path: str, suffix: str) -> str:
        """Extract brand name from URL path like /api/brands/小CK/latest."""
        # Remove prefix and suffix
        prefix = "/api/brands/"
        name = path[len(prefix):]
        if name.endswith(suffix):
            name = name[:-len(suffix)]
        # URL decode
        from urllib.parse import unquote
        return unquote(name)

    def _send_json(self, data: dict, status: int = 200):
        """Send a JSON response with CORS headers."""
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status: int, message: str):
        """Send a JSON error response."""
        self._send_json({"error": message}, status=status)

    def _get_conn(self) -> sqlite3.Connection:
        """Get the shared database connection."""
        if DashboardAPIHandler.db_conn is None:
            raise RuntimeError("Database not initialized")
        return DashboardAPIHandler.db_conn

    def _handle_brands_list(self):
        """GET /api/brands — returns brand list with group info."""
        try:
            conn = self._get_conn()
            brands = get_all_brands(conn)

            # Organize by group
            groups = {}
            for group_key, group in BRAND_GROUPS.items():
                groups[group_key] = {
                    "name": group["name"],
                    "subtitle": group["subtitle"],
                    "brands": [b["name"] for b in group["brands"]],
                }

            self._send_json({
                "brands": brands,
                "groups": groups,
                "total": len(brands),
            })
        except Exception as e:
            self._send_error_json(500, str(e))

    def _handle_brand_latest(self, brand_name: str):
        """GET /api/brands/<name>/latest — latest snapshot for a brand."""
        try:
            conn = self._get_conn()
            snapshot = get_latest_snapshot(conn, brand_name)
            if snapshot is None:
                self._send_json({"brand_name": brand_name, "data": None})
            else:
                self._send_json(snapshot)
        except Exception as e:
            self._send_error_json(500, str(e))

    def _handle_brand_metrics(self, brand_name: str, days: int = 30):
        """GET /api/brands/<name>/metrics?days=30 — metric history."""
        try:
            conn = self._get_conn()

            # Get all metric names for this brand
            rows = conn.execute(
                "SELECT DISTINCT metric_name FROM metrics WHERE brand_name = ?",
                (brand_name,),
            ).fetchall()

            metrics = {}
            for row in rows:
                metric_name = row["metric_name"]
                history = get_metric_history(conn, brand_name, metric_name, days)
                metrics[metric_name] = [
                    {"date": date, "value": value} for date, value in history
                ]

            self._send_json({
                "brand_name": brand_name,
                "days": days,
                "metrics": metrics,
            })
        except Exception as e:
            self._send_error_json(500, str(e))

    def _handle_rankings(self, source: str, limit: int = 100, date: str = None):
        """GET /api/rankings?source=sycm&limit=100&date=2026-03-28 — product rankings."""
        try:
            conn = self._get_conn()
            products = get_product_rankings(conn, source, extract_date=date, limit=limit)

            # Get metadata from the first row
            meta = {}
            if products:
                meta = {
                    "category_path": products[0].get("category_path", ""),
                    "time_range": products[0].get("time_range", ""),
                    "ranking_type": products[0].get("ranking_type", ""),
                    "extract_date": products[0].get("extract_date", ""),
                }

            self._send_json({
                "source": source,
                "total": len(products),
                **meta,
                "products": products,
            })
        except Exception as e:
            self._send_error_json(500, str(e))

    def _handle_dashboard_data(self):
        """GET /api/dashboard-data — all brands' latest snapshots in one payload."""
        try:
            conn = self._get_conn()
            brands_db = get_all_brands(conn)

            brands_data = {}
            for brand in brands_db:
                brand_name = brand["name"]
                snapshot = get_latest_snapshot(conn, brand_name)
                if snapshot:
                    brands_data[brand_name] = snapshot

            # Build group structure
            groups = {}
            for group_key, group in BRAND_GROUPS.items():
                groups[group_key] = {
                    "name": group["name"],
                    "subtitle": group["subtitle"],
                    "brands": [b["name"] for b in group["brands"]],
                }

            self._send_json({
                "scrape_date": max(
                    (b.get("scrape_date", "") for b in brands_data.values()),
                    default="",
                ),
                "brands_count": len(brands_data),
                "groups": groups,
                "brands": brands_data,
            })
        except Exception as e:
            self._send_error_json(500, str(e))

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        """Override to add color to API vs static requests."""
        path = args[0].split()[1] if args else ""
        if path.startswith("/api/"):
            print(f"  \033[36mAPI\033[0m  {format % args}")
        else:
            # Suppress static file logs for cleanliness (uncomment to see them)
            # print(f"  \033[90mFILE\033[0m {format % args}")
            pass


def run_server(port: int = 8080, db_path: str = None):
    """Start the API server."""
    db_path = db_path or DEFAULT_DB_PATH

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        print(f"Run seed first:  python -m services.competitor-intel.seed_sample_data")
        return

    # Initialize shared DB connection
    DashboardAPIHandler.db_conn = init_db(db_path)

    # Verify static dir
    if not os.path.isdir(_STATIC_DIR):
        print(f"Warning: Static directory not found at {_STATIC_DIR}")

    server = HTTPServer(("0.0.0.0", port), DashboardAPIHandler)
    print(f"\n  OMI Competitive Intelligence API Server")
    print(f"  ───────────────────────────────────────")
    print(f"  Dashboard:  http://localhost:{port}/competitor-intel.html")
    print(f"  API:        http://localhost:{port}/api/dashboard-data")
    print(f"  Database:   {db_path}")
    print(f"  Static dir: {_STATIC_DIR}")
    print(f"\n  Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        server.server_close()
        if DashboardAPIHandler.db_conn:
            DashboardAPIHandler.db_conn.close()


def main():
    parser = argparse.ArgumentParser(description="OMI Competitive Intelligence API Server")
    parser.add_argument("--port", type=int, default=8080, help="Server port (default: 8080)")
    parser.add_argument("--db-path", type=str, default=None, help="Path to SQLite database")
    args = parser.parse_args()

    run_server(port=args.port, db_path=args.db_path)


if __name__ == "__main__":
    main()
