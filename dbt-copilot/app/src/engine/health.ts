// Model health checks: the review an analytics engineer does before trusting a model.
import type { Node, Project } from "./project";
import { models } from "./project";
import { impact } from "./lineage";

export type Severity = "error" | "warn" | "info";

export interface Flag {
  code: string;
  severity: Severity;
  nodeId: string;
  title: string;
  detail: string;
  fix: string;
}

const W = { error: 20, warn: 7, info: 2 } as const;

export function checkNode(p: Project, n: Node): Flag[] {
  const f: Flag[] = [];
  const add = (code: string, severity: Severity, title: string, detail: string, fix: string) =>
    f.push({ code, severity, nodeId: n.id, title, detail, fix });

  if (n.type === "source") {
    const feedsMart = impact(p, n.id).models.some((e) => e.node.layer === "mart");
    if (!n.freshness && feedsMart)
      add("SRC_NO_FRESHNESS", "warn", "No freshness check", `${n.name} feeds marts but has no freshness rule, so a stalled load would go unnoticed.`,
        "Add `freshness: {warn_after, error_after}` and a `loaded_at_field`, then run `dbt source freshness` on a schedule.");
    if (!n.description) add("SRC_NO_DESC", "info", "Source undocumented", `${n.name} has no description.`, "Describe what system loads it and its grain.");
    return f;
  }
  if (n.type === "exposure") {
    const upstreamBroken = [...p.nodes.values()].filter((m) => (m.type === "model") && isBroken(m) && reaches(p, m.id, n.id));
    if (upstreamBroken.length)
      add("EXPOSURE_AT_RISK", "error", "Dashboard at risk", `${n.name} depends on ${upstreamBroken.map((m) => m.name).join(", ")}, which ${upstreamBroken.length > 1 ? "have" : "has"} failing tests or runs.`,
        "Fix the upstream failures before the next refresh, or warn the dashboard owner.");
    const upstreamWarn = [...p.nodes.values()].filter((m) => m.tests.some((t) => t.status === "warn") && reaches(p, m.id, n.id));
    if (upstreamWarn.length)
      add("EXPOSURE_UPSTREAM_WARN", "warn", "Upstream test warnings", `Data feeding ${n.name} passed through ${upstreamWarn.map((m) => m.name).join(", ")}, which had test warnings in the last run.`,
        "Check whether the warning rows reach the metrics on this dashboard.");
    return f;
  }

  const isMart = n.layer === "mart";
  const physical = n.materialized !== "ephemeral";

  // run status
  if (n.status === "error") add("RUN_ERROR", "error", "Last run failed", `${n.name} errored in the last run.`, "Check the run log and compiled SQL.");
  if (n.status === "skipped") add("RUN_SKIPPED", "error", "Skipped in last run", `${n.name} was skipped because an upstream node failed.`, "Fix the upstream failure first.");

  // tests that failed or warned
  const failing = n.tests.filter((t) => t.status === "fail" || t.status === "error");
  const warning = n.tests.filter((t) => t.status === "warn");
  for (const t of failing)
    add("TEST_FAILING", "error", `Failing test: ${t.kind}${t.column ? ` on ${t.column}` : ""}`,
      `${t.name} failed${t.failures ? ` with ${t.failures} bad row${t.failures === 1 ? "" : "s"}` : ""}.`, fixForTest(t.kind));
  for (const t of warning)
    add("TEST_WARNING", "warn", `Test warning: ${t.kind}${t.column ? ` on ${t.column}` : ""}`,
      `${t.name} returned ${t.failures ?? "some"} rows (severity: warn).`, fixForTest(t.kind));

  // coverage
  if (!n.tests.length) add("NO_TESTS", isMart ? "error" : "warn", "No tests", `${n.name} has no data tests at all.`,
    "Start with `unique` and `not_null` on the primary key.");
  else if (physical) {
    const pk = n.columns.find((c) => c.tests.includes("unique") && c.tests.includes("not_null"));
    const combo = n.tests.some((t) => /unique_combination|unique_key|grain/.test(t.kind));
    if (!pk && !combo)
      add("NO_PK_TEST", isMart ? "warn" : "info", "Grain not tested", `No column on ${n.name} is tested as both unique and not_null, so duplicate rows would pass silently.`,
        "Test the primary key, or use `dbt_utils.unique_combination_of_columns` for a composite grain.");
  }

  // documentation
  if (!n.description) add("NO_DESCRIPTION", isMart ? "warn" : "info", "No model description", `${n.name} has no description.`,
    "State the grain (one row per …) and what the model is used for.");
  const cols = n.columns;
  if (cols.length) {
    const documented = cols.filter((c) => c.description).length;
    const pct = documented / cols.length;
    if (pct < 0.5 && (isMart || n.layer === "staging"))
      add("COLUMNS_UNDOCUMENTED", isMart ? "warn" : "info", "Columns mostly undocumented",
        `${documented} of ${cols.length} columns have descriptions (${Math.round(pct * 100)}%).`, "Document at least the keys and every metric column.");
  }

  // structure
  const srcParents = n.parents.filter((x) => p.nodes.get(x)?.type === "source");
  if (srcParents.length && n.layer !== "staging")
    add("SOURCE_IN_MART", "warn", "Reads a raw source directly", `${n.name} selects from ${srcParents.map((x) => p.nodes.get(x)!.name).join(", ")} instead of a staging model, so cleaning logic is skipped or duplicated.`,
      "Point it at the matching `stg_` model.");
  if ((n.layer === "staging" || n.layer === "intermediate") && n.children.length === 0)
    add("UNUSED_MODEL", "info", "Nothing uses this model", `${n.name} has no downstream models or exposures.`, "Wire it into a mart, or delete it to cut build time.");
  if (n.sql && /select\s+\*\s+from/i.test(n.sql) && isMart)
    add("SELECT_STAR", "info", "select * in a mart", `${n.name} uses select *, so upstream column changes reach consumers without review.`,
      "List columns explicitly in marts.");
  if (n.materialized === "incremental" && !n.uniqueKey)
    add("INCREMENTAL_NO_KEY", "warn", "Incremental without unique_key", "Late-arriving updates will create duplicates.", "Set `unique_key` in the config.");
  const fanIn = n.parents.length;
  if (fanIn >= 5) add("HIGH_FAN_IN", "info", "Many direct parents", `${n.name} joins ${fanIn} upstream nodes.`, "Consider an intermediate model to isolate join logic.");

  return f;
}

