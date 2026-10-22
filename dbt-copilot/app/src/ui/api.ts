import type { Answer } from "../engine/offline";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api/chat";

export interface AiAnswer extends Omit<Answer, "trace" | "mode"> {
  mode: "ai";
  model: string;
  trace: { tool: string; input: Record<string, unknown>; ok: boolean }[];
}

/** GET the endpoint once to learn whether Claude answers are available. */
export async function probeApi(): Promise<{ ai: boolean }> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(API_URL, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return { ai: false };
    const j = await r.json();
    return { ai: Boolean(j?.ai) };
  } catch {
    return { ai: false };
  }
}

export class ApiError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export async function askApi(messages: { role: "user" | "assistant"; content: string }[], signal?: AbortSignal): Promise<AiAnswer> {
  let r: Response;
  try {
    r = await fetch(API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages }), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ApiError("Stopped.", "cancelled");
    throw new ApiError("Couldn't reach the AI service.", "network");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error ?? "The AI service had a problem answering.", j.code ?? "upstream_error");
  return j as AiAnswer;
}
