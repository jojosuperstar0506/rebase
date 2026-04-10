import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import { getAlerts, markAlertsRead } from '../../services/ciApi';
import type { CIAlert } from '../../services/ciApi';
import { timeAgo } from '../../utils/timeAgo';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// ── Mock alert generator ───────────────────────────────────────────

interface BrandScore {
  brand_name: string;
  threat_index: number;
  momentum_score: number;
  wtp_score?: number;
}

function generateMockAlerts(competitors: BrandScore[]): CIAlert[] {
  if (!competitors || competitors.length === 0) return [];

  const alerts: CIAlert[] = [];
  const now = new Date();

  const sorted = [...competitors].sort((a, b) => b.threat_index - a.threat_index);

  if (sorted[0] && sorted[0].threat_index > 60) {
    alerts.push({
      id: 'mock-1',
      competitor_name: sorted[0].brand_name,
      alert_type: 'score_change',
      metric_type: 'threat',
      previous_value: sorted[0].threat_index - 12,
      current_value: sorted[0].threat_index,
      change_amount: 12,
      severity: 'warning',
      message: `${sorted[0].brand_name}的威胁指数上升了12分 (${sorted[0].threat_index - 12} → ${sorted[0].threat_index})`,
      is_read: false,
      created_at: new Date(now.getTime() - 2 * 3600000).toISOString(),
    });
  }

  const highMomentum = [...competitors].sort((a, b) => b.momentum_score - a.momentum_score)[0];
  if (highMomentum && highMomentum.momentum_score > 70) {
    alerts.push({
      id: 'mock-2',
      competitor_name: highMomentum.brand_name,
      alert_type: 'score_change',
      metric_type: 'momentum',
      previous_value: highMomentum.momentum_score - 15,
      current_value: highMomentum.momentum_score,
      change_amount: 15,
      severity: 'critical',
      message: `${highMomentum.brand_name}的增长势能大幅上升了15分`,
      is_read: false,
      created_at: new Date(now.getTime() - 5 * 3600000).toISOString(),
    });
  }

  // Add one read info alert for variety
  if (competitors.length >= 2) {
    const withWtp = [...competitors].sort((a, b) => (a.wtp_score ?? 50) - (b.wtp_score ?? 50))[0];
    if (withWtp) {
      const wtp = withWtp.wtp_score ?? 45;
      alerts.push({
        id: 'mock-3',
        competitor_name: withWtp.brand_name,
        alert_type: 'score_change',
        metric_type: 'wtp',
        previous_value: wtp + 8,
        current_value: wtp,
        change_amount: -8,
        severity: 'info',
        message: `${withWtp.brand_name}的支付意愿下降了8分`,
        is_read: true,
        created_at: new Date(now.getTime() - 26 * 3600000).toISOString(),
      });
    }
  }

  return alerts;
}

// ── Score change bar pair ──────────────────────────────────────────

function ScoreChangeBars({
  prev,
  curr,
  metricLabel,
  C,
}: {
  prev: number;
  curr: number;
  metricLabel: string;
  C: Record<string, string>;
}) {
  const change = curr - prev;
  const isPositive = change >= 0;
  const changeColor = isPositive ? C.success : C.danger;
  const BAR_MAX = 72; // pixels for score=100

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' as CSSProperties['flexWrap'] }}>
      <span style={{ fontSize: 11, color: C.t2, minWidth: 56, flexShrink: 0 }}>{metricLabel}:</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Before bar */}
        <div style={{
          width: Math.max(3, Math.round((prev / 100) * BAR_MAX)),
          height: 5, background: C.t3, borderRadius: 2,
        }} />
        <span style={{ fontSize: 11, color: C.t2 }}>{prev}</span>
        <span style={{ fontSize: 11, color: C.t3 }}>→</span>
        {/* After bar */}
        <div style={{
          width: Math.max(3, Math.round((curr / 100) * BAR_MAX)),
          height: 5, background: changeColor, borderRadius: 2,
        }} />
        <span style={{ fontSize: 11, color: C.t2 }}>{curr}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: changeColor, marginLeft: 2 }}>
          ({change > 0 ? '+' : ''}{change}{change >= 0 ? ' ▲' : ' ▼'})
        </span>
      </div>
    </div>
  );
}

// ── Severity dot ──────────────────────────────────────────────────

function SeverityDot({ severity, isRead, C }: { severity: CIAlert['severity']; isRead: boolean; C: Record<string, string> }) {
  const color =
    severity === 'critical' ? C.danger :
    severity === 'warning' ? '#f59e0b' :
    C.t3;

  return isRead ? (
    // Empty circle for read
    <div style={{
      width: 10, height: 10, borderRadius: '50%',
      border: `2px solid ${color}`, flexShrink: 0, marginTop: 2,
    }} />
  ) : (
    // Filled circle for unread
    <div style={{
      width: 10, height: 10, borderRadius: '50%',
      background: color, flexShrink: 0, marginTop: 2,
    }} />
  );
}

// ── Metric label helper ───────────────────────────────────────────

function getMetricLabel(metricType: string | null, lang: 'en' | 'zh'): string {
  if (!metricType) return '';
  const map: Record<string, { en: string; zh: string }> = {
    threat: { en: 'Threat', zh: '威胁指数' },
    momentum: { en: 'Momentum', zh: '增长势能' },
    wtp: { en: 'WTP', zh: '支付意愿' },
  };
  return map[metricType]?.[lang] ?? metricType;
}

// ── Main component ─────────────────────────────────────────────────

interface CIAlertFeedProps {
  workspaceId: string;
  competitors: BrandScore[];
  source: 'api' | 'local' | 'demo';
}

