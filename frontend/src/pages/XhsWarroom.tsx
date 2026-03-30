import { useState, useRef } from "react";
import type { ReactNode } from "react";

const BG = "#0c0c14";
const S1 = "#14141e";
const S2 = "#1c1c28";
const BD = "#2a2a3a";
const AC = "#f59e0b";
const AC2 = "#d97706";
const TX = "#e4e4ec";
const T2 = "#9898a8";
const T3 = "#5c5c6c";

async function askAI(prompt: string): Promise<string> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) return "Error: " + (data.error.message || data.error);
    if (data.content && data.content.length > 0) {
      return data.content.map(function (b: { text?: string }) { return b.text || ""; }).join("");
    }
    return "No result";
  } catch (e: unknown) {
    return "Request failed: " + (e instanceof Error ? e.message : String(e));
  }
}

function Md({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: 13, lineHeight: 1.85, color: TX }}>
      {lines.map(function (ln, i) {
        const t = ln.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;
        if (t.indexOf("### ") === 0) {
          return <h4 key={i} style={{ fontSize: 14, fontWeight: 700, color: AC, margin: "14px 0 4px", borderBottom: "1px solid " + BD, paddingBottom: 4 }}>{t.substring(4)}</h4>;
        }
        if (t.indexOf("## ") === 0) {
          return <h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "18px 0 6px" }}>{t.substring(3)}</h3>;
        }
        if (t.indexOf("# ") === 0) {
          return <h2 key={i} style={{ fontSize: 18, fontWeight: 800, color: AC, margin: "22px 0 8px" }}>{t.substring(2)}</h2>;
        }
        const parts = t.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map(function (p, j) {
          if (p.indexOf("**") === 0 && p.lastIndexOf("**") === p.length - 2 && p.length > 4) {
            return <strong key={j} style={{ color: AC }}>{p.slice(2, -2)}</strong>;
          }
          return <span key={j}>{p}</span>;
        });
        if (t.indexOf("- ") === 0 || t.indexOf("\u2022 ") === 0) {
          return <div key={i} style={{ paddingLeft: 14, margin: "2px 0", position: "relative" }}><span style={{ position: "absolute", left: 0, color: AC }}>{"\u2022"}</span>{rendered}</div>;
        }
        if (t.match(/^\d+[.)]/)) {
          return <div key={i} style={{ paddingLeft: 6, margin: "2px 0", color: TX }}>{rendered}</div>;
        }
        return <p key={i} style={{ margin: "3px 0" }}>{rendered}</p>;
      })}
    </div>
  );
}

function FileTextArea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  const fRef = useRef<HTMLInputElement>(null);
  function handleFile(file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) { onChange(e.target?.result as string); };
    reader.readAsText(file);
  }
  return (
    <div style={{ position: "relative" }}>
      <textarea
        value={value}
        onChange={function (e) { onChange(e.target.value); }}
        placeholder={placeholder}
        rows={rows || 6}
        onDragOver={function (e) { e.preventDefault(); }}
        onDrop={function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) { handleFile(e.dataTransfer.files[0]); } }}
        style={{
          width: "100%", background: BG, border: "1px solid " + BD, borderRadius: 8,
          padding: 12, color: TX, fontSize: 13, resize: "vertical", outline: "none",
          fontFamily: "inherit", boxSizing: "border-box",
        }}
      />
      <button
        onClick={function () { if (fRef.current) { fRef.current.click(); } }}
        style={{
          position: "absolute", bottom: 8, right: 8, background: S2,
          border: "1px solid " + BD, borderRadius: 5, padding: "4px 10px",
          color: T2, fontSize: 11, cursor: "pointer",
        }}
      >
        {"\ud83d\udcce CSV"}
      </button>
      <input
        ref={fRef} type="file" accept=".csv,.txt"
        style={{ display: "none" }}
        onChange={function (e) { if (e.target.files && e.target.files[0]) { handleFile(e.target.files[0]); } }}
      />
    </div>
  );
}

function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={function (e) { onChange(e.target.value); }}
      placeholder={placeholder}
      style={{
        width: "100%", background: BG, border: "1px solid " + BD, borderRadius: 8,
        padding: "9px 12px", color: TX, fontSize: 13, outline: "none",
        fontFamily: "inherit", boxSizing: "border-box",
      }}
    />
  );
}

function RunBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? S2 : "linear-gradient(135deg, " + AC + ", " + AC2 + ")",
      border: "none", borderRadius: 8, padding: "11px 28px",
      color: disabled ? T3 : "#000", fontSize: 14, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}

function Lbl({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 5 }}>{children}</div>;
}

function ResultBox({ result, loading }: { result: string; loading: boolean }) {
  return (
    <div style={{
      background: S1, border: "1px solid " + BD, borderRadius: 10,
      padding: 18, minHeight: 120, maxHeight: "55vh", overflow: "auto",
    }}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: AC, animation: "blink 1s infinite" }} />
          <span style={{ fontSize: 12, color: AC }}>AI 分析中，请稍候...</span>
        </div>
      )}
      {result ? <Md text={result} /> : null}
      {!result && !loading ? (
        <div style={{ textAlign: "center", color: T3, padding: "30px 0", fontSize: 13 }}>
          输入数据后点击按钮，分析结果将在此显示
        </div>
      ) : null}
    </div>
  );
}

function Tab1() {
  const [posts, setPosts] = useState("");
  const [product, setProduct] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    setResult("");
    const lines = [
      "你是一位资深的小红书内容策略分析师。",
      product ? ("产品背景：" + product) : "",
      "基于以下小红书笔记数据，进行深度竞品分析：",
      "",
      "分析维度：",
      "一、爆款因子识别（数据分层：头部10%/腰部30%/尾部60%，标题特征，关键变量top5）",
      "二、用户洞察（功能性/情感性/社交性需求，痛点-爽点-痒点）",
      "三、标题公式（6种类型各3-5个模板 + 钩子技巧）",
      "四、内容结构拆解（黄金开头 + 中段价值密度 + 结尾行动指令）",
      "五、关键词体系（核心词/场景词/情绪词/行动词 + 高频词top20）",
      "六、Tag策略（分类 + 组合公式 + 低竞争高潜力tag）",
      "七、差异化机会（空白点 + 同质化陷阱 + 3-5个破局角度）",
      "八、实战输出：10个爆款标题 + 20个高潜力tag + 选题方向",
      "",
      "每个结论用数据支撑。关注为什么有效。提供反直觉洞察。",
      "",
      "笔记数据：",
      posts
    ];
    askAI(lines.join("\n")).then(function (r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Lbl>产品信息（可选）</Lbl>
        <Field value={product} onChange={setProduct} placeholder="OMI Bags 轻奢通勤包，25-35岁职场女性" />
      </div>
      <div>
        <Lbl>竞品笔记数据（粘贴或拖入CSV）</Lbl>
        <FileTextArea value={posts} onChange={setPosts} rows={7} placeholder={"粘贴竞品笔记，格式示例：\n\n标题: 这5只包让我整个秋天都很好看\n正文: 作为一个通勤族...\n话题: #包包推荐 #通勤包\n数据: 点赞1.2w 收藏8k\n---"} />
      </div>
      <RunBtn onClick={run} disabled={busy || !posts.trim()}>{busy ? "\u23f3 深度分析中..." : "\ud83d\udd0d 开始竞品分析"}</RunBtn>
      <ResultBox result={result} loading={busy} />
    </div>
  );
}

function Tab2() {
  const [cat, setCat] = useState("");
  const [tail, setTail] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    setResult("");
    const lines = [
      "你是一位顶尖的内容电商分析师、用户洞察专家。",
      "",
      "品类词：" + cat,
      "长尾词：" + tail,
      "",
      "请输出：",
      "一、关键词用户需求洞察（搜索真实意图 + 三大核心因素 + 情绪/功能/场景痛点）",
      "二、内容机会点分析（饱和度 + 最易爆类型 + 无人做的角度）",
      "三、笔记类型框架（5种最易爆：后悔体/对比体/方案体/科普体/改造体，每类给标题模板+内容结构）",
      "四、竞品分析（头部代表 + 爆款做法 + 品牌露出率）",
      "五、品牌入局机会（最适合占领的词 + 如何成为第一品牌 + 差异化策略）",
      "六、选题池：20个高爆选题",
      "七、内容生产建议（图文or视频 + 封面 + 标题情绪强度 + CTA + 标签数量）",
      "",
      "专业、结构化、可直接执行。"
    ];
    askAI(lines.join("\n")).then(function (r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><Lbl>品类词</Lbl><Field value={cat} onChange={setCat} placeholder="例：包包、通勤包" /></div>
        <div><Lbl>长尾词</Lbl><Field value={tail} onChange={setTail} placeholder="例：无logo小众牛皮包包" /></div>
      </div>
      <RunBtn onClick={run} disabled={busy || !cat.trim() || !tail.trim()}>{busy ? "\u23f3 挖掘蓝海中..." : "\ud83c\udfaf 分析长尾词"}</RunBtn>
      <ResultBox result={result} loading={busy} />
    </div>
  );
}

function Tab3() {
  const [posts, setPosts] = useState("");
  const [product, setProduct] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    setResult("");
    const lines = [
      "你是一位顶级内容电商决策路径分析专家。目标：为内容工厂提取SOP级别的元素库。",
      product ? ("产品：" + product) : "",
      "",
      "按下列7段用户决策路径模型拆解：",
      "1. Attention - 注意力触发（15+条高频触发语言结构，标注恐惧/后悔/反差/身份代入）",
      "2. Relevance - 身份确认（10-15个最高转化确认表达模板）",
      "3. Empathy - 代入感画面（15+个真实具体生活画面，标注情绪）",
      "4. Value - 价值预期（结果型承诺 + 功能→结果转译）",
      "5. Trust - 信任构建（15+种方式，分类：时间/身份/数据/群体/专业）",
      "6. Reasoning - 反认知（10-15条反直觉观点）",
      "7. Action - 行动触发器（收藏/咨询/转发/加购）",
      "",
      "输出《7段用户决策路径 内容元素中台》。",
      "",
      "笔记数据：",
      posts
    ];
    askAI(lines.join("\n")).then(function (r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Lbl>产品信息（可选）</Lbl>
        <Field value={product} onChange={setProduct} placeholder="OMI 城市通勤系列" />
      </div>
      <div>
        <Lbl>笔记语料（粘贴或拖入CSV）</Lbl>
        <FileTextArea value={posts} onChange={setPosts} rows={7} placeholder={"粘贴200-300篇笔记的标题+正文\n\nAI将按7段决策路径拆解：\nAttention > Relevance > Empathy > Value > Trust > Reasoning > Action"} />
      </div>
      <RunBtn onClick={run} disabled={busy || !posts.trim()}>{busy ? "\u23f3 拆解决策路径..." : "\ud83e\udde0 决策路径分析"}</RunBtn>
      <ResultBox result={result} loading={busy} />
    </div>
  );
}

function Tab4() {
  const [kw, setKw] = useState("");
  const [product, setProduct] = useState("");
  const [noteStyle, setNoteStyle] = useState("种草体");
  const [elements, setElements] = useState("");
  const [count, setCount] = useState("2");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const styleOptions = [
    "种草体", "后悔体", "对比体", "方案体",
    "科普体", "改造体", "测评体", "避坑体"
  ];

  function run() {
    setBusy(true);
    setResult("");
    const lines = [
      "你是一位小红书内容创作专家。请生成" + count + "篇可直接发布的小红书笔记。",
      "",
      "产品：" + (product || "通用"),
      "目标长尾词：" + kw,
      "笔记风格：" + noteStyle,
      elements ? ("参考元素库：\n" + elements) : "",
      "",
      "要求：",
      "1. 每篇包含：标题 + 正文(800-1200字) + 话题tag(5-8个) + 配图建议",
      "2. 开头50字必须有强钩子",
      "3. 融入决策路径心理触发",
      "4. 有人感，像真人分享",
      "5. 每篇结构差异化",
      "6. 结尾有行动引导",
      "7. 给3个备选标题",
      "",
      "直接输出可发布内容。"
    ];
    askAI(lines.join("\n")).then(function (r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><Lbl>长尾关键词 *</Lbl><Field value={kw} onChange={setKw} placeholder="例：无logo小众牛皮包包" /></div>
        <div><Lbl>产品</Lbl><Field value={product} onChange={setProduct} placeholder="OMI 城市通勤系列" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <Lbl>笔记风格</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {styleOptions.map(function (s) {
              return (
                <button key={s} onClick={function () { setNoteStyle(s); }} style={{
                  background: noteStyle === s ? AC : BG,
                  border: "1px solid " + (noteStyle === s ? AC : BD),
                  borderRadius: 6, padding: "5px 11px",
                  color: noteStyle === s ? "#000" : T2,
                  fontSize: 12, cursor: "pointer",
                  fontWeight: noteStyle === s ? 700 : 400,
                  fontFamily: "inherit",
                }}>{s}</button>
              );
            })}
          </div>
        </div>
        <div>
          <Lbl>篇数</Lbl>
          <select value={count} onChange={function (e) { setCount(e.target.value); }} style={{
            background: BG, border: "1px solid " + BD, borderRadius: 8,
            padding: "8px 12px", color: TX, fontSize: 13, fontFamily: "inherit",
          }}>
            <option value="1">1篇</option>
            <option value="2">2篇</option>
            <option value="3">3篇</option>
            <option value="5">5篇</option>
          </select>
        </div>
      </div>
      <div>
        <Lbl>元素库参考（可从决策路径结果复制过来）</Lbl>
        <FileTextArea value={elements} onChange={setElements} rows={4} placeholder="可选 - 粘贴决策路径分析中的元素库" />
      </div>
      <RunBtn onClick={run} disabled={busy || !kw.trim()}>{busy ? "\u23f3 正在创作..." : "\u270d\ufe0f 生成爆款笔记"}</RunBtn>
      <ResultBox result={result} loading={busy} />
    </div>
  );
}

const ALL_TABS = [
  { id: "t1", label: "竞品分析", icon: "\ud83d\udd0d", Comp: Tab1 },
  { id: "t2", label: "长尾词", icon: "\ud83c\udfaf", Comp: Tab2 },
  { id: "t3", label: "决策路径", icon: "\ud83e\udde0", Comp: Tab3 },
  { id: "t4", label: "内容生成", icon: "\u270d\ufe0f", Comp: Tab4 },
];

export default function XhsWarroom() {
  const [tab, setTab] = useState("t1");
  const found = ALL_TABS.find(function (t) { return t.id === tab; });
  const ActiveComp = found ? found.Comp : Tab1;

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: '"Noto Sans SC", "PingFang SC", system-ui, sans-serif', color: TX }}>
      <style>{[
        "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700;800&display=swap');",
        "* { box-sizing: border-box; }",
        "@keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: .3 } }",
        "::-webkit-scrollbar { width: 5px }",
        "::-webkit-scrollbar-thumb { background: " + BD + "; border-radius: 3px }"
      ].join("\n")}</style>

      <div style={{ borderBottom: "1px solid " + BD, padding: "18px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "linear-gradient(135deg, " + AC + ", " + AC2 + ")",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 900, color: "#000",
          }}>{"O"}</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>OMI 内容作战室</div>
            <div style={{ fontSize: 11, color: T3 }}>小红书爆款内容工业化 · AI驱动</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {ALL_TABS.map(function (t, i) {
            return (
              <button key={t.id} onClick={function () { setTab(t.id); }} style={{
                background: tab === t.id ? S1 : "transparent",
                border: "1px solid " + (tab === t.id ? BD : "transparent"),
                borderBottom: tab === t.id ? ("1px solid " + S1) : "none",
                borderRadius: "8px 8px 0 0", padding: "8px 16px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                position: "relative", bottom: -1, fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span style={{ fontSize: 13, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? "#fff" : T3 }}>
                  {String(i + 1) + ". " + t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "20px 24px 40px", maxWidth: 880 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
          padding: "8px 12px", background: S1, borderRadius: 7,
          border: "1px solid " + BD, fontSize: 11,
        }}>
          {ALL_TABS.map(function (t, i) {
            return (
              <span key={t.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: tab === t.id ? AC : "transparent",
                  border: "1px solid " + (tab === t.id ? AC : BD),
                  color: tab === t.id ? "#000" : T3,
                  fontSize: 10, fontWeight: 700,
                }}>{String(i + 1)}</span>
                <span style={{ color: tab === t.id ? "#fff" : T3, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
                {i < 3 ? <span style={{ color: T3, margin: "0 2px" }}>{"\u2192"}</span> : null}
              </span>
            );
          })}
        </div>
        <ActiveComp />
      </div>
    </div>
  );
}
