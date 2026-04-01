import { useApp } from "../../context/AppContext";

interface ComparisonToggleProps {
  view: "original" | "optimized";
  onViewChange: (view: "original" | "optimized") => void;
}

export default function ComparisonToggle({ view, onViewChange }: ComparisonToggleProps) {
  const { colors: C } = useApp();

  const btnBase: React.CSSProperties = {
    padding: "8px 18px",
    borderRadius: 6,
    border: "none",
    fontSize: 13,
    fontWeight: 400,
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
    transition: "background 0.2s ease, color 0.2s ease",
    whiteSpace: "nowrap",
  };

  const activeStyle: React.CSSProperties = {
    ...btnBase,
    background: C.ac,
    color: "#000",
    fontWeight: 700,
  };

  const inactiveStyle: React.CSSProperties = {
    ...btnBase,
    background: "transparent",
    color: C.t2,
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
      <div style={{ display: "inline-flex", background: C.s2, borderRadius: 8, padding: 4, gap: 2 }}>
        <button onClick={() => onViewChange("original")} style={view === "original" ? activeStyle : inactiveStyle}>
          ● 当前流程 Current
        </button>
        <button onClick={() => onViewChange("optimized")} style={view === "optimized" ? activeStyle : inactiveStyle}>
          🏆 行业标杆 Best-in-Class
        </button>
      </div>
    </div>
  );
}
