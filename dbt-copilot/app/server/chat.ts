// The Claude tool loop. Pure: takes the conversation and a client, returns the answer plus an
// audit trail of every tool call, so the UI can show exactly what the answer was based on.
import type { Project } from "../src/engine/project";
import { TOOL_DEFS, executeTool, projectBrief } from "../src/engine/tools";

export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface TraceStep { tool: string; input: Record<string, unknown>; ok: boolean; ms: number }
export interface ChatResult { text: string; focus: string[]; trace: TraceStep[]; model: string; usage: { input: number; output: number }; mode: "ai" }

// Minimal surface of the Anthropic SDK we use, so tests can pass a fake.
export interface MessagesClient {
  messages: { create(params: any): Promise<{ content: any[]; stop_reason: string | null; usage?: { input_tokens: number; output_tokens: number } }> };
}

export const MAX_ROUNDS = 6;
const MAX_TOOL_CHARS = 12_000;

export function systemPrompt(p: Project): string {
  return `You are dbt Copilot, an assistant for analytics engineers exploring one dbt project.

Answer questions about lineage, model logic, columns, tests and data-quality health using ONLY facts returned by your tools. Call tools before answering; never guess a model, column or test that a tool has not shown you. If a tool says a name does not exist, search for it. If the project cannot answer the question, say so plainly.

Style:
- Lead with the direct answer in one or two sentences, then supporting bullets.
- Put model, column and source names in backticks.
- Keep answers under 180 words unless the user asks for more detail.
- When you explain SQL logic, describe what it does in business terms, then quote the key lines (at most 8) in a \`\`\`sql block.
- For health questions, rank issues by severity and give the concrete fix.
- Use bold, bullets, inline code and sql code blocks only. No headings, no tables.
- Stay on the topic of this dbt project; politely decline anything else.

${projectBrief(p)}`;
}

export async function runChat(opts: { client: MessagesClient; project: Project; turns: ChatTurn[]; model: string; maxTokens?: number }): Promise<ChatResult> {
  const { client, project, model } = opts;
  const messages: any[] = opts.turns.map((t) => ({ role: t.role, content: t.content }));
  const trace: TraceStep[] = [];
  const focus = new Set<string>();
  const usage = { input: 0, output: 0 };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1200,
      system: systemPrompt(project),
      tools: TOOL_DEFS,
      // on the final round, force a written answer instead of another tool call
      ...(lastRound ? { tool_choice: { type: "none" } } : {}),
      messages,
    });
    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text: text || "I couldn't produce an answer for that. Try rephrasing.", focus: [...focus], trace, model, usage, mode: "ai" };
    }

    messages.push({ role: "assistant", content: res.content });
    const results = toolUses.map((tu) => {
      const t0 = Date.now();
      try {
        const { result, focus: f } = executeTool(project, tu.name, tu.input ?? {});
        f.forEach((id) => focus.add(id));
        trace.push({ tool: tu.name, input: tu.input ?? {}, ok: true, ms: Date.now() - t0 });
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result).slice(0, MAX_TOOL_CHARS) };
      } catch (e) {
        trace.push({ tool: tu.name, input: tu.input ?? {}, ok: false, ms: Date.now() - t0 });
        return { type: "tool_result", tool_use_id: tu.id, content: (e as Error).message, is_error: true };
      }
    });
    messages.push({ role: "user", content: results });
  }
  return { text: "That question needed more lookups than I allow per answer. Try asking about one model at a time.", focus: [...focus], trace, model, usage, mode: "ai" };
}

/** Validate an untrusted request body into chat turns. Throws with a user-safe message. */
export function parseTurns(body: unknown): ChatTurn[] {
  const raw = (body as any)?.messages;
  if (!Array.isArray(raw) || !raw.length) throw new Error("Send {messages: [{role, content}]}.");
  const turns = raw.slice(-10).map((m: any) => {
    if ((m?.role !== "user" && m?.role !== "assistant") || typeof m?.content !== "string" || !m.content.trim())
      throw new Error("Each message needs a role (user or assistant) and text content.");
    return { role: m.role, content: m.content.slice(0, 2000) } as ChatTurn;
  });
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") throw new Error("The last message must be from the user.");
  return turns;
}

/** Sliding-window limiter, per server instance. Pair it with a spend limit in the Anthropic Console. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}
