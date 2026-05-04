import { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { DARK, LIGHT } from "../theme/colors";
import type { ColorSet } from "../theme/colors";
import type { Lang } from "../i18n";

export type Theme = "dark" | "light";

interface AppContextType {
  theme: Theme;
  lang: Lang;
  colors: ColorSet;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  /** True briefly after the user toggles language. Lets the app render
   *  a "switching language…" indicator while pages re-fetch with the new
   *  lang query param. Auto-clears ~1.5s later. */
  langSwitching: boolean;
}

const AppContext = createContext<AppContextType>({
  theme: "dark", lang: "en", colors: DARK,
  setTheme: () => {}, setLang: () => {},
  langSwitching: false,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("rebase_theme") as Theme) || "dark"
  );
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("rebase_lang") as Lang) || "en"
  );
  const [langSwitching, setLangSwitching] = useState(false);
  const langTimerRef = useRef<number | null>(null);

  const colors = theme === "dark" ? DARK : LIGHT;

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("rebase_theme", t);
  }

  function setLang(l: Lang) {
    if (l === lang) return;
    setLangState(l);
    localStorage.setItem("rebase_lang", l);
    // Surface a global toast immediately. Pages that depend on lang in
    // their useEffect deps will re-fetch; the toast tells the user to wait.
    setLangSwitching(true);
    if (langTimerRef.current !== null) window.clearTimeout(langTimerRef.current);
    langTimerRef.current = window.setTimeout(() => {
      setLangSwitching(false);
      langTimerRef.current = null;
    }, 1500);
  }

  // Apply body background so there's no white flash
  useEffect(() => {
    document.body.style.background = colors.bg;
    document.body.style.color = colors.tx;
  }, [colors]);

  // Clean up the langSwitching timer on unmount.
  useEffect(() => {
    return () => {
      if (langTimerRef.current !== null) window.clearTimeout(langTimerRef.current);
    };
  }, []);

  return (
    <AppContext.Provider value={{ theme, lang, colors, setTheme, setLang, langSwitching }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
