import { Routes, Route, Link } from "react-router-dom";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowViewer from "./pages/WorkflowViewer";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";
import XhsWarroom from "./pages/XhsWarroom";
import MarketIntelligence from "./pages/MarketIntelligence";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

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
          Workflows
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
        {/* Public routes */}
        <Route path="/" element={<DiagnosticDashboard />} />
        <Route path="/demo" element={<DiagnosticDashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Login />} />

        {/* Protected routes — require access code */}
        <Route path="/workflows" element={<ProtectedRoute><WorkflowViewer /></ProtectedRoute>} />
        <Route path="/agents" element={<ProtectedRoute><AgentMonitor /></ProtectedRoute>} />
        <Route path="/agents/xhs-content" element={<ProtectedRoute><XhsWarroom /></ProtectedRoute>} />
        <Route path="/agents/market-intelligence" element={<ProtectedRoute><MarketIntelligence /></ProtectedRoute>} />
        <Route path="/costs" element={<ProtectedRoute><CostDashboard /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}
