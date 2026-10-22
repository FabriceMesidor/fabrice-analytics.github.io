import type { Project } from "../engine/project";
import type { HealthReport } from "../engine/health";
import { scoreOf } from "../engine/health";
import { impact } from "../engine/lineage";

export default function ModelView({ project, id, report, onSelect }: { project: Project; id: string | null; report: HealthReport; onSelect: (id: string) => void }) {
  const n = id ? project.nodes.get(id) : undefined;
  if (!n) return <div className="empty">Pick a node in the lineage graph, or click a model name in an answer, to see its columns, tests, health and SQL.</div>;
  const flags = report.byNode.get(n.id) ?? [];
  const im = impact(project, n.id);
  const chip = (x: string) => {
    const m = project.nodes.get(x)!;
    return <button key={x} type="button" className={`nodechip ${m.layer}`} onClick={() => onSelect(x)}>{m.type === "source" ? m.name : m.name}</button>;
  };
  const colTests = (c: (typeof n.columns)[number]) => c.tests.map((t) => {
    const test = n.tests.find((x) => x.column === c.name && x.kind === t);
    const st = test?.status;
    return <span key={t} className={`tbadge ${st === "fail" || st === "error" ? "fail" : st === "warn" ? "warn" : st === "pass" ? "pass" : ""}`}>{t}</span>;
  });

  return (
    <div className="model">
      <div className="mhead">
        <div>
          <p className="eyebrow mono">{n.layer} · {n.type === "model" ? n.materialized : n.type}{n.status ? ` · last run ${n.status}` : ""}</p>
          <h2 className="mono">{n.name}</h2>
          {n.path && <p className="muted mono small">{n.path}</p>}
        </div>
        <div className="mscore"><span className="big">{scoreOf(flags)}</span><span className="muted small">health</span></div>
      </div>
      <p className={n.description ? "" : "muted"}>{n.description || "No description."}</p>

      <div className="rel">
        {n.parents.length > 0 && <div><span className="label">Built from</span>{n.parents.map(chip)}</div>}
        {n.children.length > 0 && <div><span className="label">Used by</span>{n.children.map(chip)}</div>}
        {(im.models.length > 0 || im.exposures.length > 0) && (
          <p className="small muted">Blast radius: {im.models.length} downstream model{im.models.length === 1 ? "" : "s"}{im.exposures.length ? `, ${im.exposures.length} exposure${im.exposures.length > 1 ? "s" : ""}` : ""}.</p>
        )}
      </div>

      {flags.length > 0 && (
        <div className="flags">
          <h3>Health flags</h3>
          {flags.map((f, i) => (
            <div key={i} className={`flag ${f.severity}`}>
              <div><b>{f.title}</b> <span className="sevtag mono">{f.severity}</span></div>
              <div className="small">{f.detail}</div>
              <div className="small muted">Fix: {f.fix}</div>
            </div>
          ))}
        </div>
      )}

      {n.columns.length > 0 && (
        <div className="cols">
          <h3>Columns <span className="muted small">{n.columns.filter((c) => c.description).length} of {n.columns.length} documented</span></h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Column</th><th>Type</th><th>Description</th><th>Tests</th></tr></thead>
              <tbody>{n.columns.map((c) => (
                <tr key={c.name}><td className="mono">{c.name}</td><td className="mono muted small">{c.dataType ?? ""}</td><td className={c.description ? "" : "muted"}>{c.description || "–"}</td><td>{colTests(c)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {n.tests.filter((t) => !t.column).length > 0 && (
        <p className="small">Model-level tests: {n.tests.filter((t) => !t.column).map((t) => t.kind).join(", ")}</p>
      )}

      {n.sql && (
        <div>
          <h3>SQL</h3>
          <pre className="sql"><code>{n.sql}</code></pre>
        </div>
      )}
    </div>
  );
}
