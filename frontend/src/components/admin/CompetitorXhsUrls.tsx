// Admin section: list competitors waiting for an XHS profile URL, let
// admin paste one per competitor. Used in the Apify scraping operational
// flow — after a customer finishes onboarding (AI suggests competitors →
// customer confirms), each selected competitor needs an XHS profile URL
// before the daily cron in USE_APIFY=true mode can scrape it.
//
// Endpoints (added in PR #81, commit c236129):
//   GET   /api/admin/competitors/missing-xhs-url
//   PATCH /api/admin/competitors/:id/xhs-url   body: { xhs_profile_url }
//
// Design system: uses Joanna's primitives (Eyebrow, Heading, Input, Button,
// Label, BrandChip) + CSS variables (--color-*). Monospace comment
// convention for inline labels matches CompetitorsStep.tsx.

import { useState, useEffect, useCallback, useRef } from "react";
import { Eyebrow } from "../ui/Eyebrow";
import { Heading } from "../ui/Heading";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { BrandChip } from "../ui/BrandChip";

interface MissingUrlCompetitor {
  id: string;
  brand_name: string;
  workspace_id: string;
  tier: string;
  added_via: string;
  created_at: string;
  workspace_brand_name: string;
  workspace_user_id: string;
}

export function CompetitorXhsUrls() {
  const [competitors, setCompetitors] = useState<MissingUrlCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Scrape trigger state — separate from queue state because they're
  // independent operations (queue = "URLs to paste", scrape = "kick off
  // Apify for all watchlist brands").
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [scrapeOk, setScrapeOk] = useState(false);
  // Coalesce parallel refresh calls: when two UrlRows both call onSaved()
  // within their 1.5s success window, we want ONE refresh, not two. Tracks
  // an in-flight refresh so the second caller is a no-op.
  const refreshInFlight = useRef(false);
  // Track mount state to avoid setState-after-unmount warnings in
  // strict-mode dev / when admin navigates away mid-fetch.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Trigger the scraper. Fire-and-forget on the server side; we just need
  // to confirm the spawn succeeded and surface the response to the admin.
  async function handleRunScraper() {
    setScraping(true);
    setScrapeMsg("");
    setScrapeOk(false);
    try {
      const res = await fetch("/api/admin/scrape", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape trigger failed");
      if (mounted.current) {
        setScrapeOk(true);
        setScrapeMsg(data.message || "Scraper started.");
      }
    } catch (e) {
      if (mounted.current) {
        setScrapeOk(false);
        setScrapeMsg(e instanceof Error ? e.message : "Scrape trigger failed");
      }
    } finally {
      if (mounted.current) setScraping(false);
    }
  }

  const fetchMissing = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (mounted.current) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch("/api/admin/competitors/missing-xhs-url");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      if (mounted.current) {
        setCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      if (mounted.current) setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetchMissing();
  }, [fetchMissing]);

  return (
    <section className="mt-12">
      {/* ── Run scraper now panel ──────────────────────────────────────
          Operationally, the admin flow is: paste URLs in the queue below →
          click this button → wait ~2-5 min → customer's Settings page
          state-aware UX flips from "setting up" to "ready". The 12hr
          freshness guard makes this safe to click repeatedly. */}
      <div
        className="mb-8 p-5 rounded-[var(--radius-md)]"
        style={{
          border: "1px dashed var(--color-border)",
          backgroundColor: "var(--color-surface-elevated)",
        }}
      >
        <Eyebrow>// admin · apify scraper · trigger</Eyebrow>
        <Heading as={3} size="card" className="mt-2 mb-2">
          Run XHS scraper now
        </Heading>
        <p className="font-mono text-xs text-[var(--color-text-muted)] leading-relaxed mb-4 max-w-prose">
          // Spawns scrape_runner --tier watchlist on ECS. Already-fresh brands
          <br />
          // (scraped &lt;12hr ago) are skipped — safe to click after pasting
          <br />
          // new URLs in the queue below.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleRunScraper} disabled={scraping}>
            {scraping ? "starting…" : "run scraper"}
          </Button>
          {scrapeMsg && (
            <span
              className="font-mono text-xs"
              style={{
                color: scrapeOk
                  ? "var(--color-success)"
                  : "var(--color-danger)",
              }}
            >
              {scrapeOk ? "✓ " : "✗ "}
              {scrapeMsg}
            </span>
          )}
        </div>
      </div>

      <div className="mb-5">
        <Eyebrow>// admin · apify scraper · xhs profile urls</Eyebrow>
        <Heading as={3} size="card" className="mt-2">
          Competitors awaiting XHS profile URL
        </Heading>
        <p className="font-mono text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed max-w-prose">
          // {competitors.length} competitor{competitors.length === 1 ? "" : "s"} need a profile URL set
          <br />
          // before the daily Apify scrape can include them. Find the brand on
          <br />
          // rednote.com, copy the profile URL, paste here.
        </p>
      </div>

      {loading && (
        <div className="font-mono text-sm text-[var(--color-text-muted)]">
          // loading queue…
        </div>
      )}

      {error && (
        <div
          className="px-4 py-3 mb-4 rounded-[var(--radius-xs)]"
          style={{
            border: "1px solid var(--color-danger)",
            backgroundColor: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
          }}
        >
          <span className="font-mono text-sm text-[var(--color-danger)]">
            // error: {error}
          </span>
        </div>
      )}

      {!loading && !error && competitors.length === 0 && (
        <div
          className="px-4 py-4 rounded-[var(--radius-xs)]"
          style={{
            border: "1px solid var(--color-success)",
            backgroundColor: "color-mix(in srgb, var(--color-success) 10%, transparent)",
          }}
        >
          <span className="font-mono text-sm text-[var(--color-success)]">
            ✓ // all configured competitors have XHS URLs set
          </span>
        </div>
      )}

      {!loading && !error && competitors.length > 0 && (
        <WorkspaceGroupedQueue
          competitors={competitors}
          onSaved={fetchMissing}
        />
      )}
    </section>
  );
}

