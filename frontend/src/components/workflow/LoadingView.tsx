import { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";

const MESSAGES = [
  { cn: "正在分析您的流程描述...",         en: "Analyzing your workflow description..." },
  { cn: "正在识别流程节点和依赖关系...",   en: "Identifying process nodes and dependencies..." },
  { cn: "正在对标行业最佳实践...",         en: "Benchmarking against industry best practices..." },
  { cn: "正在生成优化建议...",             en: "Generating optimization recommendations..." },
  { cn: "正在生成行业标杆对比...",         en: "Generating industry benchmark comparison..." },
];

const NODE_COUNT = 6;

export default function LoadingView() {
  const { colors: C } = useApp();
  const [messageIndex, setMessageIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [activeNodes, setActiveNodes] = useState(0);

  // Cycle messages every 2.5s with fade
  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => { setMessageIndex((i) => (i + 1) % MESSAGES.length); setFade(true); }, 200);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Animate nodes appearing one by one
  useEffect(() => {
    if (activeNodes >= NODE_COUNT) return;
    const timer = setTimeout(() => setActiveNodes((n) => n + 1), 400 + activeNodes * 350);
    return () => clearTimeout(timer);
  }, [activeNodes]);

  // Reset node animation when it completes, to loop
  useEffect(() => {
    if (activeNodes < NODE_COUNT) return;
    const timer = setTimeout(() => setActiveNodes(0), 2000);
    return () => clearTimeout(timer);
  }, [activeNodes]);

  const msg = MESSAGES[messageIndex];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
      {/* Workflow node animation */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 48 }}>
        {Array.from({ length: NODE_COUNT }).map((_, i) => {
          const isActive = i < activeNodes;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: isActive ? C.ac : "transparent", border: `2px solid ${isActive ? C.ac : C.bd}`, transition: "all 0.4s ease", opacity: isActive ? 1 : 0.3, boxShadow: isActive ? `0 0 10px ${C.ac}40` : "none" }} />
              {i < NODE_COUNT - 1 && (
                <div style={{ width: 32, height: 2, background: i < activeNodes - 1 ? C.ac : C.bd, transition: "background 0.4s ease", opacity: i < activeNodes - 1 ? 0.7 : 0.2 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ width: 240, height: 3, background: C.bd, borderRadius: 2, overflow: "hidden", marginBottom: 32 }}>
        <div style={{ width: `${((messageIndex + 1) / MESSAGES.length) * 100}%`, height: "100%", background: C.ac, borderRadius: 2, transition: "width 0.5s ease" }} />
      </div>

      {/* Messages */}
      <div style={{ textAlign: "center", opacity: fade ? 1 : 0, transition: "opacity 0.3s ease" }}>
        <div style={{ fontSize: 18, color: C.tx, fontWeight: 500 }}>{msg.cn}</div>
        <div style={{ fontSize: 14, color: C.t2, marginTop: 6 }}>{msg.en}</div>
      </div>
    </div>
  );
}
