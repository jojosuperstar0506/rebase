import { useState, useEffect, lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";

import { AppProvider, useApp } from "./context/AppContext";
import { T, t } from "./i18n";

import Home from "./pages/Home";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowScout from "./pages/WorkflowScout";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";
import XhsWarroom from "./pages/XhsWarroom";
import MarketIntelligence from "./pages/MarketIntelligence";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Success from "./pages/Success";
import ProtectedRoute from "./components/ProtectedRoute";
import Signup from "./pages/Signup";
import AppDashboard from "./pages/AppDashboard";
import CIDashboard from "./pages/ci/CIDashboard";
import CILandscape from "./pages/ci/CILandscape";
import CICompetitors from "./pages/ci/CICompetitors";
import CISettings from "./pages/ci/CISettings";
import { CIErrorBoundary } from "./components/ci/CIErrorBoundary";

const Calculator = lazy(() => import("./pages/Calculator"));

// Pages where nav is hidden (full-screen standalone pages)
const HIDE_NAV_ON = ["/login", "/onboarding", "/signup"];

function NavLink({ to, label, highlight }: { to: string; label: string; highlight?: boolean }) {
  const { colors: C } = useApp();
  const location = useLocation();
  const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to + "/"));
  return (
    <Link to={to} style={{
      textDecoration: "none", fontSize: 14,
      fontWeight: active ? 600 : 400,
      color: highlight ? C.ac : active ? C.tx : C.t2,
      padding: "6px 2px",
      borderBottom: active ? `2px solid ${C.ac}` : "2px solid transparent",
      whiteSpace: "nowrap" as CSSProperties["whiteSpace"],
    }}>
      {label}
    </Link>
  );
}

function Nav() {
  const { colors: C, theme, lang, setTheme, setLang } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  function checkAuth() {
    return !!localStorage.getItem("rebase_token") || !!localStorage.getItem("admin_authed");
  }
  function checkIsAdmin() {
    return !!localStorage.getItem("admin_authed");
  }
  const [isLoggedIn, setIsLoggedIn] = useState(checkAuth);
  const [isAdmin, setIsAdmin] = useState(checkIsAdmin);
  const nav = T.nav;

  // Re-check auth on every route change (catches login/logout navigations)
  useEffect(() => {
    setIsLoggedIn(checkAuth());
    setIsAdmin(checkIsAdmin());
  }, [location.pathname]);

  // Also re-check when explicitly dispatched (e.g. admin login same-tab)
  useEffect(() => {
    function onAuthChange() {
      setIsLoggedIn(checkAuth());
      setIsAdmin(checkIsAdmin());
    }
    window.addEventListener("rebase_auth_change", onAuthChange);
    return () => window.removeEventListener("rebase_auth_change", onAuthChange);
  }, []);

  if (HIDE_NAV_ON.includes(location.pathname)) return null;

  function handleLogout() {
    localStorage.removeItem("rebase_token");
    localStorage.removeItem("admin_authed");
    setIsLoggedIn(false);
    setIsAdmin(false);
    navigate("/");
  }

  const btnStyle: CSSProperties = {
    background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 6,
    padding: "5px 11px", cursor: "pointer", color: C.t2,
    fontSize: 12, fontWeight: 600,
  };

  return (
    <nav style={{
      display: "flex", alignItems: "center", padding: "0 24px", height: 56,
      background: C.navBg, borderBottom: `1px solid ${C.navBd}`,
      fontFamily: "system-ui, sans-serif", position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <Link to="/" style={{ textDecoration: "none", fontSize: 18, fontWeight: 800, color: C.ac, marginRight: 28, letterSpacing: -0.5, flexShrink: 0 }}>
        Rebase
      </Link>

      {/* Left nav links */}
      <div style={{ display: "flex", gap: 22, alignItems: "center", overflow: "hidden" }}>
        <NavLink to="/calculator" label={t(nav.diagnostics, lang)} />

        {!isLoggedIn && (
          <NavLink to="/onboarding" label={t(nav.requestAccess, lang)} highlight />
        )}

        {isLoggedIn && (
          <>
            <NavLink to="/intelligence" label="竞品分析" />
            <NavLink to="/ci" label={t(nav.ciVfinal, lang)} />
            <NavLink to="/agents" label={t(nav.agents, lang)} />
            <NavLink to="/workflows" label={t(nav.workflows, lang)} />
            <NavLink to="/costs" label={t(nav.costs, lang)} />
          </>
        )}
      </div>

      {/* Right controls */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>

        {/* Theme toggle */}
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={btnStyle} title="Toggle theme">
          {theme === "dark" ? "☀️ " + t(nav.lightMode, lang) : "🌙 " + t(nav.darkMode, lang)}
        </button>

        {/* Language toggle */}
        <button onClick={() => setLang(lang === "en" ? "zh" : "en")} style={btnStyle} title="Switch language">
          {lang === "en" ? "中文" : "EN"}
        </button>

        {/* Admin — visible when logged out (for Will/Joanna) or when logged in as admin; hidden for regular users */}
        {(!isLoggedIn || isAdmin) && <NavLink to="/admin" label={t(nav.admin, lang)} />}

        {/* Login / Logout */}
        {isLoggedIn ? (
          <button onClick={handleLogout} style={{ ...btnStyle, color: C.t2 }}>
            {t(nav.logout, lang)}
          </button>
        ) : (
          <Link to="/login" style={{
            background: C.ac, borderRadius: 6, padding: "6px 14px",
            color: "#000", fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}>
            {t(nav.login, lang)}
          </Link>
        )}
      </div>
    </nav>
  );
}

function AppRoutes() {
  const { colors: C } = useApp();
  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <Nav />
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/success" element={<Success />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/demo" element={<DiagnosticDashboard />} />
        <Route path="/calculator" element={<Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>加载中...</div>}><Calculator /></Suspense>} />
        <Route path="/workflows" element={<ProtectedRoute><WorkflowScout /></ProtectedRoute>} />

        {/* Protected — require invite code */}
        <Route path="/agents" element={<ProtectedRoute><AgentMonitor /></ProtectedRoute>} />
        <Route path="/agents/xhs-content" element={<ProtectedRoute><XhsWarroom /></ProtectedRoute>} />
        <Route path="/agents/market-intelligence" element={<ProtectedRoute><MarketIntelligence /></ProtectedRoute>} />
        <Route path="/costs" element={<ProtectedRoute><CostDashboard /></ProtectedRoute>} />

        {/* Self-serve signup (public — customer applies for access) */}
        <Route path="/signup" element={<Signup />} />

        {/* Intelligence dashboard — tab inside the authenticated shell */}
        <Route path="/intelligence" element={<ProtectedRoute><AppDashboard /></ProtectedRoute>} />

        {/* CI vFinal — new competitive intelligence tab */}
        <Route path="/ci" element={<ProtectedRoute><CIErrorBoundary><CIDashboard /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/landscape" element={<ProtectedRoute><CIErrorBoundary><CILandscape /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/competitors" element={<ProtectedRoute><CIErrorBoundary><CICompetitors /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/settings" element={<ProtectedRoute><CIErrorBoundary><CISettings /></CIErrorBoundary></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