// ─── Workspace-grouped queue ───────────────────────────────────────────
// Groups competitors by (workspace_user_id, workspace_brand_name) so admin
// sees per-customer sections — much easier to triage than the previous
// flat list, especially as the queue grows past 20-30 competitors across
// multiple workspaces. Section headers show the invite code (= user_id)
// so admin can mentally tie back to a specific approved customer.
function WorkspaceGroupedQueue({
  competitors, onSaved,
}: {
  competitors: MissingUrlCompetitor[];
  onSaved: () => void;
}) {
  // Group by user_id. Two workspaces could in theory share a brand_name
  // (different customers, same company name) — we key on user_id (invite
  // code) because that's the actual primary key in the auth model.
  const groups = new Map<string, {
    workspaceUserId: string;
    workspaceBrandName: string;
    competitors: MissingUrlCompetitor[];
  }>();

  for (const c of competitors) {
    const key = c.workspace_user_id || c.workspace_id;
    if (!groups.has(key)) {
      groups.set(key, {
        workspaceUserId: c.workspace_user_id,
        workspaceBrandName: c.workspace_brand_name || c.workspace_id.slice(0, 8),
        competitors: [],
      });
    }
    groups.get(key)!.competitors.push(c);
  }

  // Stable ordering: by workspace brand name (alphabetical), then by
  // each group's competitors in insertion order (which the backend
  // already orders by created_at DESC).
  const sortedGroups = Array.from(groups.values()).sort((a, b) =>
    a.workspaceBrandName.localeCompare(b.workspaceBrandName)
  );

  return (
    <div className="flex flex-col gap-6">
      {sortedGroups.map((g) => (
        <div key={g.workspaceUserId}>
          {/* Section header — workspace name + invite code so admin can
              mentally tie back to a specific customer. Mono eyebrow
              matches Joanna's section-title convention. */}
          <div className="mb-3 pb-2" style={{
            borderBottom: "1px dashed var(--color-border-hairline)",
          }}>
            <Eyebrow>
              // {g.workspaceBrandName} · invite code {g.workspaceUserId}
            </Eyebrow>
            <div className="font-mono text-xs text-[var(--color-text-muted)] mt-1">
              // {g.competitors.length} competitor{g.competitors.length === 1 ? "" : "s"} awaiting URL
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {g.competitors.map((c) => (
              <UrlRow key={c.id} competitor={c} onSaved={onSaved} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── One competitor row ────────────────────────────────────────────────

interface UrlRowProps {
  competitor: MissingUrlCompetitor;
  onSaved: () => void;
}

function UrlRow({ competitor, onSaved }: UrlRowProps) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [rowError, setRowError] = useState("");

  // Track the refresh timeout so we can clear it if the component unmounts
  // before the 1.5s success-state delay completes (avoids setState-on-
  // unmounted-component warnings).
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  async function handleSave() {
    if (!url.trim()) return;
    setSaving(true);
    setRowError("");
    try {
      const res = await fetch(`/api/admin/competitors/${competitor.id}/xhs-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xhs_profile_url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server may return a "hint" for URL-format errors
        const msg = data.hint || data.error || "Save failed";
        throw new Error(msg);
      }
      setJustSaved(true);
      // Show "saved" state for 1.5s, then refresh the parent list
      // (which will remove this row since it now has a URL).
      // Parent's fetchMissing coalesces if multiple rows save in parallel.
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
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
      className="p-4 rounded-[var(--radius-xs)]"
      style={{
        border: `1px solid var(${justSaved ? "--color-success" : "--color-border-hairline"})`,
        backgroundColor: "var(--color-raised)",
      }}
    >
      {/* Brand header — workspace context is in the section header above,
          so per-row meta is just the brand chip + how/when it was added. */}
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <BrandChip
          name={competitor.brand_name}
          category={competitor.tier}
        />
        <div className="font-mono text-xs text-[var(--color-text-muted)]">
          // added via {competitor.added_via}
          {" · "}
          {new Date(competitor.created_at).toLocaleDateString()}
        </div>
      </div>

      {/* URL input + save button */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Label htmlFor={`url-${competitor.id}`} className="block mb-1.5">
            <Eyebrow>// xhs profile url</Eyebrow>
          </Label>
          <Input
            id={`url-${competitor.id}`}
            placeholder="https://www.rednote.com/user/profile/..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (rowError) setRowError("");
            }}
            disabled={saving || justSaved}
            className="font-mono text-sm"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || justSaved || !url.trim()}
          variant={justSaved ? "accent" : "primary"}
          size="md"
        >
          {saving ? "saving…" : justSaved ? "✓ saved" : "set url"}
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
