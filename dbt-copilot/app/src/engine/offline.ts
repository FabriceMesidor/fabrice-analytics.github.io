// Rule-based answers used when no Claude API endpoint is configured (or it is unreachable).
// It recognizes the common question shapes and answers from the same tools the LLM uses.
import type { Project } from "./project";
import { models, resolveNode } from "./project";
import { executeTool } from "./tools";
import { checkNode, healthReport, scoreOf } from "./health";
import { walk } from "./lineage";

export interface Answer { text: string; focus: string[]; trace: { tool: string; input: Record<string, unknown> }[]; mode: "offline" | "ai" }

const has = (q: string, re: RegExp) => re.test(q);

export function answerOffline(p: Project, question: string): Answer {
  const q = question.toLowerCase();
  const trace: Answer["trace"] = [];
  const run = (tool: string, input: Record<string, unknown>) => { trace.push({ tool, input }); return executeTool(p, tool, input); };
  const node = resolveNode(p, question);
  const out = (text: string, focus: string[]): Answer => ({ text, focus, trace, mode: "offline" });

  // coverage questions
  if (has(q, /(without|no|missing|lack|lacking|zero)\s+(any\s+)?(tests?|description|docs|documentation)|untested|undocumented/)) {
    const docs = has(q, /desc|doc/);
    const ms = models(p).filter((m) => (docs ? !m.description : m.tests.length === 0));
    trace.push({ tool: "list_models", input: {} });
    if (!ms.length) return out(docs ? "Every model has a description." : "Every model has at least one test.", []);
    return out(`**${ms.length} model${ms.length > 1 ? "s" : ""} ${docs ? "without a description" : "without any tests"}:**\n` +
      ms.map((m) => `- \`${m.name}\` (${m.layer})`).join("\n"), ms.map((m) => m.id));
  }

  // project-wide health
  if (!node && has(q, /health|issue|problem|fail|broken|wrong|risk|quality|warn|flag|audit|review/)) {
    const r = healthReport(p);
    run("get_health", {});
    const top = r.flags.filter((f) => f.severity !== "info").slice(0, 7);
    return out(
      `**Project health: ${r.score}/100.** ${r.counts.error} errors, ${r.counts.warn} warnings, ${r.counts.info} notes.\n` +
      `Tests in the last run: ${r.tests.pass} passed, ${r.tests.warn} warned, ${r.tests.fail} failed.\n\n` +
      (top.length ? "**Fix first:**\n" + top.map((f) => `- **${p.nodes.get(f.nodeId)!.name}**: ${f.title}. ${f.detail}`).join("\n") : "No errors or warnings."),
      [...new Set(top.map((f) => f.nodeId))],
    );
  }

  if (!node) {
    if (has(q, /list|all models|which models|what models|show.*models|marts|staging/)) {
      const layer = has(q, /mart/) ? "mart" : has(q, /staging|stg/) ? "staging" : has(q, /intermediate|int_/) ? "intermediate" : undefined;
      const { result } = run("list_models", layer ? { layer } : {});
      const rows = result as { name: string; layer: string; description: string; health: number }[];
      return out(`**${rows.length} ${layer ?? ""} models:**\n` + rows.map((r) => `- \`${r.name}\` (${r.layer}, health ${r.health}): ${r.description}`).join("\n"), []);
    }
    const { result, focus } = run("search", { query: question });
    const hits = result as { name: string; layer: string; description: string }[];
    if (!hits.length)
      return out("I couldn't match that to a model. Try naming one, for example `fct_rent_payments`, or ask \"what are the biggest health issues?\"", []);
    return out("I'm not sure which model you mean. Closest matches:\n" + hits.slice(0, 5).map((h) => `- \`${h.name}\` (${h.layer}): ${h.description}`).join("\n"), focus);
  }

  // node-specific intents
  if (has(q, /downstream|impact|break|blast|affect|depend(s|ing)? on (it|this)|who uses|what uses|consumers|if i (change|drop|rename)/)) {
    const { result, focus } = run("get_impact", { name: node.name });
    const r = result as { downstream_models: { name: string; hops: number }[]; exposures: { name: string; owner?: string }[]; tests_on_downstream_models: number };
    if (!r.downstream_models.length && !r.exposures.length) return out(`Nothing depends on \`${node.name}\`. It's a leaf node.`, focus);
    return out(
      `Changing \`${node.name}\` reaches **${r.downstream_models.length} downstream model${r.downstream_models.length === 1 ? "" : "s"}**` +
      (r.exposures.length ? ` and **${r.exposures.length} exposure${r.exposures.length > 1 ? "s" : ""}** (${r.exposures.map((e) => e.name + (e.owner ? `, owned by ${e.owner}` : "")).join("; ")})` : "") +
      `, covered by ${r.tests_on_downstream_models} tests.\n\n` +
      r.downstream_models.map((m) => `- \`${m.name}\` (${m.hops} hop${m.hops > 1 ? "s" : ""})`).join("\n"),
      focus,
    );
  }
  if (has(q, /upstream|depend|come from|comes from|built from|feed|source|parents|lineage|where does/)) {
    const { result, focus } = run("get_lineage", { name: node.name, direction: "upstream" });
    const r = result as { nodes: { name: string; type: string; hops: number }[] };
    if (!r.nodes.length) return out(`\`${node.name}\` has no upstream dependencies in this project.`, focus);
    const srcs = r.nodes.filter((n) => n.type === "source");
    return out(
      `\`${node.name}\` is built from **${r.nodes.length} upstream node${r.nodes.length > 1 ? "s" : ""}**, starting from ${srcs.length} raw source${srcs.length === 1 ? "" : "s"}.\n\n` +
      r.nodes.sort((a, b) => a.hops - b.hops).map((n) => `- \`${n.name}\` (${n.type === "source" ? "source" : n.hops === 1 ? "direct parent" : n.hops + " hops"})`).join("\n"),
      focus,
    );
  }
  if (has(q, /health|issue|problem|fail|broken|wrong|test|risk|quality|trust|flag|safe|reliable/)) {
    const flags = checkNode(p, node);
    run("get_health", { name: node.name });
    // lineage-aware: a model is only as trustworthy as what feeds it
    const up = walk(p, node.id, "upstream").map((e) => e.node)
      .map((n) => ({ n, f: checkNode(p, n).filter((x) => x.severity !== "info" && /TEST_|RUN_|SOURCE_IN_MART|SRC_NO_FRESHNESS/.test(x.code)) }))
      .filter((x) => x.f.length);
    if (up.length) trace.push({ tool: "get_lineage", input: { name: node.name, direction: "upstream" } });
    const own = flags.length
      ? flags.map((f) => `- **${f.title}** (${f.severity}). ${f.detail} *Fix:* ${f.fix}`).join("\n")
      : `- No issues on \`${node.name}\` itself.`;
    const upstream = up.length
      ? `\n\n**Upstream (${up.length} node${up.length > 1 ? "s" : ""} with issues):**\n` + up.slice(0, 6).map((x) => `- \`${x.n.name}\`: ${x.f.map((f) => f.title).join("; ")}`).join("\n")
      : "\n\nEverything upstream passed its tests in the last run.";
    return out(`**\`${node.name}\` health: ${scoreOf(flags)}/100**\n\n${own}${upstream}`, [node.id, ...up.map((x) => x.n.id)]);
  }

  // "how is <column> calculated": show the SQL that produces it
  if (node.sql && has(q, /calculat|comput|derive|logic|defined|formula|how (is|are|does)/)) {
    run("get_model", { name: node.name });
    const words = q.split(/[^a-z0-9_]+/).filter((w) => w.length > 2);
    const lines = node.sql.split("\n");
    const aliasLine = (name: string) => lines.findIndex((l) => new RegExp(`\\bas\\s+${name}\\b`, "i").test(l));
    // the column the question names: a documented column, or any alias the SQL defines
    const colName = node.columns.map((c) => c.name).find((c) => words.includes(c))
      ?? words.find((w) => w.includes("_") || w.length > 4 ? aliasLine(w) >= 0 : false);
    const col = colName ? node.columns.find((c) => c.name === colName) ?? { name: colName, description: "" } : undefined;
    let snippet: string[];
    if (col) {
      const end = aliasLine(col.name);
      let start = end;
      while (start > 0 && !/^\s*(select\b|,|\w+\.\w+,?\s*$)/i.test(lines[start - 1]) && end - start < 12) start--;
      snippet = end >= 0 ? lines.slice(Math.max(0, start), end + 1) : lines.slice(0, 14);
    } else snippet = lines.slice(0, 16);
    return out(
      `${col ? `**\`${col.name}\`** in` : "The logic of"} \`${node.name}\`${col?.description ? `: ${col.description}` : ""}\n\n` +
      "```sql\n" + snippet.join("\n").replace(/^\s{4}/gm, "") + "\n```\n" +
      `Built from ${node.parents.map((x) => `\`${p.nodes.get(x)!.name}\``).join(", ") || "no upstream models"}. Open the Model tab for the full SQL.`,
      [node.id],
    );
  }

  // default for a named node: explain it
  const { result } = run("get_model", { name: node.name });
  const m = result as { description: string; materialized?: string; columns: { name: string; description?: string; tests?: string[] }[]; parents: string[]; children: string[]; health: { score: number; flags: { issue: string }[] }; path?: string; last_run: unknown };
  const cols = m.columns.slice(0, 12).map((c) => `- \`${c.name}\`${c.description ? `: ${c.description}` : ""}${c.tests ? ` *(tests: ${c.tests.join(", ")})*` : ""}`).join("\n");
  return out(
    `**\`${node.name}\`** ${node.type === "model" ? `is ${/^[aeiou]/.test(m.materialized ?? "") ? "an" : "a"} ${m.materialized ?? ""} ${node.layer} model` : `is a ${node.type}`}${m.path ? ` in \`${m.path}\`` : ""}.\n\n` +
    `${m.description}\n\n` +
    (m.parents.length ? `**Built from:** ${m.parents.map((x) => `\`${x}\``).join(", ")}\n` : "") +
    (m.children.length ? `**Used by:** ${m.children.map((x) => `\`${x}\``).join(", ")}\n` : "") +
    (cols ? `\n**Columns:**\n${cols}\n` : "") +
    `\n**Health:** ${m.health.score}/100${m.health.flags.length ? ` (${m.health.flags.map((f) => f.issue).join("; ")})` : ""}`,
    [node.id],
  );
}
