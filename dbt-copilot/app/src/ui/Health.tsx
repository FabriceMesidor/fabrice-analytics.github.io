import type { Project } from "../engine/project";
import type { HealthReport, Severity } from "../engine/health";

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

export default function Health({ project, report, onSelect }: { project: Project; report: HealthReport; onSelect: (id: string) => void }) {
  const { coverage: c, tests: t, counts } = report;
  const bars = [
    { label: "Models with tests", v: c.tested, of: c.models },
    { label: "Models with a tested primary key", v: c.pkTested, of: c.models },
    { label: "Models with a description", v: c.documented, of: c.models },
  ];
  const groups: Severity[] = ["error", "warn", "info"];
  const names: Record<Severity, string> = { error: "Errors", warn: "Warnings", info: "Notes" };
  return (
    <div className="health">
      <div className="hsum">
        <div className="hscore"><span className="big">{report.score}</span><span className="muted small">project health, average of {c.models} models</span></div>
        <div className="counts">
          {groups.map((g) => <div key={g} className={`cnt ${g}`}><b>{counts[g]}</b><span className="small">{names[g]}</span></div>)}
        </div>
      </div>
      <div className="bars">
        {bars.map((b) => (
          <div key={b.label} className="bar">
            <div className="small"><span>{b.label}</span><span className="mono">{b.v}/{b.of} · {pct(b.v, b.of)}%</span></div>
            <div className="track"><i style={{ width: `${pct(b.v, b.of)}%` }} /></div>
          </div>
        ))}
        {project.hasRunResults ? (
          <div className="bar">
            <div className="small"><span>Tests in last run</span><span className="mono">{t.pass} pass · {t.warn} warn · {t.fail} fail</span></div>
            <div className="track stack">
              <i className="pass" style={{ width: `${pct(t.pass, t.total)}%` }} />
              <i className="warn" style={{ width: `${pct(t.warn, t.total)}%` }} />
              <i className="fail" style={{ width: `${pct(t.fail, t.total)}%` }} />
            </div>
          </div>
        ) : <p className="small muted">Load run_results.json with your manifest to see test outcomes.</p>}
      </div>
      {groups.map((g) => {
        const fs = report.flags.filter((f) => f.severity === g);
        if (!fs.length) return null;
        return (
          <div key={g} className="flags">
            <h3>{names[g]} <span className="muted small">{fs.length}</span></h3>
            {fs.map((f, i) => (
              <div key={i} className={`flag ${f.severity}`}>
                <div><button type="button" className="nodechip" onClick={() => onSelect(f.nodeId)}>{project.nodes.get(f.nodeId)!.name}</button> <b>{f.title}</b></div>
                <div className="small">{f.detail}</div>
                <div className="small muted">Fix: {f.fix}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
