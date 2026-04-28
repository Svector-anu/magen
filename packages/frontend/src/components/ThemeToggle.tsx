import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "dark" | "light";

function getStored(): Theme {
  try { return (localStorage.getItem("magen_theme") as Theme) ?? "dark"; }
  catch { return "dark"; }
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t === "light" ? "light" : "";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStored);

  useEffect(() => { apply(theme); }, [theme]);

  function toggle(t: Theme) {
    setTheme(t);
    try { localStorage.setItem("magen_theme", t); } catch {}
  }

  return (
    <div className={styles.pill}>
      <button
        className={`${styles.opt} ${theme === "dark" ? styles.active : ""}`}
        onClick={() => toggle("dark")}
      >
        dark
      </button>
      <button
        className={`${styles.opt} ${theme === "light" ? styles.active : ""}`}
        onClick={() => toggle("light")}
      >
        light
      </button>
    </div>
  );
}
