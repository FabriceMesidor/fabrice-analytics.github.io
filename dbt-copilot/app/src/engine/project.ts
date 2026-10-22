// Loads dbt artifacts (manifest.json + optional run_results.json) into an in-memory graph.
// Works with a full manifest a visitor uploads or the trimmed bundle in src/data.

export type Layer = "source" | "staging" | "intermediate" | "mart" | "exposure" | "other";
export type Status = "pass" | "success" | "warn" | "fail" | "error" | "skipped" | "no-op" | string;

export interface Column {
  name: string;
  description: string;
  dataType?: string | null;
  tests: string[]; // e.g. ["unique", "not_null"]
}

export interface Test {
  id: string;
  name: string;
  kind: string; // unique, not_null, accepted_values, relationships, singular...
  column?: string;
  attachedTo?: string;
  severity: "error" | "warn";
  status?: Status;
  failures?: number | null;
  message?: string;
}

export interface Node {
  id: string;
  name: string;
  type: "model" | "source" | "exposure" | "snapshot";
  layer: Layer;
  description: string;
  path?: string;
  materialized?: string;
  uniqueKey?: string | string[];
  schema?: string;
  sql?: string;
  columns: Column[];
  parents: string[];
  children: string[];
  tests: Test[];
  status?: Status;
  executionTime?: number;
  freshness?: { warn_after?: unknown; error_after?: unknown } | null;
  sourceName?: string;
  exposureType?: string;
  owner?: string;
}

export interface Project {
  name: string;
  dbtVersion?: string;
  generatedAt?: string;
  nodes: Map<string, Node>;
  byName: Map<string, Node>;
  tests: Test[];
  hasRunResults: boolean;
}

type Json = Record<string, any>;

export function layerOf(name: string, type: string, path = ""): Layer {
  if (type === "source") return "source";
  if (type === "exposure") return "exposure";
  const n = name.toLowerCase();
  const p = path.toLowerCase();
  if (n.startsWith("stg_") || p.includes("/staging/")) return "staging";
  if (n.startsWith("int_") || p.includes("/intermediate/")) return "intermediate";
  if (/^(fct|fact|dim|mart|rpt|agg|obt)_/.test(n) || p.includes("/marts/")) return "mart";
  return "other";
}

/** Accepts {manifest, run_results} (bundle) or a raw manifest, plus optional run_results. */
export function loadProject(input: Json, runResultsArg?: Json | null): Project {
  const manifest: Json = input.manifest ?? input;
  const runResults: Json | null = runResultsArg ?? input.run_results ?? null;
  if (!manifest || typeof manifest.nodes !== "object") {
    throw new Error("This doesn't look like a dbt manifest.json (no `nodes` key).");
  }
  const nodes = new Map<string, Node>();
  const tests: Test[] = [];

  for (const [id, n] of Object.entries<Json>(manifest.nodes)) {
    if (n.resource_type === "model" || n.resource_type === "snapshot") {
      if (n.config?.enabled === false) continue;
      nodes.set(id, {
        id,
        name: n.name,
        type: n.resource_type,
        layer: layerOf(n.name, n.resource_type, n.original_file_path ?? ""),
        description: (n.description ?? "").trim(),
        path: n.original_file_path,
        materialized: n.config?.materialized,
        uniqueKey: n.config?.unique_key,
        schema: n.schema,
        sql: n.raw_code ?? n.raw_sql,
        columns: Object.values<Json>(n.columns ?? {}).map((c) => ({
          name: String(c.name).toLowerCase(),
          description: (c.description ?? "").trim(),
          dataType: c.data_type ?? null,
          tests: [],
        })),
        parents: [...(n.depends_on?.nodes ?? [])],
        children: [],
        tests: [],
      });
    }
  }
  for (const [id, s] of Object.entries<Json>(manifest.sources ?? {})) {
    nodes.set(id, {
      id,
      name: `${s.source_name}.${s.name}`,
      type: "source",
      layer: "source",
      description: (s.description ?? "").trim(),
      path: s.original_file_path,
      columns: Object.values<Json>(s.columns ?? {}).map((c) => ({
        name: String(c.name).toLowerCase(), description: (c.description ?? "").trim(), dataType: c.data_type ?? null, tests: [],
      })),
      parents: [],
      children: [],
      tests: [],
      freshness: s.freshness && (s.freshness.warn_after?.count != null || s.freshness.error_after?.count != null) ? s.freshness : null,
      sourceName: s.source_name,
    });
  }
  for (const [id, e] of Object.entries<Json>(manifest.exposures ?? {})) {
    nodes.set(id, {
      id,
      name: e.name,
      type: "exposure",
      layer: "exposure",
      description: (e.description ?? "").trim(),
      columns: [],
      parents: [...(e.depends_on?.nodes ?? [])],
      children: [],
      tests: [],
      exposureType: e.type,
      owner: e.owner?.name,
    });
  }
  // tests
  for (const [id, n] of Object.entries<Json>(manifest.nodes)) {
    if (n.resource_type !== "test") continue;
    const attached: string | undefined =
      n.attached_node ?? (n.depends_on?.nodes ?? []).find((d: string) => nodes.has(d) && !d.startsWith("source.") ) ?? n.depends_on?.nodes?.[0];
    const kind = n.test_metadata?.name ?? "singular";
    const column = (n.column_name ?? n.test_metadata?.kwargs?.column_name ?? undefined)?.toString().toLowerCase();
    const t: Test = {
      id, name: n.name, kind, column, attachedTo: attached,
      severity: String(n.config?.severity ?? "error").toLowerCase() === "warn" ? "warn" : "error",
    };
    tests.push(t);
    const target = attached ? nodes.get(attached) : undefined;
    if (target) {
      target.tests.push(t);
      if (column) {
        let col = target.columns.find((c) => c.name === column);
        if (!col) { col = { name: column, description: "", dataType: null, tests: [] }; target.columns.push(col); }
        col.tests.push(kind);
      }
    }
  }
  // edges (drop parents we don't know about, e.g. seeds or disabled nodes)
  for (const node of nodes.values()) {
    node.parents = node.parents.filter((p) => nodes.has(p));
    for (const p of node.parents) nodes.get(p)!.children.push(node.id);
  }
  // run results
  const resultList: Json[] = runResults?.results ?? [];
  const byId = new Map(resultList.map((r) => [r.unique_id, r]));
  for (const node of nodes.values()) {
    const r = byId.get(node.id);
    if (r) { node.status = r.status; node.executionTime = r.execution_time; }
  }
  for (const t of tests) {
    const r = byId.get(t.id);
    if (r) { t.status = r.status; t.failures = r.failures ?? null; t.message = r.message ?? ""; }
  }
  const byName = new Map<string, Node>();
  for (const n of nodes.values()) {
    byName.set(n.name.toLowerCase(), n);
    if (n.type === "source") byName.set(n.name.split(".")[1].toLowerCase(), n);
  }
  return {
    name: input.metadata?.project_name ?? manifest.metadata?.project_name ?? guessProjectName(manifest),
    dbtVersion: input.metadata?.dbt_version ?? manifest.metadata?.dbt_version,
    generatedAt: runResults?.metadata?.generated_at ?? input.metadata?.generated_at ?? manifest.metadata?.generated_at,
    nodes, byName, tests,
    hasRunResults: resultList.length > 0,
  };
}

