import { it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import manifest from "../src/app/manifest";
it("declares a scoped standalone app with existing installation icons", () => {
  const data = manifest();
  expect(data.display).toBe("standalone");
  expect(data.start_url).toBe("/app");
  expect(data.scope).toBe("/");
  for (const icon of data.icons ?? [])
    expect(existsSync("public" + icon.src)).toBe(true);
});
it("keeps API requests out of the service worker and provides only a generic offline navigation page", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  let response: Promise<Response> | undefined;
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      addEventListener: (name: string, fn: any) => (handlers[name] = fn),
      location: { origin: "https://example.test" },
    },
    fetch: async () => {
      throw Error("offline");
    },
    URL,
    Response,
  });
  handlers.fetch({
    request: {
      url: "https://example.test/api/families",
      method: "GET",
      mode: "cors",
    },
    respondWith: () => {
      throw Error("API must not be intercepted");
    },
  });
  handlers.fetch({
    request: {
      url: "https://example.test/app",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (r: Promise<Response>) => (response = r),
  });
  const result = await response!;
  expect(result.status).toBe(503);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.text()).toContain("You are offline");
});
