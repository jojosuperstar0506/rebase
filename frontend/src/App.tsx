import { useState, useEffect, lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon } from "lucide-react";

import { AppProvider, useApp } from "./context/AppContext";
import { BrandChip } from "@/components/ui/BrandChip";
import { getWorkspace } from "./services/ciApi";
import { useCIAlertCount } from "./hooks/useCIAlertCount";
import { T, t } from "./i18n";

import Home from "./pages/Home";
import Contact from "./pages/Contact";
import DiagnosticDashboard from "./pages/DiagnosticDashboard";
import WorkflowScout from "./pages/WorkflowScout";
import AgentMonitor from "./pages/AgentMonitor";
import CostDashboard from "./pages/CostDashboard";
import XhsWarroom from "./pages/XhsWarroom";
import MarketIntelligence from "./pages/MarketIntelligence";
// /onboarding (legacy anonymous lead form) is retired — replaced by /signup wizard.
// We keep the route but redirect it so old emails / shared links keep working.
import { Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Success from "./pages/Success";
import ProtectedRoute from "./components/ProtectedRoute";
import SignupWizard from "./pages/signup/SignupWizard";
// CI vFinal — Brief-centric redesign.
// /ci now lands on the Brief (weekly action kit). Library is new. Dashboard,
// Intelligence, Landscape, DeepDive are retired — their content is folded
// into the Brief (collapsed metrics panel) or per-brand detail views.
import CIBrief from "./pages/ci/CIBrief";
import CIAnalytics from "./pages/ci/CIAnalytics";
import CILibrary from "./pages/ci/CILibrary";
import CICompetitors from "./pages/ci/CICompetitors";
import CISettings from "./pages/ci/CISettings";
import CIHelp from "./pages/ci/CIHelp";
import CIActions from "./pages/ci/CIActions";
import CIOpportunity from "./pages/ci/CIOpportunity";
import { CIErrorBoundary } from "./components/ci/CIErrorBoundary";

const Calculator = lazy(() => import("./pages/Calculator"));

// Pages where nav is hidden (full-screen standalone pages)
const HIDE_NAV_ON = ["/", "/login", "/onboarding", "/signup", "/design-system"];

const DesignSystem = lazy(() => import("./pages/DesignSystem"));

function NavLink({ to, label, highlight }: { to: string; label: string; highlight?: boolean }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to + "/"));
  return (
    <Link to={to} style={{
      textDecoration: "none", fontSize: 13,
      fontFamily: "var(--font-mono)",
      fontWeight: active ? 600 : 400,
      color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
      padding: "6px 2px",
      borderBottom: active
        ? "2px solid var(--color-accent)"
        : "2px solid transparent",
      whiteSpace: "nowrap" as CSSProperties["whiteSpace"],
      ...(highlight ? { color: "var(--color-text-primary)", fontWeight: 600 } : {}),
    }}>
      {label.toLowerCase()}
    </Link>
  );
}

