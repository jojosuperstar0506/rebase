import { useState, useRef } from "react";

const BG = "#0c0c14";
const S1 = "#14141e";
const S2 = "#1c1c28";
const BD = "#2a2a3a";
const AC = "#f59e0b";
const AC2 = "#d97706";
const TX = "#e4e4ec";
const T2 = "#9898a8";
const T3 = "#5c5c6c";

async function askAI(prompt) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) return "Error: " + data.error.message;
    if (data.content && data.content.length > 0) {
      return data.content.map(function(b) { return b.text || ""; }).join("");
    }
    return "No result";
  } catch (e) {
    return "Request failed: " + e.message;
  }
}

function Md({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: 13, lineHeight: 1.85, color: TX }}>
      {lines.map(function(ln, i) {
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
        const rendered = parts.map(function(p, j) {
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

function FileTextArea({ value, onChange, placeholder, rows }) {
  const fRef = useRef(null);
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { onChange(e.target.result); };
    reader.readAsText(file);
  }
  return (
    <div style={{ position: "relative" }}>
      <textarea
        value={value}
        onChange={function(e) { onChange(e.target.value); }}
        placeholder={placeholder}
        rows={rows || 6}
        onDragOver={function(e) { e.preventDefault(); }}
        onDrop={function(e) { e.preventDefault(); if (e.dataTransfer.files[0]) { handleFile(e.dataTransfer.files[0]); } }}
        style={{
          width: "100%", background: BG, border: "1px solid " + BD, borderRadius: 8,
          padding: 12, color: TX, fontSize: 13, resize: "vertical", outline: "none",
          fontFamily: "inherit", boxSizing: "border-box",
        }}
      />
      <button
        onClick={function() { if (fRef.current) { fRef.current.click(); } }}
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
        onChange={function(e) { if (e.target.files && e.target.files[0]) { handleFile(e.target.files[0]); } }}
      />
    </div>
  );
}

function Field({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={function(e) { onChange(e.target.value); }}
      placeholder={placeholder}
      style={{
        width: "100%", background: BG, border: "1px solid " + BD, borderRadius: 8,
        padding: "9px 12px", color: TX, fontSize: 13, outline: "none",
        fontFamily: "inherit", boxSizing: "border-box",
      }}
    />
  );
}

function RunBtn({ onClick, disabled, children }) {
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

function Lbl({ children }) {
  return <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 5 }}>{children}</div>;
}

function ResultBox({ result, loading }) {
  return (
    <div style={{
      background: S1, border: "1px solid " + BD, borderRadius: 10,
      padding: 18, minHeight: 120, maxHeight: "55vh", overflow: "auto",
    }}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: AC, animation: "blink 1s infinite" }} />
          <span style={{ fontSize: 12, color: AC }}>AI \u5206\u6790\u4e2d\uff0c\u8bf7\u7a0d\u5019...</span>
        </div>
      )}
      {result ? <Md text={result} /> : null}
      {!result && !loading ? (
        <div style={{ textAlign: "center", color: T3, padding: "30px 0", fontSize: 13 }}>
          {"\u8f93\u5165\u6570\u636e\u540e\u70b9\u51fb\u6309\u94ae\uff0c\u5206\u6790\u7ed3\u679c\u5c06\u5728\u6b64\u663e\u793a"}
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
      "\u4f60\u662f\u4e00\u4f4d\u8d44\u6df1\u7684\u5c0f\u7ea2\u4e66\u5185\u5bb9\u7b56\u7565\u5206\u6790\u5e08\u3002",
      product ? ("\u4ea7\u54c1\u80cc\u666f\uff1a" + product) : "",
      "\u57fa\u4e8e\u4ee5\u4e0b\u5c0f\u7ea2\u4e66\u7b14\u8bb0\u6570\u636e\uff0c\u8fdb\u884c\u6df1\u5ea6\u7ade\u54c1\u5206\u6790\uff1a",
      "",
      "\u5206\u6790\u7ef4\u5ea6\uff1a",
      "\u4e00\u3001\u7206\u6b3e\u56e0\u5b50\u8bc6\u522b\uff08\u6570\u636e\u5206\u5c42\uff1a\u5934\u90e810%/\u8170\u90e830%/\u5c3e\u90e860%\uff0c\u6807\u9898\u7279\u5f81\uff0c\u5173\u952e\u53d8\u91cftop5\uff09",
      "\u4e8c\u3001\u7528\u6237\u6d1e\u5bdf\uff08\u529f\u80fd\u6027/\u60c5\u611f\u6027/\u793e\u4ea4\u6027\u9700\u6c42\uff0c\u75db\u70b9-\u723d\u70b9-\u75d2\u70b9\uff09",
      "\u4e09\u3001\u6807\u9898\u516c\u5f0f\uff086\u79cd\u7c7b\u578b\u54043-5\u4e2a\u6a21\u677f + \u94a9\u5b50\u6280\u5de7\uff09",
      "\u56db\u3001\u5185\u5bb9\u7ed3\u6784\u62c6\u89e3\uff08\u9ec4\u91d1\u5f00\u5934 + \u4e2d\u6bb5\u4ef7\u503c\u5bc6\u5ea6 + \u7ed3\u5c3e\u884c\u52a8\u6307\u4ee4\uff09",
      "\u4e94\u3001\u5173\u952e\u8bcd\u4f53\u7cfb\uff08\u6838\u5fc3\u8bcd/\u573a\u666f\u8bcd/\u60c5\u7eea\u8bcd/\u884c\u52a8\u8bcd + \u9ad8\u9891\u8bcdtop20\uff09",
      "\u516d\u3001Tag\u7b56\u7565\uff08\u5206\u7c7b + \u7ec4\u5408\u516c\u5f0f + \u4f4e\u7ade\u4e89\u9ad8\u6f5c\u529btag\uff09",
      "\u4e03\u3001\u5dee\u5f02\u5316\u673a\u4f1a\uff08\u7a7a\u767d\u70b9 + \u540c\u8d28\u5316\u9677\u9631 + 3-5\u4e2a\u7834\u5c40\u89d2\u5ea6\uff09",
      "\u516b\u3001\u5b9e\u6218\u8f93\u51fa\uff1a10\u4e2a\u7206\u6b3e\u6807\u9898 + 20\u4e2a\u9ad8\u6f5c\u529btag + \u9009\u9898\u65b9\u5411",
      "",
      "\u6bcf\u4e2a\u7ed3\u8bba\u7528\u6570\u636e\u652f\u6491\u3002\u5173\u6ce8\u4e3a\u4ec0\u4e48\u6709\u6548\u3002\u63d0\u4f9b\u53cd\u76f4\u89c9\u6d1e\u5bdf\u3002",
      "",
      "\u7b14\u8bb0\u6570\u636e\uff1a",
      posts
    ];
    askAI(lines.join("\n")).then(function(r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Lbl>{"\u4ea7\u54c1\u4fe1\u606f\uff08\u53ef\u9009\uff09"}</Lbl>
        <Field value={product} onChange={setProduct} placeholder="OMI Bags \u8f7b\u5962\u901a\u52e4\u5305\uff0c25-35\u5c81\u804c\u573a\u5973\u6027" />
      </div>
      <div>
        <Lbl>{"\u7ade\u54c1\u7b14\u8bb0\u6570\u636e\uff08\u7c98\u8d34\u6216\u62d6\u5165CSV\uff09"}</Lbl>
        <FileTextArea value={posts} onChange={setPosts} rows={7} placeholder={"\u7c98\u8d34\u7ade\u54c1\u7b14\u8bb0\uff0c\u683c\u5f0f\u793a\u4f8b\uff1a\n\n\u6807\u9898: \u8fd95\u53ea\u5305\u8ba9\u6211\u6574\u4e2a\u79cb\u5929\u90fd\u5f88\u597d\u770b\n\u6b63\u6587: \u4f5c\u4e3a\u4e00\u4e2a\u901a\u52e4\u65cf...\n\u8bdd\u9898: #\u5305\u5305\u63a8\u8350 #\u901a\u52e4\u5305\n\u6570\u636e: \u70b9\u8d5e1.2w \u6536\u85cf8k\n---"} />
      </div>
      <RunBtn onClick={run} disabled={busy || !posts.trim()}>{busy ? "\u23f3 \u6df1\u5ea6\u5206\u6790\u4e2d..." : "\ud83d\udd0d \u5f00\u59cb\u7ade\u54c1\u5206\u6790"}</RunBtn>
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
      "\u4f60\u662f\u4e00\u4f4d\u9876\u5c16\u7684\u5185\u5bb9\u7535\u5546\u5206\u6790\u5e08\u3001\u7528\u6237\u6d1e\u5bdf\u4e13\u5bb6\u3002",
      "",
      "\u54c1\u7c7b\u8bcd\uff1a" + cat,
      "\u957f\u5c3e\u8bcd\uff1a" + tail,
      "",
      "\u8bf7\u8f93\u51fa\uff1a",
      "\u4e00\u3001\u5173\u952e\u8bcd\u7528\u6237\u9700\u6c42\u6d1e\u5bdf\uff08\u641c\u7d22\u771f\u5b9e\u610f\u56fe + \u4e09\u5927\u6838\u5fc3\u56e0\u7d20 + \u60c5\u7eea/\u529f\u80fd/\u573a\u666f\u75db\u70b9\uff09",
      "\u4e8c\u3001\u5185\u5bb9\u673a\u4f1a\u70b9\u5206\u6790\uff08\u9971\u548c\u5ea6 + \u6700\u6613\u7206\u7c7b\u578b + \u65e0\u4eba\u505a\u7684\u89d2\u5ea6\uff09",
      "\u4e09\u3001\u7b14\u8bb0\u7c7b\u578b\u6846\u67b6\uff085\u79cd\u6700\u6613\u7206\uff1a\u540e\u6094\u4f53/\u5bf9\u6bd4\u4f53/\u65b9\u6848\u4f53/\u79d1\u666e\u4f53/\u6539\u9020\u4f53\uff0c\u6bcf\u7c7b\u7ed9\u6807\u9898\u6a21\u677f+\u5185\u5bb9\u7ed3\u6784\uff09",
      "\u56db\u3001\u7ade\u54c1\u5206\u6790\uff08\u5934\u90e8\u4ee3\u8868 + \u7206\u6b3e\u505a\u6cd5 + \u54c1\u724c\u9732\u51fa\u7387\uff09",
      "\u4e94\u3001\u54c1\u724c\u5165\u5c40\u673a\u4f1a\uff08\u6700\u9002\u5408\u5360\u9886\u7684\u8bcd + \u5982\u4f55\u6210\u4e3a\u7b2c\u4e00\u54c1\u724c + \u5dee\u5f02\u5316\u7b56\u7565\uff09",
      "\u516d\u3001\u9009\u9898\u6c60\uff1a20\u4e2a\u9ad8\u7206\u9009\u9898",
      "\u4e03\u3001\u5185\u5bb9\u751f\u4ea7\u5efa\u8bae\uff08\u56fe\u6587or\u89c6\u9891 + \u5c01\u9762 + \u6807\u9898\u60c5\u7eea\u5f3a\u5ea6 + CTA + \u6807\u7b7e\u6570\u91cf\uff09",
      "",
      "\u4e13\u4e1a\u3001\u7ed3\u6784\u5316\u3001\u53ef\u76f4\u63a5\u6267\u884c\u3002"
    ];
    askAI(lines.join("\n")).then(function(r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><Lbl>{"\u54c1\u7c7b\u8bcd"}</Lbl><Field value={cat} onChange={setCat} placeholder={"\u4f8b\uff1a\u5305\u5305\u3001\u901a\u52e4\u5305"} /></div>
        <div><Lbl>{"\u957f\u5c3e\u8bcd"}</Lbl><Field value={tail} onChange={setTail} placeholder={"\u4f8b\uff1a\u65e0logo\u5c0f\u4f17\u725b\u76ae\u5305\u5305"} /></div>
      </div>
      <RunBtn onClick={run} disabled={busy || !cat.trim() || !tail.trim()}>{busy ? "\u23f3 \u6316\u6398\u84dd\u6d77\u4e2d..." : "\ud83c\udfaf \u5206\u6790\u957f\u5c3e\u8bcd"}</RunBtn>
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
      "\u4f60\u662f\u4e00\u4f4d\u9876\u7ea7\u5185\u5bb9\u7535\u5546\u51b3\u7b56\u8def\u5f84\u5206\u6790\u4e13\u5bb6\u3002\u76ee\u6807\uff1a\u4e3a\u5185\u5bb9\u5de5\u5382\u63d0\u53d6SOP\u7ea7\u522b\u7684\u5143\u7d20\u5e93\u3002",
      product ? ("\u4ea7\u54c1\uff1a" + product) : "",
      "",
      "\u6309\u4e0b\u97627\u6bb5\u7528\u6237\u51b3\u7b56\u8def\u5f84\u6a21\u578b\u62c6\u89e3\uff1a",
      "1. Attention - \u6ce8\u610f\u529b\u89e6\u53d1\uff0815+\u6761\u9ad8\u9891\u89e6\u53d1\u8bed\u8a00\u7ed3\u6784\uff0c\u6807\u6ce8\u6050\u60e7/\u540e\u6094/\u53cd\u5dee/\u8eab\u4efd\u4ee3\u5165\uff09",
      "2. Relevance - \u8eab\u4efd\u786e\u8ba4\uff0810-15\u4e2a\u6700\u9ad8\u8f6c\u5316\u786e\u8ba4\u8868\u8fbe\u6a21\u677f\uff09",
      "3. Empathy - \u4ee3\u5165\u611f\u753b\u9762\uff0815+\u4e2a\u771f\u5b9e\u5177\u4f53\u751f\u6d3b\u753b\u9762\uff0c\u6807\u6ce8\u60c5\u7eea\uff09",
      "4. Value - \u4ef7\u503c\u9884\u671f\uff08\u7ed3\u679c\u578b\u627f\u8bfa + \u529f\u80fd\u2192\u7ed3\u679c\u8f6c\u8bd1\uff09",
      "5. Trust - \u4fe1\u4efb\u6784\u5efa\uff0815+\u79cd\u65b9\u5f0f\uff0c\u5206\u7c7b\uff1a\u65f6\u95f4/\u8eab\u4efd/\u6570\u636e/\u7fa4\u4f53/\u4e13\u4e1a\uff09",
      "6. Reasoning - \u53cd\u8ba4\u77e5\uff0810-15\u6761\u53cd\u76f4\u89c9\u89c2\u70b9\uff09",
      "7. Action - \u884c\u52a8\u89e6\u53d1\u5668\uff08\u6536\u85cf/\u54a8\u8be2/\u8f6c\u53d1/\u52a0\u8d2d\uff09",
      "",
      "\u8f93\u51fa\u300a7\u6bb5\u7528\u6237\u51b3\u7b56\u8def\u5f84 \u5185\u5bb9\u5143\u7d20\u4e2d\u53f0\u300b\u3002",
      "",
      "\u7b14\u8bb0\u6570\u636e\uff1a",
      posts
    ];
    askAI(lines.join("\n")).then(function(r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Lbl>{"\u4ea7\u54c1\u4fe1\u606f\uff08\u53ef\u9009\uff09"}</Lbl>
        <Field value={product} onChange={setProduct} placeholder="OMI \u57ce\u5e02\u901a\u52e4\u7cfb\u5217" />
      </div>
      <div>
        <Lbl>{"\u7b14\u8bb0\u8bed\u6599\uff08\u7c98\u8d34\u6216\u62d6\u5165CSV\uff09"}</Lbl>
        <FileTextArea value={posts} onChange={setPosts} rows={7} placeholder={"\u7c98\u8d34200-300\u7bc7\u7b14\u8bb0\u7684\u6807\u9898+\u6b63\u6587\n\nAI\u5c06\u62c67\u6bb5\u51b3\u7b56\u8def\u5f84\u62c6\u89e3\uff1a\nAttention > Relevance > Empathy > Value > Trust > Reasoning > Action"} />
      </div>
      <RunBtn onClick={run} disabled={busy || !posts.trim()}>{busy ? "\u23f3 \u62c6\u89e3\u51b3\u7b56\u8def\u5f84..." : "\ud83e\udde0 \u51b3\u7b56\u8def\u5f84\u5206\u6790"}</RunBtn>
      <ResultBox result={result} loading={busy} />
    </div>
  );
}

function Tab4() {
  const [kw, setKw] = useState("");
  const [product, setProduct] = useState("");
  const [noteStyle, setNoteStyle] = useState("\u79cd\u8349\u4f53");
  const [elements, setElements] = useState("");
  const [count, setCount] = useState("2");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const styleOptions = [
    "\u79cd\u8349\u4f53", "\u540e\u6094\u4f53", "\u5bf9\u6bd4\u4f53", "\u65b9\u6848\u4f53",
    "\u79d1\u666e\u4f53", "\u6539\u9020\u4f53", "\u6d4b\u8bc4\u4f53", "\u907f\u5751\u4f53"
  ];

  function run() {
    setBusy(true);
    setResult("");
    const lines = [
      "\u4f60\u662f\u4e00\u4f4d\u5c0f\u7ea2\u4e66\u5185\u5bb9\u521b\u4f5c\u4e13\u5bb6\u3002\u8bf7\u751f\u6210" + count + "\u7bc7\u53ef\u76f4\u63a5\u53d1\u5e03\u7684\u5c0f\u7ea2\u4e66\u7b14\u8bb0\u3002",
      "",
      "\u4ea7\u54c1\uff1a" + (product || "\u901a\u7528"),
      "\u76ee\u6807\u957f\u5c3e\u8bcd\uff1a" + kw,
      "\u7b14\u8bb0\u98ce\u683c\uff1a" + noteStyle,
      elements ? ("\u53c2\u8003\u5143\u7d20\u5e93\uff1a\n" + elements) : "",
      "",
      "\u8981\u6c42\uff1a",
      "1. \u6bcf\u7bc7\u5305\u542b\uff1a\u6807\u9898 + \u6b63\u6587(800-1200\u5b57) + \u8bdd\u9898tag(5-8\u4e2a) + \u914d\u56fe\u5efa\u8bae",
      "2. \u5f00\u594850\u5b57\u5fc5\u987b\u6709\u5f3a\u94a9\u5b50",
      "3. \u878d\u5165\u51b3\u7b56\u8def\u5f84\u5fc3\u7406\u89e6\u53d1",
      "4. \u6709\u4eba\u611f\uff0c\u50cf\u771f\u4eba\u5206\u4eab",
      "5. \u6bcf\u7bc7\u7ed3\u6784\u5dee\u5f02\u5316",
      "6. \u7ed3\u5c3e\u6709\u884c\u52a8\u5f15\u5bfc",
      "7. \u7ed93\u4e2a\u5907\u9009\u6807\u9898",
      "",
      "\u76f4\u63a5\u8f93\u51fa\u53ef\u53d1\u5e03\u5185\u5bb9\u3002"
    ];
    askAI(lines.join("\n")).then(function(r) { setResult(r); setBusy(false); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><Lbl>{"\u957f\u5c3e\u5173\u952e\u8bcd *"}</Lbl><Field value={kw} onChange={setKw} placeholder={"\u4f8b\uff1a\u65e0logo\u5c0f\u4f17\u725b\u76ae\u5305\u5305"} /></div>
        <div><Lbl>{"\u4ea7\u54c1"}</Lbl><Field value={product} onChange={setProduct} placeholder="OMI \u57ce\u5e02\u901a\u52e4\u7cfb\u5217" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <Lbl>{"\u7b14\u8bb0\u98ce\u683c"}</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {styleOptions.map(function(s) {
              return (
                <button key={s} onClick={function() { setNoteStyle(s); }} style={{
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
          <Lbl>{"\u7bc7\u6570"}</Lbl>
          <select value={count} onChange={function(e) { setCount(e.target.value); }} style={{
            background: BG, border: "1px solid " + BD, borderRadius: 8,
            padding: "8px 12px", color: TX, fontSize: 13, fontFamily: "inherit",
          }}>
            <option value="1">{"1\u7bc7"}</option>
            <option value="2">{"2\u7bc7"}</option>
            <option value="3">{"3\u7bc7"}</option>
            <option value="5">{"5\u7bc7"}</option>
          </select>
        </div>
      </div>
      <div>
        <Lbl>{"\u5143\u7d20\u5e93\u53c2\u8003\uff08\u53ef\u4ece\u51b3\u7b56\u8def\u5f84\u7ed3\u679c\u590d\u5236\u8fc7\u6765\uff09"}</Lbl>
        <FileTextArea value={elements} onChange={setElements} rows={4} placeholder={"\u53ef\u9009 - \u7c98\u8d34\u51b3\u7b56\u8def\u5f84\u5206\u6790\u4e2d\u7684\u5143\u7d20\u5e93"} />
      </div>
      <RunBtn onClick={run} disabled={busy || !kw.trim()}>{busy ? "\u23f3 \u6b63\u5728\u521b\u4f5c..." : "\u270d\ufe0f \u751f\u6210\u7206\u6b3e\u7b14\u8bb0"}</RunBtn>
      <ResultBox result={result} loading={busy} />
    </div>
  );
}

const ALL_TABS = [
  { id: "t1", label: "\u7ade\u54c1\u5206\u6790", icon: "\ud83d\udd0d", Comp: Tab1 },
  { id: "t2", label: "\u957f\u5c3e\u8bcd", icon: "\ud83c\udfaf", Comp: Tab2 },
  { id: "t3", label: "\u51b3\u7b56\u8def\u5f84", icon: "\ud83e\udde0", Comp: Tab3 },
  { id: "t4", label: "\u5185\u5bb9\u751f\u6210", icon: "\u270d\ufe0f", Comp: Tab4 },
];

export default function App() {
  const [tab, setTab] = useState("t1");
  const found = ALL_TABS.find(function(t) { return t.id === tab; });
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
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{"OMI \u5185\u5bb9\u4f5c\u6218\u5ba4"}</div>
            <div style={{ fontSize: 11, color: T3 }}>{"\u5c0f\u7ea2\u4e66\u7206\u6b3e\u5185\u5bb9\u5de5\u4e1a\u5316 \u00b7 AI\u9a71\u52a8"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {ALL_TABS.map(function(t, i) {
            return (
              <button key={t.id} onClick={function() { setTab(t.id); }} style={{
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
          {ALL_TABS.map(function(t, i) {
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
