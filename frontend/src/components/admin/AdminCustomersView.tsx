// AdminCustomersView — per-customer workspace cards.
//
// Will's call 2026-05-26: previous /admin had 3 separate sections (awaiting
// URL queue, edit configured URLs, workspace own-brand URLs). Each customer's
// setup was scattered across all 3, making admin work mentally expensive.
//
// This component is "customer-centric" — one card per workspace, expand to
// see ALL of that customer's setup in one place: own-brand URL, all
// competitors with URLs (inline editable), and a per-workspace scrape
// trigger. Status badges at the top of each card so admin can scan for
// who needs attention.
//
// Data: single GET /api/admin/customers fetch (consolidated endpoint).
// Mutations: reuses existing PATCH endpoints for individual URL updates.

import { useState, useEffect, useCallback, useRef } from "react";
import { Eyebrow } from "../ui/Eyebrow";
import { Heading } from "../ui/Heading";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { BrandChip } from "../ui/BrandChip";

interface CustomerCompetitor {
  id: string;
  workspace_id: string;
  brand_name: string;
  tier: string;
  added_via: string;
  xhs_profile_url: string | null;
  created_at: string;
  last_scraped_at: string | null;
  last_scrape_platform: string | null;
}

interface CustomerStatus {
  total_competitors: number;
  competitors_with_url: number;
  competitors_with_scrape: number;
  own_brand_configured: boolean;
  own_brand_scraped: boolean;
  ready_for_analysis: boolean;
}

interface Customer {
  workspace_id: string;
  brand_name: string;
  user_id: string;
  category: string | null;
  created_at: string;
  updated_at: string;
  own_brand_xhs_url: string | null;
  own_brand_last_scraped_at: string | null;
  competitors: CustomerCompetitor[];
  status: CustomerStatus;
}

