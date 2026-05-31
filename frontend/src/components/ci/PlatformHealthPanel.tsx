import { useApp } from "../../context/AppContext";
import { type PlatformConnection } from "../../services/ciApi";
import { useCIData } from "../../hooks/useCIData";
import { formatRelativeTime, freshnessTier, freshnessColor } from "../../utils/freshness";

/**
 * Surfaces the per-platform scrape connection health (PR #105 + #102).
 * Reads connections from useCIData (the shared hook already fetches them).
 *
 * Fixes #132: previously this component called getConnections again on
 * its own useEffect, double-fetching /connections every time the panel
 * mounted alongside useCIData's own fetch. Now it just consumes the
 * connections that useCIData already loaded.
 *
 * Drop-in: renders nothing if there are no connections yet, so the
 * Settings page degrades gracefully for fresh workspaces.
 */

const STATUS_LABEL_EN: Record<PlatformConnection["status"], string> = {
  active: "active",
  expiring: "expiring",
  expired: "expired",
  error: "error",
};
const STATUS_LABEL_ZH: Record<PlatformConnection["status"], string> = {
  active: "正常",
  expiring: "即将过期",
  expired: "已过期",
  error: "异常",
};
const STATUS_COLOR: Record<PlatformConnection["status"], string> = {
  active: "var(--color-success, #2d8659)",
  expiring: "var(--color-warning, #b8741a)",
  expired: "var(--color-danger, #c44848)",
  error: "var(--color-danger, #c44848)",
};

const PLATFORM_LABEL_EN: Record<string, string> = {
  xhs_analytics: "Xiaohongshu",
  sycm: "Tmall (SYCM)",
  douyin_compass: "Douyin Compass",
};
const PLATFORM_LABEL_ZH: Record<string, string> = {
  xhs_analytics: "小红书",
  sycm: "天猫 (生意参谋)",
  douyin_compass: "抖音电商罗盘",
};

export function PlatformHealthPanel() {
  const { colors: C, lang } = useApp();
  const { workspace, connections } = useCIData();

  // Don't render for mock / local workspaces — same guard as before, just
  // expressed against the shared data.
  const wsId = workspace?.id;
  if (!wsId || wsId === "mock" || wsId === "local") return null;
  if (connections.length === 0) return null;

  return (
    <div
      style={{
        background: C.s1,
        border: `1px solid ${C.bd}`,
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <h2
        style={{
          fontSize: 12, fontWeight: 600, marginBottom: 16, marginTop: 0,
          fontFamily: "var(--font-mono)", letterSpacing: "0.16em",
          textTransform: "uppercase", color: C.t3,
        }}
      >
        {lang === "zh" ? "// 数据源状态" : "// data source health"}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {connections.map((conn) => {
          const statusLabel = (lang === "zh" ? STATUS_LABEL_ZH : STATUS_LABEL_EN)[conn.status];
          const statusColor = STATUS_COLOR[conn.status];
          const platformLabel =
            (lang === "zh" ? PLATFORM_LABEL_ZH : PLATFORM_LABEL_EN)[conn.platform] || conn.platform;
          const tier = freshnessTier(conn.last_successful_scrape);
          const relativeTime = formatRelativeTime(conn.last_successful_scrape, lang);

          return (
            <div
              key={conn.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: C.s2,
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 13,
              }}
            >
              {/* status dot */}
              <span
                aria-hidden
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: statusColor, flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600, color: C.tx, minWidth: 140 }}>
                {platformLabel}
              </span>
              <span
                style={{
                  fontSize: 11, padding: "2px 8px",
                  background: statusColor + "1f",
                  color: statusColor,
                  borderRadius: 2,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {statusLabel}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  color: freshnessColor(tier),
                }}
              >
                {lang === "zh" ? "上次抓取" : "last scrape"} · {relativeTime}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
