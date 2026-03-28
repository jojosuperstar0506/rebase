import { Routes, Route, Link } from "react-router-dom";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowViewer from "./pages/WorkflowViewer";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  padding: "1rem 2rem",
  borderBottom: "1px solid #e0e0e0",
  backgroundColor: "#fafafa",
  fontFamily: "system-ui, sans-serif",
};

const linkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#333",
  fontWeight: 500,
};

export default function App() {
  return (
    <div>
      <nav style={navStyle}>
        <Link to="/" style={linkStyle}>
          Diagnostics
        </Link>
        <Link to="/workflows" style={linkStyle}>
          Workflows
        </Link>
        <Link to="/agents" style={linkStyle}>
          Agents
        </Link>
        <Link to="/costs" style={linkStyle}>
          Costs
        </Link>
        <a href="/competitor-intel.html" style={{...linkStyle, color: "#667eea", fontWeight: 700}}>
          竞品情报
        </a>
      </nav>
      <Routes>
        <Route path="/" element={<DiagnosticDashboard />} />
        <Route path="/workflows" element={<WorkflowViewer />} />
        <Route path="/agents" element={<AgentMonitor />} />
        <Route path="/costs" element={<CostDashboard />} />
      </Routes>
    </div>
  );
}
