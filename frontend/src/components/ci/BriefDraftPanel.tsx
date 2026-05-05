import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Copy, CheckCircle2, AlertTriangle, Sparkles, Camera, Hash, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { generateBriefDraft, type BriefDraftResponse } from '../../services/ciApi';

/**
 * BriefDraftPanel — the "execution layer" reveal moment.
 *
 * Auto-fires POST /api/ci/brief/draft on mount, then renders the resulting
 * XHS post draft inline: title + body + tags + image concept. When
 * lang=en, an English gloss is shown alongside so YC reviewers can read
 * what was generated.
 *
 * Used inline at the top of /agents/xhs-content for is_demo workspaces —
 * the YC demo's third beat. Replaces an earlier modal-on-Brief approach,
 * which fragmented the demo flow (Brief modal vs Actions card pointed at
 * two different "execution" surfaces).
 */

// DraftResponse type re-exported from ciApi as BriefDraftResponse — same shape.
type DraftResponse = BriefDraftResponse;

// Hardcoded demo draft for the Tory Burch invite-code workspace. Used
// instead of a live LLM call so the YC demo recording is deterministic —
// no latency variance, no quality variance, no API dependency at record
// time. Hand-tightened by the founders to read like a real Tory Burch
// brand-team operator post (specific patina detail, mid-density emoji,
// CTA, tag mix that matches XHS conventions). The English gloss alongside
// is for English-mode YC reviewers; the Chinese draft is the actual XHS
// post a real operator would publish.
//
// When the gate widens to real customers, this constant goes away and
// the live API path takes over (already shipped — see ciApi.generateBriefDraft).
const DEMO_DRAFT_TORY_BURCH: DraftResponse = {
  channel: 'xhs',
  based_on: {
    move_index: 0,
    move_headline: '应对 Dissona 老客复购阵地战 — 用「时间证据」反守为攻',
  },
  draft: {
    title: '买包 = 投资？我用 Tory Burch 三年的真实账单',
    body: '前阵子身边好几个朋友讨论买包到底是不是投资品 🤔\n\n我的答案不在某条 KOL 的种草里。就在我背了三年的这只 Tory Burch Robinson 上 ✨\n\n金属配件已经从亮金色磨成了温润的玫瑰金,皮革变软不松垮,反而更服帖肩膀。每天挂上车钥匙、塞进咖啡杯——它从没怨言,反而像一位老朋友。\n\n设计强的包不是新鲜事,但能陪你三年还在变好的,越来越少了。这一点比任何一篇爆款笔记都值得信任 💛\n\n你包包里最久的那只是哪只?评论区分享 👇',
    tags: ['#ToryBurch', '#真皮包', '#通勤包', '#包包测评', '#包包心得', '#耐用主义', '#投资型消费'],
    image_concept: '一张顺光环境下的近距离特写——Robinson 包的金属配件磨损细节占主导,背景虚化为柔和米色,光线偏向上午十点的金黄色,营造出"使用过的物品有温度"的视觉。',
  },
  en_translation: {
    title: 'Bags = investment? My real Tory Burch ledger after three years.',
    body: 'A few friends debated lately whether designer bags count as investment. 🤔\n\nMy answer wasn\'t in any influencer\'s pitch — it\'s on the Tory Burch Robinson I\'ve carried for three years. ✨\n\nThe metal hardware aged from bright gold to warm rose gold; the leather softened without slumping, settling into my shoulder instead. Coffee cups, car keys, no complaints — more like an old friend than an accessory.\n\nBags with strong design aren\'t rare. Bags that get better over three years are. That\'s worth more than any viral post. 💛\n\nWhat\'s the oldest bag in your closet? Drop it below 👇',
    image_concept: 'Tight close-up shot in soft morning light — focus on the worn metal hardware of a Robinson bag, rose-gold patina front and center. Background blurred to warm beige tones at 10am golden hour, evoking "objects that age into character".',
  },
};