function fixForTest(kind: string): string {
  switch (kind) {
    case "not_null": return "Find the rows with `select * from <model> where <column> is null` and fix them at the source or in staging.";
    case "unique": return "Look for a fan-out join upstream; check the grain of each joined table.";
    case "accepted_values": return "A new value appeared. Decide if it is valid; if so, add it to the accepted list and to downstream logic.";
    case "relationships": return "Orphaned keys: check load order or late-arriving dimension rows.";
    default: return "Run `dbt test --select <test>` and inspect the failing rows (`--store-failures` helps).";
  }
}

export const isBroken = (n: Node) =>
  n.status === "error" || n.status === "skipped" || n.tests.some((t) => t.status === "fail" || t.status === "error");

function reaches(p: Project, from: string, to: string): boolean {
  const stack = [from]; const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(p.nodes.get(id)?.children ?? []));
  }
  return false;
}

export const scoreOf = (flags: Flag[]) => Math.max(0, 100 - flags.reduce((s, f) => s + W[f.severity], 0));

export interface HealthReport {
  score: number;
  counts: Record<Severity, number>;
  flags: Flag[];
  byNode: Map<string, Flag[]>;
  coverage: { models: number; tested: number; documented: number; pkTested: number };
  tests: { total: number; pass: number; warn: number; fail: number; notRun: number };
}

export function healthReport(p: Project): HealthReport {
  const byNode = new Map<string, Flag[]>();
  const flags: Flag[] = [];
  for (const n of p.nodes.values()) {
    const f = checkNode(p, n);
    byNode.set(n.id, f);
    flags.push(...f);
  }
  const ms = models(p);
  const scores = ms.map((m) => scoreOf(byNode.get(m.id) ?? []));
  const counts = { error: 0, warn: 0, info: 0 } as Record<Severity, number>;
  flags.forEach((f) => counts[f.severity]++);
  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity] || a.nodeId.localeCompare(b.nodeId));
  return {
    score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 100,
    counts,
    flags,
    byNode,
    coverage: {
      models: ms.length,
      tested: ms.filter((m) => m.tests.length).length,
      documented: ms.filter((m) => m.description).length,
      pkTested: ms.filter((m) => m.columns.some((c) => c.tests.includes("unique") && c.tests.includes("not_null"))).length,
    },
    tests: {
      total: p.tests.length,
      pass: p.tests.filter((t) => t.status === "pass").length,
      warn: p.tests.filter((t) => t.status === "warn").length,
      fail: p.tests.filter((t) => t.status === "fail" || t.status === "error").length,
      notRun: p.tests.filter((t) => !t.status).length,
    },
  };
}
