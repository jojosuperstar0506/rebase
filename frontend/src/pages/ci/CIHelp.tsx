import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import CICollapsible from '../../components/ci/CICollapsible';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// ── Small helper sub-components ───────────────────────────────────

function Step({ num, text, C }: { num: number; text: string; C: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: C.ac,
        color: '#fff', fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{num}</div>
      <span style={{ paddingTop: 2 }}>{text}</span>
    </div>
  );
}

function Kv({ label, value, C }: { label: string; value: string; C: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 14px', background: C.s2, borderRadius: 8, marginBottom: 8 }}>
      <span style={{ fontWeight: 700, color: C.tx, minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.t2 }}>{value}</span>
    </div>
  );
}

function QA({ q, a, C }: { q: string; a: string; C: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: C.tx, marginBottom: 4 }}>{q}</div>
      <div style={{ color: C.t2, paddingLeft: 16, borderLeft: `2px solid ${C.ac}` }}>{a}</div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export default function CIHelp() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
    padding: isMobile ? '16px 16px' : '24px 28px', marginBottom: 24,
  };

  const Cc = C as unknown as Record<string, string>;

  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight: '100vh',
      padding: isMobile ? '16px 12px' : '32px 24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <CISubNav />

        <div style={{ marginBottom: isMobile ? 20 : 28 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
            {t(T.ci.help, lang)}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: 0 }}>
            {lang === 'zh'
              ? '所有关于 Rebase 竞品情报系统的使用说明'
              : 'Everything you need to know about using Rebase Competitive Intelligence'}
          </p>
        </div>

        {/* ── Section 1: Getting Started ── */}
        <div style={card}>
          <CICollapsible
            title={lang === 'zh' ? '快速入门' : 'Getting Started'}
            defaultOpen={true}
          >
            <Step num={1} C={Cc} text={lang === 'zh'
              ? '在「设置」中填写品牌资料：品牌名称、品类、价格区间'
              : 'In Settings, fill in your brand profile: name, category, and price range'
            } />
            <Step num={2} C={Cc} text={lang === 'zh'
              ? '添加竞品：输入品牌名称、粘贴链接，或使用AI推荐'
              : 'Add competitors: type a name, paste a link, or use AI suggestions'
            } />
            <Step num={3} C={Cc} text={lang === 'zh'
              ? '在「总览」仪表盘查看竞品态势和评分趋势'
              : 'Visit the Dashboard to see your competitive landscape and score trends'
            } />
            <Step num={4} C={Cc} text={lang === 'zh'
              ? '点击任意竞品卡片进入「深度分析」，运行全量竞品解析'
              : 'Click any competitor card to open Deep Dive and run a full analysis'
            } />
            <div style={{ marginTop: 16, padding: '12px 16px', background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`, borderRadius: 8, fontSize: 13, color: C.t2 }}>
              {lang === 'zh'
                ? '提示：关注列表（Watchlist）最多追踪10个品牌，每日更新；全景列表不限数量，每周更新。'
                : 'Tip: Watchlist tracks up to 10 brands with daily updates. Landscape has no limit, updated weekly.'}
            </div>
          </CICollapsible>
        </div>

        {/* ── Section 2: Understanding Scores ── */}
        <div style={card}>
          <CICollapsible title={lang === 'zh' ? '理解评分' : 'Understanding Scores'}>
            <div style={{ marginBottom: 16, fontSize: 13, color: C.t3 }}>
              {lang === 'zh'
                ? '所有评分均为0-100分，数值越高代表该指标越强。'
                : 'All scores are 0–100. Higher = stronger on that dimension.'}
            </div>
            <Kv
              C={Cc}
              label={lang === 'zh' ? '增长势能（Momentum）' : 'Momentum Score'}
              value={lang === 'zh'
                ? '竞品的增长速度。数值越高，增长越快。基于粉丝增长、内容发布量和互动率计算。'
                : 'How fast a competitor is growing. Based on follower growth, content volume, and engagement rate.'}
            />
            <Kv
              C={Cc}
              label={lang === 'zh' ? '威胁指数（Threat）' : 'Threat Index'}
              value={lang === 'zh'
                ? '该竞品对你的威胁程度。数值越高，威胁越大。基于价格重叠度、市场占有率和产品竞争分析计算。'
                : 'How much this competitor threatens you. Based on price overlap, market presence, and product competition.'}
            />
            <Kv
              C={Cc}
              label={lang === 'zh' ? '支付意愿（WTP）' : 'WTP Score'}
              value={lang === 'zh'
                ? '品牌的溢价能力。数值越高，消费者愿意为该品牌支付更高价格。基于品类均价和销量加权计算。'
                : 'Brand pricing power. How much of a premium consumers pay for this brand vs. category average, weighted by sales.'}
            />
            <div style={{ marginTop: 16, padding: '12px 16px', background: `${C.danger}0a`, borderLeft: `3px solid ${C.danger}`, borderRadius: 8, fontSize: 13, color: C.t2 }}>
              {lang === 'zh'
                ? '高优先级竞品 = 威胁指数 > 60 且增长势能 > 60。重点监控右上象限的品牌。'
                : 'High-priority competitors = Threat > 60 AND Momentum > 60. Focus on brands in the top-right quadrant of the bubble chart.'}
            </div>
          </CICollapsible>
        </div>

        {/* ── Section 3: Reading the Dashboard ── */}
        <div style={card}>
          <CICollapsible title={lang === 'zh' ? '解读仪表盘' : 'Reading the Dashboard'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                {
                  icon: '🫧',
                  titleZh: '气泡图（竞品态势图）',
                  titleEn: 'Bubble Chart',
                  descZh: 'X轴 = 威胁指数，Y轴 = 增长势能，气泡大小 = 支付意愿。右上象限是最高优先级竞品。鼠标悬停查看详细评分。',
                  descEn: 'X = Threat Index, Y = Momentum, size = WTP. Top-right = highest priority. Hover for details.',
                },
                {
                  icon: '📊',
                  titleZh: '市场全景（价格×销量）',
                  titleEn: 'Market Landscape',
                  descZh: 'X轴 = 均价，Y轴 = 预估月销量。展示整个品类的竞争格局，以及你的品牌在其中的定位。',
                  descEn: 'X = average price, Y = estimated monthly volume. Shows where you sit vs. the whole market.',
                },
                {
                  icon: '📈',
                  titleZh: '评分趋势（30/90天）',
                  titleEn: 'Score Trends',
                  descZh: '展示过去30天或90天的评分变化。箭头向上（↑）代表上升，向下（↓）代表下降。',
                  descEn: '30-day and 90-day score history with direction arrows. ↑ rising, ↓ falling.',
                },
              ].map(item => (
                <div key={item.icon} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: C.tx, fontSize: 14, marginBottom: 4 }}>
                      {lang === 'zh' ? item.titleZh : item.titleEn}
                    </div>
                    <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                      {lang === 'zh' ? item.descZh : item.descEn}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CICollapsible>
        </div>

        {/* ── Section 4: Connecting Platforms ── */}
        <div style={card}>
          <CICollapsible title={lang === 'zh' ? '连接平台账号' : 'Connecting Platforms'}>
            <div style={{ fontSize: 13, color: C.t2, marginBottom: 16, lineHeight: 1.7 }}>
              {lang === 'zh'
                ? '连接平台账号后，系统可获取生意参谋、小红书、抖音的深度数据，提升评分准确度。'
                : 'Connecting platform accounts gives access to deeper analytics from 生意参谋, XHS, and Douyin, improving score accuracy.'}
            </div>
            <div style={{ fontWeight: 700, color: C.tx, marginBottom: 10, fontSize: 14 }}>
              {lang === 'zh' ? '如何连接：' : 'How to connect:'}
            </div>
            <Step num={1} C={Cc} text={lang === 'zh' ? '在浏览器中登录对应平台（生意参谋/小红书/抖音）' : 'Log into the platform in your browser (SYCM / XHS / Douyin)'} />
            <Step num={2} C={Cc} text={lang === 'zh' ? '按 F12 打开开发者工具 → 应用（Application）→ Cookies' : 'Press F12 → Application → Cookies'} />
            <Step num={3} C={Cc} text={lang === 'zh' ? '找到对应域名，复制所有 Cookie 内容' : 'Find the platform domain and copy all cookie values'} />
            <Step num={4} C={Cc} text={lang === 'zh' ? '在「设置 → 连接账号」粘贴 Cookie' : 'Paste into Settings → Platform Connections'} />
            <div style={{ marginTop: 14, padding: '12px 16px', background: `${'#f59e0b'}14`, borderLeft: `3px solid ${'#f59e0b'}`, borderRadius: 8, fontSize: 13, color: C.t2 }}>
              {lang === 'zh'
                ? 'Cookie 通常每24–48小时过期，过期后设置页面将显示 ❌ 状态，粘贴新的 Cookie 即可重新连接。'
                : 'Cookies expire every 24–48 hours. You\'ll see a ❌ status in Settings. Paste fresh cookies to reconnect.'}
            </div>
          </CICollapsible>
        </div>

        {/* ── Section 5: Scraping Agent ── */}
        <div style={card}>
          <CICollapsible title={lang === 'zh' ? '运行采集工具（高级）' : 'Running the Scraping Agent (Advanced)'}>
            <div style={{ fontSize: 13, color: C.t2, marginBottom: 16, lineHeight: 1.7 }}>
              {lang === 'zh'
                ? '采集工具是一个本地 Python 脚本，在你的电脑上运行，自动从小红书等平台采集竞品数据并推送到仪表盘。适合需要实时数据的高级用户。'
                : 'The scraping agent is a local Python script that runs on your computer, collects competitor data from XHS, and pushes it to your dashboard. For advanced users who need real-time data.'}
            </div>
            {[
              {
                label: lang === 'zh' ? '安装' : 'Install',
                code: 'cd tools/scrape-agent\nbash install.sh',
              },
              {
                label: lang === 'zh' ? '登录平台' : 'Login',
                code: 'python3 agent.py --login',
              },
              {
                label: lang === 'zh' ? '采集数据' : 'Scrape',
                code: 'python3 agent.py\n# or dry-run first:\npython3 agent.py --dry-run --brand Songmont',
              },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{item.label}</div>
                <pre style={{
                  background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8,
                  padding: '10px 14px', fontSize: 12, color: C.tx,
                  fontFamily: 'monospace', margin: 0, overflowX: 'auto',
                  whiteSpace: 'pre',
                }}>{item.code}</pre>
              </div>
            ))}
            <div style={{ fontSize: 13, color: C.t3, marginTop: 8 }}>
              {lang === 'zh'
                ? '采集工具可在任意电脑上运行，多台电脑可分别采集不同平台的数据。'
                : 'The agent can run on any computer. Multiple computers can scrape different platforms simultaneously.'}
            </div>
          </CICollapsible>
        </div>

        {/* ── Section 6: Exporting Reports ── */}
        <div style={card}>
          <CICollapsible title={lang === 'zh' ? '导出报告' : 'Exporting Reports'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '12px 16px', background: C.s2, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: C.tx, marginBottom: 4, fontSize: 14 }}>
                  {lang === 'zh' ? 'CSV 下载' : 'CSV Download'}
                </div>
                <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                  {lang === 'zh'
                    ? '下载包含所有竞品评分和数据的电子表格。文件采用 UTF-8 BOM 编码，可直接用中文版 Excel 打开，中文不乱码。'
                    : 'Downloads a spreadsheet with all competitor scores and data. Uses UTF-8 BOM encoding for full compatibility with Chinese Excel — no garbled characters.'}
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: C.s2, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: C.tx, marginBottom: 4, fontSize: 14 }}>
                  {lang === 'zh' ? 'PDF 导出' : 'PDF Export'}
                </div>
                <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                  {lang === 'zh'
                    ? '打开浏览器打印对话框，选择「另存为 PDF」。适合制作会议汇报材料。打印时会自动隐藏导航栏，只保留报告内容。'
                    : 'Opens the browser print dialog. Choose "Save as PDF" to create a meeting-ready report. Navigation is hidden automatically in print mode.'}
                </div>
              </div>
            </div>
          </CICollapsible>
        </div>

        {/* ── Section 7: FAQ ── */}
        <div style={card}>
          <CICollapsible title={lang === 'zh' ? '常见问题' : 'FAQ'}>
            <QA C={Cc}
              q={lang === 'zh' ? '数据多久更新一次？' : 'How often is data updated?'}
              a={lang === 'zh'
                ? '关注列表竞品：每日凌晨2点。全景竞品：每周一次。深度分析：随时按需触发。'
                : 'Watchlist: daily at 2am. Landscape: weekly. Deep dives: on-demand anytime.'}
            />
            <QA C={Cc}
              q={lang === 'zh' ? 'Cookie 过期了怎么办？' : 'What if my cookies expire?'}
              a={lang === 'zh'
                ? '设置页面会显示 ❌ 状态，表示该账号已断开连接。重新登录平台，复制新的 Cookie 并粘贴即可。'
                : 'You\'ll see a ❌ status in Settings → Platform Connections. Re-login, copy fresh cookies, and paste.'}
            />
            <QA C={Cc}
              q={lang === 'zh' ? '能追踪10个以上的竞品吗？' : 'Can I track more than 10 competitors?'}
              a={lang === 'zh'
                ? '关注列表最多10个品牌（每日更新），全景列表不限数量（每周更新）。在竞品卡片上点击「Watchlist」标签可切换层级。'
                : 'Watchlist is limited to 10 brands (daily updates). Landscape has no limit (weekly updates). Click the tier badge on any competitor card to switch.'}
            />
            <QA C={Cc}
              q={lang === 'zh' ? '深度分析需要多长时间？' : 'How long does a deep dive take?'}
              a={lang === 'zh'
                ? '通常3–10分钟，取决于需要采集的平台数量。采集、评分、AI分析是流水线并行执行的，进度条会实时更新。'
                : 'Typically 3–10 minutes depending on platforms being scraped. Scraping, scoring, and AI narration run in parallel. The progress indicator updates in real time.'}
            />
            <QA C={Cc}
              q={lang === 'zh' ? '竞品情报和「智能体」有什么区别？' : 'How is this different from the 智能体 agent?'}
              a={lang === 'zh'
                ? '竞品情报是全定制化的：你选择竞品、设置自己的品牌、看自己的数据。「智能体」是为 OMI 预设的固定分析工具。'
                : 'CI vFinal is fully customizable — your competitors, your brand, your data. The 智能体 agent is a fixed pre-configured tool built for OMI.'}
            />
          </CICollapsible>
        </div>

        {/* Footer note */}
        <div style={{ textAlign: 'center', padding: '16px 0 8px', fontSize: 12, color: C.t3 }}>
          {lang === 'zh'
            ? '有其他问题？联系 Will 或 Joanna。'
            : 'Questions? Reach out to Will or Joanna.'}
        </div>
      </div>
    </div>
  );
}
