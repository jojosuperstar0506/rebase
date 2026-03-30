import { Routes, Route, Link } from "react-router-dom";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowScout from "./pages/WorkflowScout";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";
import XhsWarroom from "./pages/XhsWarroom";
import MarketIntelligence from "./pages/MarketIntelligence";

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
        <a href="/calculator.html" style={linkStyle}>
          Diagnostics
        </a>
        <Link to="/workflows" style={linkStyle}>
          流程扫描
        </Link>
        <Link to="/agents" style={linkStyle}>
          Agents
        </Link>
        <Link to="/costs" style={linkStyle}>
          Costs
        </Link>
        <Link to="/demo" style={linkStyle}>
          Demo Dashboard
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<DiagnosticDashboard />} />
        <Route path="/demo" element={<DiagnosticDashboard />} />
        <Route path="/workflows" element={<WorkflowScout />} />
        <Route path="/agents" element={<AgentMonitor />} />
        <Route path="/agents/xhs-content" element={<XhsWarroom />} />
        <Route path="/agents/market-intelligence" element={<MarketIntelligence />} />
        <Route path="/costs" element={<CostDashboard />} />
      </Routes>
    </div>
  );
}
