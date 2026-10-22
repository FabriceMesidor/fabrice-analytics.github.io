// Vercel Function: POST /api/chat. Bundled into api/chat.js by `npm run build:api`.
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (default claude-haiku-5-5),
//      ALLOWED_ORIGINS (comma-separated; include the Vercel URL if the UI is served from it), RATE_LIMIT_PER_10MIN (default 15)
import Anthropic from "@anthropic-ai/sdk";
import bundle from "../src/data/harbor_lease.json";
import { loadProject } from "../src/engine/project";
import { RateLimiter, parseTurns, runChat } from "./chat";

const project = loadProject(bundle as any);
const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_10MIN ?? 15), 10 * 60 * 1000);
const allowed = (process.env.ALLOWED_ORIGINS ?? "https://fabrice-analytics.com,https://www.fabrice-analytics.com,https://tools.fabrice-analytics.com,http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

const originAllowed = (origin: string | null) => !origin || allowed.includes(origin);

function cors(origin: string | null): Record<string, string> {
  const ok = !!origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

export default {
  async fetch(request: Request): Promise<Response> {
    const headers = cors(request.headers.get("origin"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET") return json({ ok: true, project: project.name, ai: Boolean(process.env.ANTHROPIC_API_KEY) }, 200, headers);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, headers);
    if (!originAllowed(request.headers.get("origin"))) return json({ error: "This origin isn't allowed.", code: "forbidden" }, 403, headers);
    if (!process.env.ANTHROPIC_API_KEY) return json({ error: "The AI backend isn't configured.", code: "not_configured" }, 503, headers);

    const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!limiter.allow(ip)) return json({ error: "You've asked a lot of questions in a short time. Try again in a few minutes.", code: "rate_limited" }, 429, headers);

    let turns;
    try { turns = parseTurns(await request.json()); }
    catch (e) { return json({ error: (e as Error).message, code: "bad_request" }, 400, headers); }

    try {
      const client = new Anthropic();
      const result = await runChat({ client, project, turns, model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5" });
      return json(result, 200, headers);
    } catch (e: any) {
      console.error("chat failed", e?.status, e?.message);
      const status = e?.status === 429 ? 429 : 502;
      return json({ error: status === 429 ? "The AI service is busy. Try again shortly." : "The AI service had a problem answering.", code: "upstream_error" }, status, headers);
    }
  },
};