function guessProjectName(manifest: Json): string {
  const first = Object.values<Json>(manifest.nodes ?? {}).find((n) => n.resource_type === "model");
  return first?.package_name ?? "dbt project";
}

export const models = (p: Project) => [...p.nodes.values()].filter((n) => n.type === "model" || n.type === "snapshot");

/** Resolve free text ("rent payments", "fct_rent_payments", "raw_payments") to a node. */
export function resolveNode(p: Project, text: string): Node | undefined {
  const q = text.toLowerCase().trim().replace(/[`'"?.,]/g, "");
  if (!q) return undefined;
  const exact = p.byName.get(q) ?? p.nodes.get(q);
  if (exact) return exact;
  const snake = q.replace(/\s+/g, "_");
  const direct = p.byName.get(snake);
  if (direct) return direct;
  // a node name mentioned anywhere in the text, longest first
  const names = [...p.byName.keys()].sort((a, b) => b.length - a.length);
  const mentioned = names.find((n) => n.length > 3 && new RegExp(`(^|[^a-z0-9_])${escapeRe(n)}($|[^a-z0-9_])`).test(q));
  if (mentioned) return p.byName.get(mentioned);
  // token overlap on name, ignoring layer prefixes
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return undefined;
  let best: { node: Node; score: number } | undefined;
  for (const node of p.nodes.values()) {
    const parts = node.name.toLowerCase().replace(/^(stg|int|fct|dim|mart)_+/, "").split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const w of words) if (parts.some((x) => x === w || x.startsWith(w) || w.startsWith(x) && x.length > 3)) score += 1;
    if (!score) continue;
    score = score / parts.length + (node.layer === "mart" ? 0.15 : 0) + (node.type === "exposure" ? -0.1 : 0);
    if (!best || score > best.score) best = { node, score };
  }
  return best && best.score >= 0.5 ? best.node : undefined;
}

const STOP = new Set(["the", "what", "which", "model", "models", "table", "does", "show", "from", "into", "with", "and", "for", "are",
  "upstream", "downstream", "lineage", "explain", "about", "tell", "this", "that", "how", "health", "issues", "depends", "feeds", "uses",
  "break", "change", "changed", "impact", "calculated", "computed", "where", "come", "comes", "mart", "source", "sources", "test", "tests"]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