export function AdminCustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const fetchCustomers = useCallback(async () => {
    if (mounted.current) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch("/api/admin/customers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load customers");
      if (mounted.current) {
        setCustomers(Array.isArray(data.customers) ? data.customers : []);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function toggleExpanded(workspaceId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="font-mono text-sm text-[var(--color-text-muted)] py-8">
        // loading customers…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="px-4 py-3 rounded-[var(--radius-xs)] my-4"
        style={{
          border: "1px solid var(--color-danger)",
          backgroundColor: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
        }}
      >
        <span className="font-mono text-sm text-[var(--color-danger)]">
          // error: {error}
        </span>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="font-mono text-sm text-[var(--color-text-muted)] py-8 text-center">
        // no customers yet — approve someone in the Applicants tab first
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="font-mono text-xs text-[var(--color-text-muted)] mb-2">
        // {customers.length} customer{customers.length === 1 ? "" : "s"} ·
        click a card to expand setup
      </div>
      {customers.map((c) => (
        <CustomerCard
          key={c.workspace_id}
          customer={c}
          isExpanded={expanded.has(c.workspace_id)}
          onToggle={() => toggleExpanded(c.workspace_id)}
          onRefresh={fetchCustomers}
        />
      ))}
    </div>
  );
}

// ─── One customer card ─────────────────────────────────────────────────

function CustomerCard({ customer: c, isExpanded, onToggle, onRefresh }: {
  customer: Customer;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  // Composite status — admin can scan and tell at a glance who needs work.
  const fullyConfigured = c.status.own_brand_configured &&
    c.status.competitors_with_url === c.status.total_competitors &&
    c.status.total_competitors > 0;

  const needsAttention =
    (!c.status.own_brand_configured && c.status.total_competitors > 0) ||
    (c.status.competitors_with_url < c.status.total_competitors);

  const statusBadge = fullyConfigured
    ? { color: "var(--color-success)", label: "✓ fully configured" }
    : needsAttention
      ? { color: "var(--color-warning, #f59e0b)", label: "⚠ setup incomplete" }
      : c.status.total_competitors === 0
        ? { color: "var(--color-text-muted)", label: "// no competitors yet" }
        : { color: "var(--color-text-muted)", label: "// in progress" };

  return (
    <div
      className="rounded-[var(--radius-md)]"
      style={{
        border: `1px solid var(--color-border-hairline)`,
        backgroundColor: "var(--color-raised)",
      }}
    >
      {/* Card header — always visible, click to expand */}
      <button
        onClick={onToggle}
        className="w-full p-4 text-left flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {isExpanded ? "▼" : "▶"}
          </span>
          <BrandChip name={c.brand_name} category="customer" />
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            // {c.user_id}
            {c.category ? ` · ${c.category}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs" style={{ color: statusBadge.color }}>
            {statusBadge.label}
          </span>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {c.status.competitors_with_url}/{c.status.total_competitors} URLs ·
            {c.status.own_brand_configured ? " own ✓" : " own ✗"}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t" style={{
          borderColor: "var(--color-border-hairline)",
        }}>
          <CustomerSetupForm customer={c} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  );
}

// ─── Setup form inside the expanded card ──────────────────────────────

function CustomerSetupForm({ customer: c, onRefresh }: {
  customer: Customer;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 pt-4">
      {/* Own brand URL */}
      <div>
        <div className="font-mono text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
          // own brand
        </div>
        <UrlEditRow
          label={c.brand_name}
          subtitle={c.own_brand_last_scraped_at
            ? `last scraped ${formatRelative(c.own_brand_last_scraped_at)}`
            : "never scraped"}
          currentUrl={c.own_brand_xhs_url}
          patchUrl={`/api/admin/workspaces/${c.workspace_id}/xhs-url`}
          onSaved={onRefresh}
          isOwnBrand={true}
        />
      </div>

      {/* Competitors */}
      <div>
        <div className="font-mono text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
          // competitors ({c.competitors.length})
        </div>
        {c.competitors.length === 0 ? (
          <div className="font-mono text-xs text-[var(--color-text-muted)] py-2">
            // no competitors added yet
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {c.competitors.map((comp) => (
              <UrlEditRow
                key={comp.id}
                label={comp.brand_name}
                subtitle={`${comp.tier} · added via ${comp.added_via}` +
                  (comp.last_scraped_at
                    ? ` · last scraped ${formatRelative(comp.last_scraped_at)}`
                    : " · never scraped")}
                currentUrl={comp.xhs_profile_url}
                patchUrl={`/api/admin/competitors/${comp.id}/xhs-url`}
                onSaved={onRefresh}
                isOwnBrand={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Per-workspace scrape button */}
      <div className="pt-2 flex items-center gap-3 flex-wrap">
        <WorkspaceScrapeButton workspaceId={c.workspace_id} brandName={c.brand_name} />
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          // force-rescrape: charges ~$0.25/brand against Apify credit
        </span>
      </div>
    </div>
  );
}

// ─── Reusable URL edit row (own brand OR competitor) ──────────────────

function UrlEditRow({ label, subtitle, currentUrl, patchUrl, onSaved, isOwnBrand }: {
  label: string;
  subtitle: string;
  currentUrl: string | null;
  patchUrl: string;
  onSaved: () => void;
  isOwnBrand: boolean;
}) {
  const [url, setUrl] = useState(currentUrl || "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [rowError, setRowError] = useState("");
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);
  useEffect(() => {
    setUrl(currentUrl || "");
  }, [currentUrl]);

  const isDirty = url.trim() !== (currentUrl || "");
  const buttonLabel = currentUrl ? "update" : "set url";

  async function handleSave() {
    if (!url.trim() || !isDirty) return;
    setSaving(true);
    setRowError("");
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xhs_profile_url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.hint || data.error || "Save failed";
        throw new Error(msg);
      }
      setJustSaved(true);
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        setJustSaved(false);
        onSaved();
      }, 1500);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="p-3 rounded-[var(--radius-xs)]"
      style={{
        border: `1px solid var(${justSaved ? "--color-success" : "--color-border-hairline"})`,
        backgroundColor: isOwnBrand
          ? "color-mix(in srgb, var(--color-accent) 4%, transparent)"
          : "var(--color-surface)",
      }}
    >
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <BrandChip name={label} category={isOwnBrand ? "own-brand" : ""} />
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          // {subtitle}
        </span>
      </div>

      <Label htmlFor={`url-${patchUrl}`}>XHS profile URL</Label>
      <div className="flex gap-3 items-stretch mt-1">
        <div className="flex-1">
          <Input
            id={`url-${patchUrl}`}
            value={url}
            onChange={(e) => { setUrl(e.target.value); setRowError(""); }}
            placeholder="https://www.rednote.com/user/profile/..."
            disabled={saving || justSaved}
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || justSaved || !url.trim() || !isDirty}
          variant={justSaved ? "accent" : "primary"}
          size="md"
        >
          {saving ? "saving…" : justSaved ? "✓ saved" : buttonLabel}
        </Button>
      </div>

      {rowError && (
        <div className="font-mono text-xs text-[var(--color-danger)] mt-2">
          // {rowError}
        </div>
      )}
    </div>
  );
}

// ─── Per-workspace scrape button ──────────────────────────────────────

function WorkspaceScrapeButton({ workspaceId, brandName }: {
  workspaceId: string;
  brandName: string;
}) {
  const [scraping, setScraping] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function handleClick() {
    setScraping(true);
    setMsg("");
    setOk(false);
    try {
      const res = await fetch(`/api/admin/customers/${workspaceId}/scrape`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape trigger failed");
      if (mounted.current) {
        setOk(true);
        setMsg(data.message || "Scraper started.");
      }
    } catch (e) {
      if (mounted.current) {
        setOk(false);
        setMsg(e instanceof Error ? e.message : "Scrape trigger failed");
      }
    } finally {
      if (mounted.current) setScraping(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button onClick={handleClick} disabled={scraping} size="md">
        {scraping ? "starting…" : `run scraper for ${brandName}`}
      </Button>
      {msg && (
        <span
          className="font-mono text-xs"
          style={{
            color: ok ? "var(--color-success)" : "var(--color-danger)",
          }}
        >
          {ok ? "✓ " : "✗ "}{msg}
        </span>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor(diff / (1000 * 60));
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}
