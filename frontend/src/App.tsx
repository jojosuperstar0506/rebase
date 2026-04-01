import { useState } from "react";
import type { CSSProperties } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowScout from "./pages/WorkflowScout";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";
import XhsWarroom from "./pages/XhsWarroom";
import MarketIntelligence from "./pages/MarketIntelligence";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Home from "./pages/Home";
import ProtectedRoute from "./components/ProtectedRoute";

const NAV_BG = "#0c0c14";
const NAV_BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

const navWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 24px",
  height: 56,
  background: NAV_BG,
  borderBottom: `1px solid ${NAV_BD}`,
  fontFamily: "system-ui, sans-serif",
  position: "sticky",
  top: 0,
  zIndex: 100,
};

// Hide nav on login/onboarding — those pages are full-screen
const HIDE_NAV_ON = ["/login", "/onboarding"];

function NavLink({ to, children, highlight }: { to: string; children: React.ReactNode; highlight?: boolean }) {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      style={{
        textDecoration: "none",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        color: highlight ? AC : active ? TX : T2,
        padding: "6px 2px",
        borderBottom: active ? `2px solid ${AC}` : "2px solid transparent",
        transition: "color 0.15s",
      }}
    >
      {children}
    </Link>
  );
}

function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("rebase_token"));

  // Don't show nav on login and onboarding — those are standalone pages
  if (HIDE_NAV_ON.includes(location.pathname)) return null;

  function handleLogout() {
    localStorage.removeItem("rebase_token");
    setIsLoggedIn(false);
    navigate("/");
  }

  return (
    <nav style={navWrap}>
      {/* Logo */}
      <Link to="/" style={{ textDecoration: "none", fontSize: 18, fontWeight: 800, color: AC, marginRight: 32, letterSpacing: -0.5 }}>
        Rebase
      </Link>

      {/* Left links — always visible */}
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <a href="/calculator.html" style={{ textDecoration: "none", fontSize: 14, fontWeight: 400, color: T2 }}>
          Diagnostics
        </a>
        <NavLink to="/onboarding" highlight>Request Access</NavLink>

        {/* Client links — only when logged in */}
        {isLoggedIn && (
          <>
            <NavLink to="/agents">Agents</NavLink>
            <NavLink to="/costs">Costs</NavLink>
          </>
        )}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
        {/* Admin — always visible, password protected inside */}
        <NavLink to="/admin">Admin</NavLink>

        {isLoggedIn ? (
          <>
            <button
              onClick={handleLogout}
              style={{ background: "none", border: `1px solid ${NAV_BD}`, borderRadius: 6, padding: "5px 14px", cursor: "pointer", color: T2, fontSize: 13, fontWeight: 500 }}
            >
              Log out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            style={{ background: AC, border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer", color: "#000", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
          >
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div style={{ background: "#0c0c14", minHeight: "100vh" }}>
      <Nav />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/demo" element={<DiagnosticDashboard />} />
        <Route path="/workflows" element={<WorkflowScout />} />

        {/* Protected routes — require invite code login */}
        <Route path="/agents" element={<ProtectedRoute><AgentMonitor /></ProtectedRoute>} />
        <Route path="/agents/xhs-content" element={<ProtectedRoute><XhsWarroom /></ProtectedRoute>} />
        <Route path="/agents/market-intelligence" element={<ProtectedRoute><MarketIntelligence /></ProtectedRoute>} />
        <Route path="/costs" element={<ProtectedRoute><CostDashboard /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}
