import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { t, T, Lang } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { removeCompetitor as apiRemoveCompetitor } from '../../services/ciApi';
import { useCIData } from '../../hooks/useCIData';
import { LANDSCAPE_SEED, LandscapeBrand } from '../../data/ci/landscapeSeed';
import { CICompetitorsSkeleton } from '../../components/ci/CISkeleton';

// ── Types ──────────────────────────────────────────────────────────────

interface CompetitorProfile {
  id: string;
  brand_name: string;
  tier: 'watchlist' | 'landscape';
  added_via: string;
  created_at: string;
  avg_price: number;
  est_monthly_volume: number;
  positioning: string;
  group: string;
  momentum_score: number;
  threat_index: number;
  wtp_score: number;
  platforms: { name: string; status: 'active' | 'partial' | 'none' }[];
}

// ── Helpers ────────────────────────────────────────────────────────────

// Same formula as ciApi.stableScore — ensures consistent scores across all pages
function stableScore(name: string, offset: number, min: number, range: number): number {
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.round(min + ((seed * offset) % range));
}

const PLATFORM_LIST = ['小红书', '淘宝/天猫', '抖音', '京东'];

const PLATFORM_COLORS: Record<string, string> = {
  '小红书': '#e11d48',
  '淘宝/天猫': '#f97316',
  '抖音': '#1f2937',
  '京东': '#c0392b',
};

function scoreColor(score: number, danger: string, success: string): string {
  if (score > 70) return danger;
  if (score >= 40) return '#f59e0b';
  return success;
}

function getPriceZoneLabel(price: number, lang: Lang): string {
  if (price <= 200) return lang === 'zh' ? '入门' : 'Entry';
  if (price <= 500) return lang === 'zh' ? '中端' : 'Mid-range';
  if (price <= 1000) return lang === 'zh' ? '中高端' : 'Premium';
  return lang === 'zh' ? '高端' : 'Luxury';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Sub-components ────────────────────────────────────────────────────

function ScoreBar({ label, score, C }: { label: string; score: number; C: ReturnType<typeof useApp>['colors'] }) {
  const color = scoreColor(score, C.danger, C.success);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: C.t2 }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{score}</span>
      </div>
      <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function GroupBadge({ group }: { group: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    D: { bg: '#6b728020', color: '#9ca3af' },
    C: { bg: '#f59e0b20', color: '#f59e0b' },
    B: { bg: '#06b6d420', color: '#06b6d4' },
  };
  const s = styles[group] ?? styles['C'];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
      {group}
    </span>
  );
}

function TierBadge({ tier, C }: { tier: 'watchlist' | 'landscape'; C: ReturnType<typeof useApp>['colors'] }) {
  const isWatch = tier === 'watchlist';
  return (
    <span style={{
      background: isWatch ? C.ac + '22' : C.t3 + '22',
      color: isWatch ? C.ac : C.t3,
      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
    }}>
      {isWatch ? '关注' : '全景'}
    </span>
  );
}

function PlatformPill({ name, status }: { name: string; status: 'active' | 'partial' | 'none' }) {
  if (status === 'none') return null;
  const color = PLATFORM_COLORS[name] ?? '#6b7280';
  const opacity = status === 'partial' ? 0.5 : 1;
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      padding: '2px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600, opacity,
    }}>
      {name}
    </span>
  );
}

