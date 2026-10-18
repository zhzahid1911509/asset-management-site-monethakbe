import { it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { THEME_BOOTSTRAP } from "../src/lib/theme";
function boot(stored: string | null = null, dark = false, blocked = false) {
  const handlers: Record<string, (e: any) => void> = {},
    media = {
      matches: dark,
      addEventListener: (_name: string, fn: any) => (handlers.media = fn),
    };
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  let saved = stored;
  const document = {
    documentElement: root,
    addEventListener: (n: string, fn: any) => (handlers[n] = fn),
    dispatchEvent: () => {},
  };
  runInNewContext(THEME_BOOTSTRAP, {
    document,
    window: {
      matchMedia: () => media,
      addEventListener: (n: string, fn: any) => (handlers[n] = fn),
    },
    localStorage: {
      getItem: () => {
        if (blocked) throw Error();
        return saved;
      },
      setItem: (_k: string, v: string) => {
        if (blocked) throw Error();
        saved = v;
      },
    },
    Event: class {
      constructor(public type: string) {}
    },
  });
  return { root, handlers, media, stored: () => saved };
}
it("uses the system theme by default and follows OS changes", () => {
  const x = boot(null, true);
  expect(x.root.dataset.theme).toBe("dark");
  x.media.matches = false;
  x.handlers.media({});
  expect(x.root.dataset.theme).toBe("light");
});
it("retains an explicit preference and persists switching", () => {
  const x = boot("light", true);
  expect(x.root.dataset.theme).toBe("light");
  x.handlers["monethakbe:theme"]({ detail: "dark" });
  expect(x.stored()).toBe("dark");
  x.media.matches = false;
  x.handlers.media({});
  expect(x.root.dataset.theme).toBe("dark");
  expect(x.root.style.colorScheme).toBe("dark");
});
it("handles unavailable storage and invalid preferences", () => {
  const x = boot("bad", true, true);
  expect(x.root.dataset.theme).toBe("dark");
  x.handlers["monethakbe:theme"]({ detail: "light" });
  expect(x.root.dataset.theme).toBe("light");
  x.handlers["monethakbe:theme"]({ detail: "invalid" });
  expect(x.root.dataset.theme).toBe("light");
});
it("syncs browser tabs and clearing storage restores system mode", () => {
  const x = boot("light", true);
  x.handlers.storage({ key: "monethakbe-theme", newValue: "dark" });
  expect(x.root.dataset.themePreference).toBe("dark");
  x.handlers.storage({ key: null, newValue: null });
  expect(x.root.dataset.themePreference).toBe("system");
});
