// Read-only tools over the dbt project. The same functions back the Claude tool loop on the
// server and the offline answers in the browser, so both modes see identical facts.
import type { Node, Project } from "./project";
import { models, resolveNode } from "./project";
import { impact, walk, type Direction } from "./lineage";
import { checkNode, healthReport, scoreOf, type Severity } from "./health";

export const TOOL_DEFS = [
  {
    name: "list_models",
    description: "List models in the dbt project with layer, materialization, one-line description and health score. Optionally filter by layer.",
    input_schema: {
      type: "object",
      properties: { layer: { type: "string", enum: ["staging", "intermediate", "mart", "other"] } },
    },
  },
  {
    name: "search",
    description: "Find models, sources or exposures whose name, description or column names match a phrase. Use this when the user names something loosely (e.g. 'the delinquency report').",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_model",
    description: "Full detail for one node: description, file path, materialization, columns with types/descriptions/tests, direct parents and children, last run status, health flags and the model SQL.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Model, source (source.table) or exposure name" } }, required: ["name"] },
  },
  {
    name: "get_lineage",
    description: "Upstream (what it depends on) or downstream (what depends on it) nodes, with distance in hops.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        direction: { type: "string", enum: ["upstream", "downstream", "both"] },
        depth: { type: "integer", minimum: 1, maximum: 25 },
      },
      required: ["name", "direction"],
    },
  },
  {
    name: "get_impact",
    description: "Blast radius of changing or breaking a node: every downstream model, the dashboards/exposures that depend on it, and how many tests run on those models.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "get_health",
    description: "Health flags (failing tests, missing tests or docs, layering problems, freshness gaps). Without a name: project summary and the top issues. With a name: that node's flags.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, severity: { type: "string", enum: ["error", "warn", "info"] } },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFS)[number]["name"];

const short = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const brief = (n: Node) => ({ name: n.name, type: n.type, layer: n.layer, materialized: n.materialized, description: short(n.description || "(no description)") });

function need(p: Project, name: unknown): Node {
  const n = typeof name === "string" ? resolveNode(p, name) : undefined;
  if (!n) throw new Error(`No node matches "${String(name)}". Use search or list_models to find the exact name.`);
  return n;
}

export function executeTool(p: Project, name: string, input: Record<string, unknown> = {}): { result: unknown; focus: string[] } {
  switch (name) {
    case "list_models": {
      const layer = typeof input.layer === "string" ? input.layer : undefined;
      const ms = models(p).filter((m) => !layer || m.layer === layer).sort((a, b) => a.name.localeCompare(b.name));
      return { result: ms.map((m) => ({ ...brief(m), health: scoreOf(checkNode(p, m)) })), focus: [] };
    }
    case "search": {
      const q = String(input.query ?? "").toLowerCase();
      const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      const hits = [...p.nodes.values()].map((n) => {
        const hay = [n.name, n.description, ...n.columns.map((c) => c.name + " " + c.description)].join(" ").toLowerCase();
        const nameHits = words.filter((w) => n.name.toLowerCase().includes(w)).length;
        const textHits = words.filter((w) => hay.includes(w)).length;
        return { n, score: nameHits * 3 + textHits };
      }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
      return { result: hits.map((h) => brief(h.n)), focus: hits.slice(0, 3).map((h) => h.n.id) };
    }
    case "get_model": {
      const n = need(p, input.name);
      const flags = checkNode(p, n);
      return {
        result: {
          ...brief(n),
          description: n.description || "(no description)",
          path: n.path,
          schema: n.schema,
          last_run: n.status ? { status: n.status, seconds: n.executionTime } : "no run results loaded",
          columns: n.columns.map((c) => ({ name: c.name, type: c.dataType ?? undefined, description: c.description || undefined, tests: c.tests.length ? c.tests : undefined })),
          parents: n.parents.map((x) => p.nodes.get(x)!.name),
          children: n.children.map((x) => p.nodes.get(x)!.name),
          tests: n.tests.map((t) => ({ test: t.kind, column: t.column, severity: t.severity, status: t.status ?? "not run", failures: t.failures ?? undefined })),
          health: { score: scoreOf(flags), flags: flags.map((f) => ({ severity: f.severity, issue: f.title, detail: f.detail })) },
          sql: n.sql ? short(n.sql, 3000) : undefined,
        },
        focus: [n.id],
      };
    }
    case "get_lineage": {
      const n = need(p, input.name);
      const dir = (["upstream", "downstream", "both"].includes(String(input.direction)) ? input.direction : "upstream") as Direction;
      const depth = Math.min(25, Math.max(1, Number(input.depth) || 25));
      const entries = walk(p, n.id, dir, depth);
      return {
        result: {
          node: n.name,
          direction: dir,
          count: entries.length,
          nodes: entries.map((e) => ({ name: e.node.name, type: e.node.type, layer: e.node.layer, hops: e.distance, direction: e.direction })),
        },
        focus: [n.id, ...entries.map((e) => e.node.id)],
      };
    }
    case "get_impact": {
      const n = need(p, input.name);
      const im = impact(p, n.id);
      return {
        result: {
          node: n.name,
          downstream_models: im.models.map((e) => ({ name: e.node.name, layer: e.node.layer, hops: e.distance })),
          exposures: im.exposures.map((e) => ({ name: e.node.name, type: e.node.exposureType, owner: e.node.owner, hops: e.distance })),
          tests_on_downstream_models: im.testCount,
        },
        focus: [n.id, ...im.models.map((e) => e.node.id), ...im.exposures.map((e) => e.node.id)],
      };
    }
    case "get_health": {
      const sev = typeof input.severity === "string" ? (input.severity as Severity) : undefined;
      if (input.name) {
        const n = need(p, input.name);
        const flags = checkNode(p, n).filter((f) => !sev || f.severity === sev);
        return { result: { node: n.name, score: scoreOf(checkNode(p, n)), flags: flags.map(({ code, severity, title, detail, fix }) => ({ code, severity, title, detail, fix })) }, focus: [n.id] };
      }
      const r = healthReport(p);
      const flags = r.flags.filter((f) => !sev || f.severity === sev);
      return {
        result: {
          project_score: r.score,
          counts: r.counts,
          coverage: r.coverage,
          tests: r.tests,
          top_issues: flags.slice(0, 15).map((f) => ({ node: p.nodes.get(f.nodeId)!.name, severity: f.severity, title: f.title, detail: f.detail, fix: f.fix })),
        },
        focus: [...new Set(flags.filter((f) => f.severity === "error").map((f) => f.nodeId))].slice(0, 8),
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

/** Short project overview for the system prompt, so the model starts with names it can use. */
export function projectBrief(p: Project): string {
  const by = (l: string) => models(p).filter((m) => m.layer === l).map((m) => m.name).sort().join(", ");
  const sources = [...p.nodes.values()].filter((n) => n.type === "source").map((n) => n.name).join(", ");
  const exps = [...p.nodes.values()].filter((n) => n.type === "exposure").map((n) => n.name).join(", ");
  return [
    `Project: ${p.name} (dbt ${p.dbtVersion ?? "?"}), artifacts generated ${p.generatedAt ?? "unknown"}.`,
    `Sources: ${sources || "none"}`,
    `Staging: ${by("staging") || "none"}`,
    `Intermediate: ${by("intermediate") || "none"}`,
    `Marts: ${by("mart") || "none"}`,
    by("other") ? `Other models: ${by("other")}` : "",
    `Exposures: ${exps || "none"}`,
  ].filter(Boolean).join("\n");
}
