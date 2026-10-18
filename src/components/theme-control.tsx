"use client";
import { useEffect, useState } from "react";
export function ThemeControl() {
  const [value, setValue] = useState("system");
  useEffect(() => {
    const sync = () =>
      setValue(document.documentElement.dataset.themePreference ?? "system");
    sync();
    document.addEventListener("monethakbe:theme-applied", sync);
    return () => document.removeEventListener("monethakbe:theme-applied", sync);
  }, []);
  return (
    <div className="theme-control">
      <label htmlFor="site-theme">
        ◐ <span>থিম / Theme</span>
      </label>
      <select
        id="site-theme"
        value={value}
        onChange={(event) => {
          document.dispatchEvent(
            new CustomEvent("monethakbe:theme", { detail: event.target.value }),
          );
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
