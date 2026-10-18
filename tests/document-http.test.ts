import { it, expect, vi, afterEach } from "vitest";
vi.mock("../src/server/auth", () => ({
  configured: () => true,
  getAuth: () => ({
    api: {
      getSession: async () => ({
        user: { id: "test", email: "test@example.test", emailVerified: true },
      }),
    },
  }),
}));
import { handle } from "../src/server/http";
afterEach(() => vi.unstubAllEnvs());
it("preserves binary responses and security headers through the HTTP boundary", async () => {
  const response = await handle(
    new Request("https://example.test/api/file"),
    async () =>
      new Response(new Uint8Array([0, 255, 1]), {
        headers: {
          "Content-Disposition": "attachment",
          "X-Content-Type-Options": "nosniff",
        },
      }),
  );
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([0, 255, 1]),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.get("content-disposition")).toBe("attachment");
});
it("blocks cross-origin multipart mutation before processing the upload", async () => {
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  let called = false;
  const response = await handle(
    new Request("https://example.test/api/file", {
      method: "POST",
      headers: { origin: "https://other.test" },
      body: new FormData(),
    }),
    async () => {
      called = true;
    },
  );
  expect(response.status).toBe(403);
  expect(called).toBe(false);
});
