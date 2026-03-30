import { useState } from "react";
import type { CSSProperties } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowScout from "./pages/WorkflowScout";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";
import XhsWarroom from "./pages/XhsWarroom";
import MarketIntelligence from "./pages/MarketIntelligence";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

const navStyle: CSSProperties = {
  display: "flex",
  gap: "1.5rem",
  padding: "1rem 2rem",
  borderBottom: "1px solid #e0e0e0",
  backgroundColor: "#fafafa",
  fontFamily: "system-ui, sans-serif",
  alignItems: "center",
};

const linkStyle: CSSProperties = {
  textDecoration: "none",
  color: "#333",
  fontWeight: 500,
};

function Nav() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    localStorage.getItem("rebase_access") === "true"
  );
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("rebase_access");
    setIsLoggedIn(false);
    navigate("/login");
  }

  return (
    <nav style={navStyle}>
      <a href="/calculator.html" style={linkStyle}>Diagnostics</a>
      <Link to="/workflows" style={linkStyle}>流程扫描</Link>
      <Link to="/agents" style={linkStyle}>Agents</Link>
      <Link to="/costs" style={linkStyle}>Costs</Link>
      <Link to="/demo" style={linkStyle}>Demo Dashboard</Link>

      {/* Push login/logout to the right */}
      <span style={{ marginLeft: "auto" }}>
        {isLoggedIn ? (
          <button
            onClick={handleLogout}
            style={{ background: "none", border: "1px solid #ccc", borderRadius: 6, padding: "4px 14px", cursor: "pointer", color: "#666", fontSize: 14, fontWeight: 500 }}
          >
            Log out
          </button>
        ) : (
          <Link to="/login" style={{ ...linkStyle, color: "#06b6d4" }}>Log in</Link>
        )}
      </span>
    </nav>
  );
}

export default function App() {
  return (
    <div>
      <Nav />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<DiagnosticDashboard />} />
        <Route path="/demo" element={<DiagnosticDashboard />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Login />} />
        <Route path="/workflows" element={<WorkflowScout />} />

        {/* Protected routes — require access code */}
        <Route path="/agents" element={<ProtectedRoute><AgentMonitor /></ProtectedRoute>} />
        <Route path="/agents/xhs-content" element={<ProtectedRoute><XhsWarroom /></ProtectedRoute>} />
        <Route path="/agents/market-intelligence" element={<ProtectedRoute><MarketIntelligence /></ProtectedRoute>} />
        <Route path="/costs" element={<ProtectedRoute><CostDashboard /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}