function CompetitorCard({
  profile, C, lang, isSelected, isHovered, deepDiveOpen,
  onSelect, onHover, onDeepDive, onRemove,
}: {
  profile: CompetitorProfile;
  C: ReturnType<typeof useApp>['colors'];
  lang: Lang;
  isSelected: boolean;
  isHovered: boolean;
  deepDiveOpen: boolean;
  onSelect: () => void;
  onHover: (h: boolean) => void;
  onDeepDive: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        background: C.s1,
        border: `1px solid ${isHovered || isSelected ? C.ac : C.bd}`,
        borderRadius: 12,
        padding: 20,
        position: 'relative',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        style={{ position: 'absolute', top: 16, right: 16, width: 16, height: 16, cursor: 'pointer', accentColor: C.ac }}
      />

      {/* Header */}
      <div style={{ marginBottom: 16, paddingRight: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{profile.brand_name}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <TierBadge tier={profile.tier} C={C} />
          <GroupBadge group={profile.group} />
          <span style={{ fontSize: 12, color: C.t3 }}>{profile.positioning}</span>
        </div>
      </div>

      {/* Score bars */}
      <div style={{ marginBottom: 16 }}>
        <ScoreBar label={t(T.ci.momentum, lang)} score={profile.momentum_score} C={C} />
        <ScoreBar label={t(T.ci.threat, lang)} score={profile.threat_index} C={C} />
        <ScoreBar label={t(T.ci.wtp, lang)} score={profile.wtp_score} C={C} />
      </div>

      {/* Details */}
      <div style={{ borderTop: `1px solid ${C.bd}`, paddingTop: 14, marginBottom: 14, fontSize: 13, color: C.t2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>{t(T.ci.avgPrice, lang)}</span>
          <span style={{ color: C.tx, fontWeight: 600 }}>¥{profile.avg_price.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span>{t(T.ci.estVolume, lang)}</span>
          <span style={{ color: C.tx, fontWeight: 600 }}>{profile.est_monthly_volume.toLocaleString()}/月</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {profile.platforms.map(p => (
            <PlatformPill key={p.name} name={p.name} status={p.status} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, color: C.t3, fontSize: 11 }}>
          <span>{t(T.ci.addedOn, lang)} {formatDate(profile.created_at)}</span>
          <span>·</span>
          <span>{t(T.ci.via, lang)} {profile.added_via.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onDeepDive}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8,
            border: `1px solid ${C.ac}`, background: 'transparent',
            color: C.ac, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          {t(T.ci.deepDive, lang)}
        </button>
        <button
          onClick={onRemove}
          style={{
            padding: '7px 12px', borderRadius: 8,
            border: `1px solid ${C.bd}`, background: 'transparent',
            color: C.t3, cursor: 'pointer', fontSize: 13,
          }}
        >
          {t(T.ci.removeCompetitor, lang)}
        </button>
      </div>

      {/* Deep dive inline message */}
      {deepDiveOpen && (
        <div style={{
          marginTop: 10, padding: '10px 14px', background: C.ac + '15',
          border: `1px solid ${C.ac}44`, borderRadius: 8,
          fontSize: 13, color: C.ac, textAlign: 'center',
        }}>
          {t(T.ci.deepDiveComingSoon, lang)}
        </div>
      )}
    </div>
  );
}

function CompareView({
  selectedProfiles, allProfiles, selected, onSelect, C, lang,
}: {
  selectedProfiles: CompetitorProfile[];
  allProfiles: CompetitorProfile[];
  selected: Set<string>;
  onSelect: (id: string) => void;
  C: ReturnType<typeof useApp>['colors'];
  lang: Lang;
}) {
  if (selectedProfiles.length < 2) {
    return (
      <div>
        {/* Selector chips */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: C.t2, marginBottom: 12, fontSize: 14 }}>{t(T.ci.selectToCompare, lang)}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allProfiles.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1px solid ${selected.has(p.id) ? C.ac : C.bd}`,
                  background: selected.has(p.id) ? C.ac + '22' : 'transparent',
                  color: selected.has(p.id) ? C.ac : C.t2,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                {selected.has(p.id) ? '✓ ' : ''}{p.brand_name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 24px', color: C.t3, fontSize: 14 }}>
          ↑ {t(T.ci.selectToCompare, lang)}
        </div>
      </div>
    );
  }

  const maxPrice = Math.max(...selectedProfiles.map(p => p.avg_price));
  const maxVolume = Math.max(...selectedProfiles.map(p => p.est_monthly_volume));

  const rows: { label: string; render: (p: CompetitorProfile, idx: number) => React.ReactNode }[] = [
    {
      label: lang === 'zh' ? '品牌' : 'Brand',
      render: (p) => (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.brand_name}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <TierBadge tier={p.tier} C={C} />
            <GroupBadge group={p.group} />
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{p.positioning}</div>
        </div>
      ),
    },
    {
      label: t(T.ci.price, lang),
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>¥{p.avg_price.toLocaleString()}</div>
          <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(p.avg_price / maxPrice) * 100}%`, background: C.ac, borderRadius: 3 }} />
          </div>
        </div>
      ),
    },
    {
      label: t(T.ci.volume, lang),
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.est_monthly_volume.toLocaleString()}/月</div>
          <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(p.est_monthly_volume / maxVolume) * 100}%`, background: '#06b6d4', borderRadius: 3 }} />
          </div>
        </div>
      ),
    },
    {
      label: t(T.ci.momentum, lang),
      render: (p) => <ScoreBar label="" score={p.momentum_score} C={C} />,
    },
    {
      label: t(T.ci.threat, lang),
      render: (p) => <ScoreBar label="" score={p.threat_index} C={C} />,
    },
    {
      label: t(T.ci.wtp, lang),
      render: (p) => <ScoreBar label="" score={p.wtp_score} C={C} />,
    },
    {
      label: lang === 'zh' ? '平台' : 'Platforms',
      render: (p) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {p.platforms.filter(pl => pl.status !== 'none').map(pl => (
            <PlatformPill key={pl.name} name={pl.name} status={pl.status} />
          ))}
        </div>
      ),
    },
    {
      label: t(T.ci.group, lang),
      render: (p) => <GroupBadge group={p.group} />,
    },
  ];

  return (
    <div>
      {/* Selector chips */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {allProfiles.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              padding: '6px 14px', borderRadius: 20,
              border: `1px solid ${selected.has(p.id) ? C.ac : C.bd}`,
              background: selected.has(p.id) ? C.ac + '22' : 'transparent',
              color: selected.has(p.id) ? C.ac : C.t2,
              cursor: 'pointer', fontSize: 13,
            }}
          >
            {selected.has(p.id) ? '✓ ' : ''}{p.brand_name}
          </button>
        ))}
      </div>

      {/* Compare table */}
      <div style={{ border: `1px solid ${C.bd}`, borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((row, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: `120px ${'1fr '.repeat(selectedProfiles.length).trim()}`,
              background: ri % 2 === 0 ? C.s1 : C.s2,
            }}
          >
            {/* Row label */}
            <div style={{
              padding: '14px 16px', color: C.t2, fontSize: 13, fontWeight: 500,
              textAlign: 'right', borderRight: `1px solid ${C.bd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            }}>
              {row.label}
            </div>
            {/* Data cells */}
            {selectedProfiles.map((p, ci) => (
              <div
                key={p.id}
                style={{
                  padding: '14px 16px', fontSize: 13,
                  borderRight: ci < selectedProfiles.length - 1 ? `1px solid ${C.bd}` : undefined,
                }}
              >
                {row.render(p, ci)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export default function CICompetitors() {
  const { colors: C, lang } = useApp();
  const { competitors: rawCompetitors, workspace, loading } = useCIData();

  if (loading) return <CICompetitorsSkeleton />;

  const [viewMode, setViewMode] = useState<'cards' | 'compare'>('cards');
  const [tierFilter, setTierFilter] = useState<'all' | 'watchlist' | 'landscape'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'threat' | 'momentum' | 'price'>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [deepDiveOpen, setDeepDiveOpen] = useState<string | null>(null);

  const seedMap = useMemo(() => {
    const m = new Map<string, LandscapeBrand>();
    LANDSCAPE_SEED.forEach(b => m.set(b.brand_name, b));
    return m;
  }, []);

  const profiles = useMemo<CompetitorProfile[]>(() => {
    return rawCompetitors.map((c) => {
      const sd = seedMap.get(c.brand_name);

      const avg_price = sd?.avg_price ?? (150 + stableScore(c.brand_name, 3, 0, 1800));
      const est_monthly_volume = sd?.est_monthly_volume ?? (500 + stableScore(c.brand_name, 5, 0, 11000));
      const positioning = sd?.positioning ?? '竞品';
      const group = sd?.group ?? 'C';

      // Use same formula as ciApi.getDashboard → consistent scores across all pages
      const momentum_score = stableScore(c.brand_name, 7, 30, 60);
      const threat_index = stableScore(c.brand_name, 13, 20, 70);
      const wtp_score = stableScore(c.brand_name, 11, 25, 65);

      const platforms = PLATFORM_LIST.map((name, pi) => {
        const v = stableScore(c.brand_name + pi, 17, 0, 3);
        const status: 'active' | 'partial' | 'none' = v >= 2 ? 'active' : v === 1 ? 'partial' : 'none';
        return { name, status };
      });

      return { id: c.id, brand_name: c.brand_name, tier: c.tier, added_via: c.added_via, created_at: c.created_at, avg_price, est_monthly_volume, positioning, group, momentum_score, threat_index, wtp_score, platforms };
    });
  }, [rawCompetitors, seedMap]);

  const filtered = useMemo(() => {
    let list = profiles.filter(p => tierFilter === 'all' || p.tier === tierFilter);
    if (sortBy === 'name') list = [...list].sort((a, b) => a.brand_name.localeCompare(b.brand_name));
    else if (sortBy === 'threat') list = [...list].sort((a, b) => b.threat_index - a.threat_index);
    else if (sortBy === 'momentum') list = [...list].sort((a, b) => b.momentum_score - a.momentum_score);
    else if (sortBy === 'price') list = [...list].sort((a, b) => b.avg_price - a.avg_price);
    return list;
  }, [profiles, tierFilter, sortBy]);

  const selectedProfiles = filtered.filter(p => selected.has(p.id)).slice(0, 3);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else if (next.size < 3) { next.add(id); }
      return next;
    });
  }

  function removeCompetitor(id: string) {
    // ciApi.removeCompetitor calls saveCICompetitors → notifyCIUpdate → useCIData refreshes
    apiRemoveCompetitor(id, workspace?.id);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  const btnBase = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 8,
    border: `1px solid ${active ? C.ac : C.bd}`,
    background: active ? C.ac + '22' : 'transparent',
    color: active ? C.ac : C.t2,
    cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 600 : 400,
  });

  // Empty state
  if (rawCompetitors.length === 0) {
    return (
      <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <CISubNav />
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>{t(T.ci.competitors, lang)}</h1>
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{t(T.ci.noCompetitorsYet, lang)}</h2>
            <p style={{ color: C.t2, marginBottom: 24 }}>{t(T.ci.addInSettings, lang)}</p>
            <Link to="/ci/settings" style={{ background: C.ac, color: '#fff', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
              {t(T.ci.goToSettings, lang)}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <CISubNav />

        {/* Page header + view toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>{t(T.ci.competitors, lang)}</h1>
            <span style={{ color: C.t3, fontSize: 13 }}>{filtered.length} {t(T.ci.xCompetitors, lang)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setViewMode('cards')} style={btnBase(viewMode === 'cards')}>{t(T.ci.cardView, lang)}</button>
            <button onClick={() => setViewMode('compare')} style={btnBase(viewMode === 'compare')}>{t(T.ci.compareView, lang)}</button>
          </div>
        </div>

        {/* Filter + Sort */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Tier filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'watchlist', 'landscape'] as const).map(tier => (
              <button key={tier} onClick={() => setTierFilter(tier)} style={btnBase(tierFilter === tier)}>
                {tier === 'all' ? t(T.ci.all, lang) : tier === 'watchlist' ? t(T.ci.watchlist, lang) : t(T.ci.landscapeTier, lang)}
              </button>
            ))}
          </div>
          {/* Sort */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {(['name', 'threat', 'momentum', 'price'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} style={btnBase(sortBy === s)}>
                {s === 'name' ? t(T.ci.sortByName, lang)
                  : s === 'threat' ? t(T.ci.sortByThreat, lang)
                  : s === 'momentum' ? t(T.ci.sortByMomentum, lang)
                  : t(T.ci.sortByPrice, lang)}
              </button>
            ))}
          </div>
        </div>

        {/* Card View */}
        {viewMode === 'cards' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {filtered.map(profile => (
              <CompetitorCard
                key={profile.id}
                profile={profile}
                C={C}
                lang={lang}
                isSelected={selected.has(profile.id)}
                isHovered={hoveredCard === profile.id}
                deepDiveOpen={deepDiveOpen === profile.id}
                onSelect={() => toggleSelect(profile.id)}
                onHover={h => setHoveredCard(h ? profile.id : null)}
                onDeepDive={() => setDeepDiveOpen(deepDiveOpen === profile.id ? null : profile.id)}
                onRemove={() => removeCompetitor(profile.id)}
              />
            ))}
          </div>
        )}

        {/* Compare View */}
        {viewMode === 'compare' && (
          <CompareView
            selectedProfiles={selectedProfiles}
            allProfiles={filtered}
            selected={selected}
            onSelect={toggleSelect}
            C={C}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}
