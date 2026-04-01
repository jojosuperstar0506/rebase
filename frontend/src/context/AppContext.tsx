import { createContext, useContext, useState, useEffect } from "react";
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
}

const AppContext = createContext<AppContextType>({
  theme: "dark", lang: "en", colors: DARK,
  setTheme: () => {}, setLang: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("rebase_theme") as Theme) || "dark"
  );
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("rebase_lang") as Lang) || "en"
  );

  const colors = theme === "dark" ? DARK : LIGHT;

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("rebase_theme", t);
  }

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("rebase_lang", l);
  }

  // Apply body background so there's no white flash
  useEffect(() => {
    document.body.style.background = colors.bg;
    document.body.style.color = colors.tx;
  }, [colors]);

  return (
    <AppContext.Provider value={{ theme, lang, colors, setTheme, setLang }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