export default function CIAlertFeed({ workspaceId, competitors, source }: CIAlertFeedProps) {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const [alerts, setAlerts] = useState<CIAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = alerts.filter(a => !a.is_read).length;

  // Load alerts — try API, fall back to mock
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      if (workspaceId && workspaceId !== 'local') {
        const result = await getAlerts(workspaceId);
        if (!cancelled && result.alerts.length > 0) {
          setAlerts(result.alerts);
          setLoading(false);
          return;
        }
      }
      // API not available or no alerts — use mock data
      if (!cancelled) {
        setAlerts(generateMockAlerts(competitors));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [workspaceId, competitors]);

  // Mark a single alert as read (local state + API best-effort)
  function markOneRead(alertId: string) {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
    if (workspaceId && workspaceId !== 'local') {
      markAlertsRead(workspaceId, [alertId]).catch(() => {});
    }
  }

  // Mark all alerts as read
  async function handleMarkAllRead() {
    setMarkingAll(true);
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    if (workspaceId && workspaceId !== 'local') {
      await markAlertsRead(workspaceId).catch(() => {});
    }
    setMarkingAll(false);
  }

  const card: CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.bd}`,
    borderRadius: 12,
    padding: isMobile ? 14 : 24,
    marginBottom: isMobile ? 16 : 24,
  };

  return (
    <div style={card}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.bd}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🔔</span>
          <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: C.tx }}>
            {t(T.ci.alerts, lang)}
          </span>
          {unreadCount > 0 && (
            <span style={{
              background: C.danger, color: '#fff', fontSize: 11, fontWeight: 700,
              padding: '1px 7px', borderRadius: 10, minWidth: 20, textAlign: 'center',
            }}>
              {unreadCount} {t(T.ci.unread, lang)}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            style={{
              background: 'transparent', border: `1px solid ${C.bd}`,
              borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
              color: C.t2, cursor: markingAll ? 'default' : 'pointer',
              opacity: markingAll ? 0.6 : 1,
            }}
          >
            {t(T.ci.markAllRead, lang)}
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: C.t3, fontSize: 13 }}>
          {t(T.ci.loading, lang)}
        </div>
      )}

      {/* Empty state */}
      {!loading && alerts.length === 0 && (
        <div style={{ padding: isMobile ? '24px 0' : '32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔕</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.t2, marginBottom: 6 }}>
            {t(T.ci.noAlerts, lang)}
          </div>
          <div style={{ fontSize: 12, color: C.t3, maxWidth: 300, margin: '0 auto', lineHeight: 1.6 }}>
            {t(T.ci.noAlertsDesc, lang)}
          </div>
        </div>
      )}

      {/* Alert list */}
      {!loading && alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {alerts.map((alert, i) => {
            const severityColor =
              alert.severity === 'critical' ? C.danger :
              alert.severity === 'warning' ? '#f59e0b' :
              C.t3;

            const severityLabel =
              alert.severity === 'critical' ? t(T.ci.critical, lang) :
              alert.severity === 'warning' ? t(T.ci.warning, lang) :
              t(T.ci.info, lang);

            const hasScoreChange =
              alert.previous_value !== null &&
              alert.current_value !== null &&
              alert.metric_type !== null;

            return (
              <div key={alert.id}>
                <div
                  onClick={() => !alert.is_read && markOneRead(alert.id)}
                  style={{
                    display: 'flex', gap: 12, padding: isMobile ? '12px 10px' : '14px 12px',
                    background: alert.is_read ? 'transparent' : `${C.s2}`,
                    borderRadius: 8,
                    cursor: alert.is_read ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Severity dot */}
                  <SeverityDot
                    severity={alert.severity}
                    isRead={alert.is_read}
                    C={C as unknown as Record<string, string>}
                  />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: severity badge + time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: severityColor,
                        background: `${severityColor}18`, border: `1px solid ${severityColor}44`,
                        borderRadius: 4, padding: '1px 7px',
                        textTransform: 'uppercase' as CSSProperties['textTransform'],
                        letterSpacing: '0.04em',
                      }}>
                        {severityLabel}
                      </span>
                      <span style={{ fontSize: 11, color: C.t3 }}>
                        {timeAgo(alert.created_at, lang)}
                      </span>
                      {alert.is_read && (
                        <span style={{ fontSize: 11, color: C.t3 }}>
                          · {lang === 'zh' ? '已读' : 'read'}
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <div style={{
                      fontSize: isMobile ? 13 : 14,
                      color: alert.is_read ? C.t2 : C.tx,
                      lineHeight: 1.5,
                      fontWeight: alert.is_read ? 400 : 500,
                    }}>
                      {alert.message}
                    </div>

                    {/* Score change bars */}
                    {hasScoreChange && (
                      <ScoreChangeBars
                        prev={alert.previous_value!}
                        curr={alert.current_value!}
                        metricLabel={getMetricLabel(alert.metric_type, lang)}
                        C={C as unknown as Record<string, string>}
                      />
                    )}
                  </div>
                </div>

                {/* Divider */}
                {i < alerts.length - 1 && (
                  <div style={{ height: 1, background: C.bd, margin: '0 12px', opacity: 0.6 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Source note — mock data */}
      {!loading && source !== 'api' && alerts.some(a => a.id.startsWith('mock')) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.bd}`, fontSize: 11, color: C.t3 }}>
          {lang === 'zh'
            ? '模拟提醒数据 · 后端部署后将显示真实提醒'
            : 'Simulated alerts · Real alerts will appear when the backend is deployed'}
        </div>
      )}
    </div>
  );
}