interface BriefDraftPanelProps {
  workspaceId: string;
  /** Index of the move to draft against. Defaults to 0 (top-pressure). */
  moveIndex?: number;
  /** When true, render the prebaked DEMO_DRAFT_TORY_BURCH instead of
   *  hitting the live LLM endpoint. Used for the YC demo recording so
   *  the experience is deterministic — no latency, no quality variance,
   *  no API dependency at record time. */
  isDemo?: boolean;
}

export default function BriefDraftPanel({
  workspaceId, moveIndex = 0, isDemo = false,
}: BriefDraftPanelProps) {
  const { colors: C, lang } = useApp();
  // Initialize directly with the prebaked draft when in demo mode so the
  // first render shows content (no empty-body flash before useEffect fires).
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DraftResponse | null>(isDemo ? DEMO_DRAFT_TORY_BURCH : null);
  const [copied, setCopied] = useState(false);
  const fetchedFor = useRef<string | null>(null);

  // Demo mode: serve the prebaked Tory Burch draft directly. No API call,
  // no loading state, no quality variance — deterministic for screen
  // recordings. Live API path is preserved for non-demo workspaces (and
  // for when we widen the gate later).
  useEffect(() => {
    if (!workspaceId) return;
    if (isDemo) {
      setData(DEMO_DRAFT_TORY_BURCH);
      setLoading(false);
      setError(null);
      return;
    }
    const key = `${workspaceId}::${moveIndex}::${lang}`;
    if (fetchedFor.current === key && data) return;
    fetchedFor.current = key;
    setLoading(true);
    setError(null);
    setData(null);
    generateBriefDraft(workspaceId, moveIndex, lang).then(result => {
      if (result.ok && result.data) {
        setData(result.data);
      } else {
        setError(result.message || (lang === 'zh' ? '生成失败' : 'Draft failed'));
      }
      setLoading(false);
    });
  }, [workspaceId, moveIndex, lang, data, isDemo]);

  function handleCopy() {
    if (!data?.draft) return;
    const composed = [
      data.draft.title,
      '',
      data.draft.body,
      '',
      data.draft.tags.join(' '),
    ].join('\n');
    navigator.clipboard.writeText(composed).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* clipboard blocked — silently no-op */ },
    );
  }

  function handleRegenerate() {
    // Demo mode has no live API to regenerate against — just re-show the
    // prebaked draft. (The button could be hidden in demo mode, but
    // leaving it visible keeps the UI consistent for the recording.)
    if (isDemo) {
      setData(DEMO_DRAFT_TORY_BURCH);
      return;
    }
    fetchedFor.current = null;
    setData(null);
  }

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  const panelStyle: CSSProperties = {
    background: C.s1, color: C.tx, border: `1px solid ${C.bd}`,
    borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  };
  const headerStyle: CSSProperties = {
    padding: '16px 22px', borderBottom: `1px solid ${C.bd}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: `linear-gradient(135deg, ${C.s2} 0%, ${C.s1} 100%)`,
  };
  const bodyStyle: CSSProperties = { padding: '22px 24px' };
  const footerStyle: CSSProperties = {
    padding: '12px 22px', borderTop: `1px solid ${C.bd}`,
    display: 'flex', justifyContent: 'flex-end', gap: 10,
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${C.ac}22`, color: C.ac,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sparkles size={18} strokeWidth={1.75} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
              {t('本周响应草稿', "This week's response draft")}
            </div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data?.based_on?.move_headline
                ? `${t('响应:', 'Responding to:')} ${data.based_on.move_headline}`
                : t('基于本周简报最高优先级动作自动生成', 'Auto-generated from this week\'s top-pressure move')}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: C.ac, animation: 'briefDraftPulse 1.2s ease-in-out infinite',
            }} />
            <div style={{ marginTop: 14, fontSize: 13, color: C.t2 }}>
              {t('AI 正在生成草稿…(约 5 秒)', 'AI is drafting your response… (~5 seconds)')}
            </div>
            <style>{`
              @keyframes briefDraftPulse {
                0%, 100% { opacity: 0.4; transform: scale(1); }
                50%      { opacity: 1;   transform: scale(1.4); }
              }
            `}</style>
          </div>
        )}

        {error && !loading && (
          <div style={{
            padding: 16, borderRadius: 10,
            background: `${C.bd}33`, border: `1px solid ${C.bd}`,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={18} color="#f59e0b" strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4 }}>
                {t('生成失败', 'Draft generation failed')}
              </div>
              <div style={{ fontSize: 12, color: C.t2, marginBottom: 10 }}>{error}</div>
              <button
                onClick={handleRegenerate}
                style={{
                  background: 'transparent', border: `1px solid ${C.bd}`, color: C.t2,
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('重试', 'Try again')}
              </button>
            </div>
          </div>
        )}

        {data && !loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Title */}
            <div>
              <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                {t('标题', 'Title')}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, lineHeight: 1.4 }}>
                {data.draft.title}
              </div>
            </div>

            {/* Body */}
            <div>
              <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                {t('正文', 'Body')}
              </div>
              <div style={{
                fontSize: 14, color: C.tx, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                background: C.bg, border: `1px solid ${C.bd}`,
                borderRadius: 8, padding: '14px 16px',
              }}>
                {data.draft.body}
              </div>
            </div>

            {/* Tags */}
            {data.draft.tags.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Hash size={11} strokeWidth={2.25} />
                  {t('话题标签', 'Tags')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {data.draft.tags.map((tag, i) => (
                    <span key={i} style={{
                      fontSize: 12, color: C.ac, background: `${C.ac}1a`,
                      padding: '4px 10px', borderRadius: 999, border: `1px solid ${C.ac}55`,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Image concept */}
            {data.draft.image_concept && (
              <div>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Camera size={11} strokeWidth={2.25} />
                  {t('配图建议', 'Image concept')}
                </div>
                <div style={{
                  fontSize: 13, color: C.t2, lineHeight: 1.6, fontStyle: 'italic',
                  padding: '10px 14px', background: C.bg, borderRadius: 8,
                  borderLeft: `3px solid ${C.ac}`,
                }}>
                  {data.draft.image_concept}
                </div>
              </div>
            )}

            {/* English gloss — only when lang=en. Demos to YC partners read
                this; Chinese operators ignore it. */}
            {data.en_translation && lang === 'en' && (
              <div style={{
                marginTop: 4, padding: 14,
                background: C.bg, border: `1px dashed ${C.bd}`, borderRadius: 8,
              }}>
                <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>
                  English gloss · for review only — XHS posts in Chinese
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 6 }}>
                  {data.en_translation.title}
                </div>
                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                  {data.en_translation.body}
                </div>
                {data.en_translation.image_concept && (
                  <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic' }}>
                    Image: {data.en_translation.image_concept}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {data && !loading && !error && (
        <div style={footerStyle}>
          {/* Hide Regenerate in demo mode — there's no live API to retry
              against, and a no-op button on a recording reads as broken. */}
          {!isDemo && (
            <button
              onClick={handleRegenerate}
              style={{
                background: 'transparent', border: `1px solid ${C.bd}`, color: C.t2,
                padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={13} strokeWidth={2} />
              {t('重新生成', 'Regenerate')}
            </button>
          )}
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#10b981' : C.ac,
              border: 'none', color: '#fff',
              padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              minWidth: 130, justifyContent: 'center',
            }}
          >
            {copied ? (
              <><CheckCircle2 size={15} strokeWidth={2.25} />{t('已复制', 'Copied')}</>
            ) : (
              <><Copy size={15} strokeWidth={2.25} />{t('复制全文', 'Copy post')}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
