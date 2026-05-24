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

import { useState, useEffect, useCallback } from "react";
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

  const fetchMissing = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/competitors/missing-xhs-url");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissing();
  }, [fetchMissing]);

  return (
    <section className="mt-12">
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
        <div className="flex flex-col gap-3">
          {competitors.map((c) => (
            <UrlRow key={c.id} competitor={c} onSaved={fetchMissing} />
          ))}
        </div>
      )}
    </section>
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
      // (which will remove this row since it now has a URL)
      setTimeout(() => {
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
      {/* Brand header */}
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <BrandChip
          name={competitor.brand_name}
          category={competitor.tier}
        />
        <div className="font-mono text-xs text-[var(--color-text-muted)]">
          // workspace: {competitor.workspace_brand_name || competitor.workspace_id.slice(0, 8)}
          {" · "}
          added via {competitor.added_via}
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