function Nav() {
  const { colors: C, theme, lang, setTheme, setLang, langSwitching } = useApp();
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

  // CI workspace ID — fetched lazily for alert badge
  const [ciWorkspaceId, setCiWorkspaceId] = useState<string | null>(null);
  const [brand, setBrand] = useState<{ name: string; category?: string | null } | null>(null);
  const alertCount = useCIAlertCount(ciWorkspaceId);

  // CI dot indicator: show when user hasn't visited /ci yet, or there's newer CI data
  function checkCiDot(): boolean {
    const lastVisit = localStorage.getItem('rebase_ci_last_visit');
    if (!lastVisit) return true; // never visited
    try {
      // Check if CI data was updated more recently than the last visit
      const ciWs = localStorage.getItem('rebase_ci_workspace');
      const ciComps = localStorage.getItem('rebase_ci_competitors');
      if (!ciWs && !ciComps) return false;
      // Show dot if no visit recorded at all
      return false;
    } catch { return false; }
  }
  const [ciDot, setCiDot] = useState(checkCiDot);

  // Re-check auth on every route change (catches login/logout navigations)
  useEffect(() => {
    const loggedIn = checkAuth();
    setIsLoggedIn(loggedIn);
    setIsAdmin(checkIsAdmin());

    // Fetch CI workspace ID (for alert badge) + brand info (for nav chip)
    // once when logged in. Same single call powers both.
    if (loggedIn && !ciWorkspaceId) {
      getWorkspace().then(ws => {
        if (ws.data?.id) setCiWorkspaceId(ws.data.id);
        if (ws.data?.brand_name) {
          setBrand({ name: ws.data.brand_name, category: ws.data.brand_category });
        }
      }).catch(() => {});
    }

    // Clear CI dot when visiting /ci, set it when leaving
    if (location.pathname === '/ci' || location.pathname.startsWith('/ci/')) {
      localStorage.setItem('rebase_ci_last_visit', new Date().toISOString());
      setCiDot(false);
    } else {
      setCiDot(checkCiDot());
    }
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
    sessionStorage.removeItem("rebase_onboarded");
    setIsLoggedIn(false);
    setIsAdmin(false);
    navigate("/");
  }

  const btnStyle: CSSProperties = {
    background: "transparent", border: "1px solid var(--color-border-hairline)",
    borderRadius: 2, padding: "5px 11px", cursor: "pointer",
    color: "var(--color-text-muted)", fontSize: 12, fontWeight: 500,
    fontFamily: "var(--font-mono)",
  };

  return (
    <nav style={{
      display: "flex", alignItems: "center", padding: "0 24px", height: 56,
      background: "var(--color-canvas)",
      borderBottom: "1px solid var(--color-border-hairline)",
      fontFamily: "var(--font-mono)", position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Spinner keyframes — used by the language toggle's loading indicator. */}
      <style>{`@keyframes rebase-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Logo */}
      <Link to="/" style={{
        textDecoration: "none", fontSize: 16, fontWeight: 700,
        color: "var(--color-text-primary)", marginRight: 28,
        fontFamily: "var(--font-mono)", flexShrink: 0,
      }}>
        rebase
      </Link>

      {/* Left nav links — slimmed 2026-05-04. The platform now centers on
          one product surface (Intelligence / 竞品情报). The previous tabs
          (Diagnostics calculator, Agents, Workflow Discovery, Costs) were
          earlier-iteration ideas that confuse new users — they still
          route at /calculator, /agents, /workflows, /costs for testing,
          but no longer surface in the public nav. Admin/Will/Joanna can
          re-add them later if needed. */}
      <div style={{ display: "flex", gap: 22, alignItems: "center", overflow: "hidden" }}>
        {!isLoggedIn && (
          <NavLink to="/signup" label={t(nav.requestAccess, lang)} highlight />
        )}

        {isLoggedIn && (
          <>
            {/* Intelligence nav link with alert badge (real count) or dot fallback */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <NavLink to="/ci" label={t(nav.ciVfinal, lang)} />
              {alertCount > 0 ? (
                <span style={{
                  background: C.danger,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 8,
                  minWidth: 16,
                  textAlign: 'center' as CSSProperties['textAlign'],
                  display: 'inline-block',
                  verticalAlign: 'middle',
                  flexShrink: 0,
                }}>
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              ) : ciDot && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: C.ac,
                  display: 'inline-block', verticalAlign: 'middle', flexShrink: 0,
                }} />
              )}
            </div>
          </>
        )}

        {/* Contact link — routes to the in-app /contact page (was a
            mailto:; replaced with a real page so users see the team,
            response time, and data-handling info before deciding to
            email). */}
        <NavLink to="/contact" label={t(nav.contact, lang)} />
      </div>

      {/* Right controls */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Brand chip — visible when logged in, surfaces current workspace */}
        {isLoggedIn && brand && (
          <Link to="/ci/settings" style={{ textDecoration: "none" }}>
            <BrandChip name={brand.name} category={brand.category || undefined} />
          </Link>
        )}

        {/* Theme toggle */}
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{ ...btnStyle, display: "inline-flex", alignItems: "center", gap: 6 }} title="Toggle theme">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === "dark" ? t(nav.lightMode, lang) : t(nav.darkMode, lang)}</span>
        </button>

        {/* Language toggle */}
        <button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          style={{
            ...btnStyle,
            opacity: langSwitching ? 0.6 : 1,
            cursor: langSwitching ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
          title="Switch language"
          disabled={langSwitching}
        >
          {langSwitching && (
            <span
              aria-hidden
              style={{
                width: 10, height: 10, borderRadius: "50%",
                border: `2px solid ${C.t2}`, borderTopColor: "transparent",
                display: "inline-block",
                animation: "rebase-spin 0.7s linear infinite",
              }}
            />
          )}
          <span>{lang === "en" ? "中文" : "EN"}</span>
        </button>

        {/* Admin — visible when logged out (for Will/Joanna) or when logged in as admin; hidden for regular users */}
        {(!isLoggedIn || isAdmin) && <NavLink to="/admin" label={t(nav.admin, lang)} />}

        {/* Login / Logout */}
        {isLoggedIn ? (
          <button onClick={handleLogout} style={btnStyle}>
            {t(nav.logout, lang).toLowerCase()}
          </button>
        ) : (
          <Link to="/login" style={{
            background: "var(--color-accent)", borderRadius: 2, padding: "7px 16px",
            color: "var(--color-neutral-900)", fontSize: 13, fontWeight: 600,
            fontFamily: "var(--font-mono)", textDecoration: "none",
          }}>
            {t(nav.login, lang).toLowerCase()}
          </Link>
        )}
      </div>
    </nav>
  );
}

function LangSwitchingToast() {
  const { colors: C, lang, langSwitching } = useApp();
  if (!langSwitching) return null;
  return (
    <div style={{
      position: "fixed", top: 70, right: 20, zIndex: 200,
      background: C.s1, border: `1px solid ${C.bd}`,
      borderRadius: 8, padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 10,
      fontSize: 13, color: C.tx, fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      animation: "rebase-toast-in 0.18s ease-out",
    }}>
      <style>{`
        @keyframes rebase-toast-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <span
        aria-hidden
        style={{
          width: 12, height: 12, borderRadius: "50%",
          border: `2px solid ${C.ac}`, borderTopColor: "transparent",
          display: "inline-block",
          animation: "rebase-spin 0.7s linear infinite",
        }}
      />
      <span>
        {lang === "zh" ? "正在切换为中文…" : "Switching to English…"}
      </span>
    </div>
  );
}

function AppRoutes() {
  const { colors: C } = useApp();
  const location = useLocation();
  // Standalone full-screen pages own their own background (new design system).
  // Everything else keeps the legacy themed wrapper until P2 migrates them.
  const standalone = HIDE_NAV_ON.includes(location.pathname);
  return (
    <div style={{ background: standalone ? "var(--color-canvas)" : C.bg, minHeight: "100vh" }}>
      <Nav />
      <LangSwitchingToast />
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/contact" element={<Contact />} />
        {/* Legacy lead-form retired — redirect to the self-serve signup wizard */}
        <Route path="/onboarding" element={<Navigate to="/signup" replace />} />
        <Route path="/success" element={<Success />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/demo" element={<DiagnosticDashboard />} />
        <Route path="/calculator" element={<Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>加载中...</div>}><Calculator /></Suspense>} />
        <Route path="/design-system" element={<Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}><DesignSystem /></Suspense>} />
        <Route path="/workflows" element={<ProtectedRoute><WorkflowScout /></ProtectedRoute>} />

        {/* Protected — require invite code */}
        <Route path="/agents" element={<ProtectedRoute><AgentMonitor /></ProtectedRoute>} />
        <Route path="/agents/xhs-content" element={<ProtectedRoute><XhsWarroom /></ProtectedRoute>} />
        <Route path="/agents/market-intelligence" element={<ProtectedRoute><MarketIntelligence /></ProtectedRoute>} />
        <Route path="/costs" element={<ProtectedRoute><CostDashboard /></ProtectedRoute>} />

        {/* Self-serve signup wizard — multi-step, gates the dashboard */}
        <Route path="/signup" element={<SignupWizard />} />

        {/* CI vFinal — Brief-centric routes.
            Deleted: /ci/intelligence, /ci/landscape, /ci/competitors/:brandName (DeepDive).
            Those UIs were redundant dashboards of the same data — their content is now
            inside the Brief (collapsed metrics) or per-brand detail views from Brands. */}
        <Route path="/ci" element={<ProtectedRoute><CIErrorBoundary><CIBrief /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/actions" element={<ProtectedRoute><CIErrorBoundary><CIActions /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/opportunity" element={<ProtectedRoute><CIErrorBoundary><CIOpportunity /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/analytics" element={<ProtectedRoute><CIErrorBoundary><CIAnalytics /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/library" element={<ProtectedRoute><CIErrorBoundary><CILibrary /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/competitors" element={<ProtectedRoute><CIErrorBoundary><CICompetitors /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/settings" element={<ProtectedRoute><CIErrorBoundary><CISettings /></CIErrorBoundary></ProtectedRoute>} />
        <Route path="/ci/help" element={<ProtectedRoute><CIErrorBoundary><CIHelp /></CIErrorBoundary></ProtectedRoute>} />
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
