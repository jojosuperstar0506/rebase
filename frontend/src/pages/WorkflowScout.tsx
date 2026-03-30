import { useState } from "react";
import type { ScoutState } from "../types/workflow";
import IntakePanel from "../components/workflow/IntakePanel";
import LoadingView from "../components/workflow/LoadingView";
import SummaryBar from "../components/workflow/SummaryBar";
import GraphView from "../components/workflow/GraphView";

// Design tokens
const BG = "#0c0c14";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const T2 = "#9898a8";

export default function WorkflowScout() {
  const [state, setState] = useState<ScoutState>({
    status: "idle",
    description: "",
    files: [],
    result: null,
    error: null,
    selectedNodeId: null,
  });

  async function handleSubmit() {
    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      const formData = new FormData();
      formData.append("description", state.description);
      for (const file of state.files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/workflow-scout", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setState((s) => ({ ...s, status: "ready", result: data }));
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {state.status === "idle" && (
        <IntakePanel
          description={state.description}
          files={state.files}
          onDescriptionChange={(d) =>
            setState((s) => ({ ...s, description: d }))
          }
          onFilesChange={(f) => setState((s) => ({ ...s, files: f }))}
          onSubmit={handleSubmit}
        />
      )}
      {state.status === "loading" && <LoadingView />}
      {state.status === "ready" && state.result && (
        <div>
          <SummaryBar analysis={state.result.analysis} />
          <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 200px)" }}>
            <div style={{ flex: "0 0 60%", borderRight: `1px solid ${BD}`, padding: 24 }}>
              <GraphView
                graph={state.result.graph}
                bottlenecks={state.result.analysis.bottlenecks}
                selectedNodeId={state.selectedNodeId}
                onNodeClick={(id) => setState((s) => ({ ...s, selectedNodeId: id }))}
              />
            </div>
            <div style={{ flex: "0 0 40%", padding: 24, overflowY: "auto" }}>
              {/* InsightsPanel placeholder — TASK-10 */}
              <div style={{ color: T2, padding: 40, textAlign: "center" }}>
                分析结果加载中... (TASK-10)
              </div>
            </div>
          </div>
          {/* Bottom bar with actions */}
          <div style={{ padding: "16px 24px", borderTop: `1px solid ${BD}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setState((s) => ({ ...s, status: "idle", result: null, error: null, description: "", files: [], selectedNodeId: null }))}
              style={{ padding: "8px 20px", background: "transparent", border: `1px solid ${BD}`, borderRadius: 6, color: T2, cursor: "pointer", fontSize: 14 }}
            >
              ← 重新扫描
            </button>
            <button
              style={{ padding: "10px 24px", background: AC, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              联系我们获取实施方案 →
            </button>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
          {/* Placeholder — TASK-14 will replace this */}
          <div style={{ fontSize: 18, color: "#ef4444" }}>分析失败</div>
          <div style={{ fontSize: 14, color: T2, marginTop: 8 }}>
            {state.error}
          </div>
          <button
            onClick={() =>
              setState((s) => ({ ...s, status: "idle", error: null }))
            }
            style={{
              marginTop: 16,
              padding: "8px 20px",
              background: "transparent",
              border: `1px solid ${BD}`,
              borderRadius: 6,
              color: T2,
              cursor: "pointer",
            }}
          >
            ← 重试
          </button>
        </div>
      )}
    </div>
  );
}
