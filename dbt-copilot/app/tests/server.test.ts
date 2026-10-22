import { describe, expect, it } from "vitest";
import bundle from "../src/data/harbor_lease.json";
import { loadProject } from "../src/engine/project";
import { RateLimiter, parseTurns, runChat, systemPrompt, MAX_ROUNDS, type MessagesClient } from "../server/chat";

const project = loadProject(bundle as any);

/** A scripted stand-in for the Anthropic client. */
function fakeClient(script: ((params: any) => any)[]): MessagesClient & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      async create(params: any) {
        calls.push(structuredClone(params));
        const step = script[Math.min(calls.length - 1, script.length - 1)];
        return step(params);
      },
    },
  };
}
const toolUse = (id: string, name: string, input: object) => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 20 } });
const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 150, output_tokens: 60 } });

describe("runChat", () => {
  it("runs tools, feeds results back, and returns the answer with an audit trail", async () => {
    const client = fakeClient([
      () => toolUse("t1", "get_lineage", { name: "mart_delinquency_monthly", direction: "upstream" }),
      (params) => {
        const last = params.messages.at(-1);
        expect(last.role).toBe("user");
        expect(last.content[0].type).toBe("tool_result");
        expect(last.content[0].content).toMatch(/fct_rent_payments/);
        return text("`mart_delinquency_monthly` is built from `fct_rent_payments`.");
      },
    ]);
    const r = await runChat({ client, project, model: "test-model", turns: [{ role: "user", content: "What feeds the delinquency mart?" }] });
    expect(r.text).toMatch(/fct_rent_payments/);
    expect(r.trace).toEqual([expect.objectContaining({ tool: "get_lineage", ok: true })]);
    expect(r.focus).toContain("model.harbor_lease.fct_rent_payments");
    expect(r.usage).toEqual({ input: 250, output: 80 });
    expect(client.calls[0].tools.map((t: any) => t.name)).toContain("get_health");
    expect(client.calls[0].system).toMatch(/mart_portfolio_kpis/);
  });

  it("returns tool errors to the model instead of failing", async () => {
    const client = fakeClient([
      () => toolUse("t1", "get_model", { name: "does_not_exist" }),
      (params) => {
        const res = params.messages.at(-1).content[0];
        expect(res.is_error).toBe(true);
        expect(res.content).toMatch(/search or list_models/);
        return text("I couldn't find that model.");
      },
    ]);
    const r = await runChat({ client, project, model: "m", turns: [{ role: "user", content: "explain does_not_exist" }] });
    expect(r.trace[0].ok).toBe(false);
  });

  it("stops looping and forces a written answer on the last round", async () => {
    const client = fakeClient([(params) => (params.tool_choice?.type === "none" ? text("Summary.") : toolUse("t", "list_models", {}))]);
    const r = await runChat({ client, project, model: "m", turns: [{ role: "user", content: "loop" }] });
    expect(client.calls).toHaveLength(MAX_ROUNDS);
    expect(r.text).toBe("Summary.");
  });

  it("system prompt grounds the model in tool results", () => {
    expect(systemPrompt(project)).toMatch(/ONLY facts returned by your tools/);
  });
});

describe("request validation", () => {
  it("accepts a normal conversation and trims it", () => {
    const turns = parseTurns({ messages: Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(3000) })).concat([{ role: "user", content: "last" }]) });
    expect(turns.length).toBeLessThanOrEqual(10);
    expect(turns[0].role).toBe("user");
    expect(turns.at(-1)!.content).toBe("last");
    expect(turns[0].content.length).toBe(2000);
  });
  it.each([[{}], [{ messages: [] }], [{ messages: [{ role: "system", content: "hi" }] }], [{ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }]])(
    "rejects %j", (body) => expect(() => parseTurns(body)).toThrow());
});

describe("rate limiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("ip", 0)).toBe(true);
    expect(rl.allow("ip", 10)).toBe(true);
    expect(rl.allow("ip", 20)).toBe(false);
    expect(rl.allow("other", 20)).toBe(true);
    expect(rl.allow("ip", 1500)).toBe(true);
  });
});
