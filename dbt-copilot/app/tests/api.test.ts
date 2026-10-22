import { afterEach, describe, expect, it, vi } from "vitest";

describe("api/chat handler", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const load = async () => (await import("../server/handler")).default;
  const req = (method: string, body?: unknown, origin = "https://fabrice-analytics.com") =>
    new Request("https://x.vercel.app/api/chat", { method, headers: { "content-type": "application/json", origin }, body: body ? JSON.stringify(body) : undefined });

  it("answers CORS preflight for the portfolio origin", async () => {
    const h = await load();
    const r = await h.fetch(req("OPTIONS"));
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://fabrice-analytics.com");
  });
  it("does not echo unknown origins", async () => {
    const h = await load();
    const r = await h.fetch(req("OPTIONS", undefined, "https://evil.example"));
    expect(r.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });
  it("refuses POSTs from other sites", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const h = await load();
    const r = await h.fetch(req("POST", { messages: [{ role: "user", content: "hi" }] }, "https://evil.example"));
    expect(r.status).toBe(403);
  });
  it("reports not_configured without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const h = await load();
    const r = await h.fetch(req("POST", { messages: [{ role: "user", content: "hi" }] }));
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("not_configured");
  });
  it("rejects bad bodies before calling the model", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const h = await load();
    const r = await h.fetch(req("POST", { messages: [] }));
    expect(r.status).toBe(400);
  });
  it("health check reports the project", async () => {
    const h = await load();
    const r = await h.fetch(req("GET"));
    expect((await r.json()).project).toBe("harbor_lease");
  });
});
