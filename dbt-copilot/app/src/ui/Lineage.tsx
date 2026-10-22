import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Layer } from "../engine/project";
import { layout, neighborhood } from "../engine/lineage";
import type { HealthReport } from "../engine/health";

const W = 176, H = 42, GX = 44, GY = 12, PAD = 16;
const LAYER_LABEL: Record<Layer, string> = { source: "Source", staging: "Staging", intermediate: "Intermediate", mart: "Mart", exposure: "Exposure", other: "Model" };

export default function Lineage({ project, focus, selected, report, onSelect }: {
  project: Project; focus: string[]; selected: string | null; report: HealthReport; onSelect: (id: string) => void;
}) {
  const big = project.nodes.size > 45;
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [focus.join("|")]);
  const anchor = focus.length ? focus : selected ? [selected] : [];
  const zoomed = focus.length > 0 && !showAll;
  const ids = useMemo(() => {
    // after an answer: just the nodes it used plus their direct neighbors
    if (zoomed) return focus.length > 1 ? new Set(focus.slice(0, 40).filter((i) => project.nodes.has(i))) : neighborhood(project, focus, 1);
    if (!big) return new Set(project.nodes.keys());
    if (anchor.length) return neighborhood(project, anchor.slice(0, 12), 1);
    const marts = [...project.nodes.values()].filter((n) => n.layer === "exposure" || n.layer === "mart").slice(0, 25).map((n) => n.id);
    return neighborhood(project, marts, 0);
  }, [project, big, zoomed, anchor.join("|")]);

  const { columns, edges } = useMemo(() => layout(project, ids), [project, ids]);
  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((col, ci) => col.forEach((n, ri) => pos.set(n.id, { x: PAD + ci * (W + GX), y: PAD + 22 + ri * (H + GY) })));
  const width = PAD * 2 + Math.max(1, columns.length) * (W + GX) - GX;
  const height = PAD * 2 + 22 + Math.max(1, ...columns.map((c) => c.length)) * (H + GY);
  const lit = new Set(focus);
  const dim = (id: string) => lit.size > 0 && !lit.has(id);

  const worst = (id: string) => {
    const f = report.byNode.get(id) ?? [];
    return f.some((x) => x.severity === "error") ? "error" : f.some((x) => x.severity === "warn") ? "warn" : "ok";
  };
  const colLayer = (ci: number) => {
    const layers = new Set(columns[ci].map((n) => n.layer));
    return layers.size === 1 ? LAYER_LABEL[[...layers][0]] : "";
  };

  const wrap = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(800);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el); setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = zoomed ? Math.max(0.72, Math.min(1, (avail - 8) / width)) : 1;
  useEffect(() => {
    const el = wrap.current; const target = selected ? pos.get(selected) : undefined;
    if (el && target && !zoomed) el.scrollTo({ left: Math.max(0, target.x - el.clientWidth / 2 + W / 2), behavior: "smooth" });
  }, [selected, zoomed]);

  return (
    <div className="lineage">
      <div className="legend small">
        {(["source", "staging", "intermediate", "mart", "exposure"] as Layer[]).map((l) => <span key={l}><i className={`sw ${l}`} />{LAYER_LABEL[l]}</span>)}
        <span><i className="hd error" />Failing</span><span><i className="hd warn" />Warning</span>
        {big && <span className="muted">Showing {ids.size} of {project.nodes.size} nodes around the current focus</span>}
        {zoomed && <span className="muted">Showing the nodes the last answer used.</span>}
        {focus.length > 0 && <button type="button" className="linkbtn" onClick={() => setShowAll(!showAll)}>{showAll ? "Zoom to answer" : "Show whole project"}</button>}
      </div>
      <div className="dagwrap" ref={wrap}>
        <svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lineage graph">
          {columns.map((_, ci) => (
            <text key={ci} x={PAD + ci * (W + GX)} y={PAD + 8} className="collabel">{colLayer(ci)}</text>
          ))}
          {edges.map(([a, b]) => {
            const s = pos.get(a), t = pos.get(b);
            if (!s || !t) return null;
            const x1 = s.x + W, y1 = s.y + H / 2, x2 = t.x, y2 = t.y + H / 2, mx = (x1 + x2) / 2;
            const on = lit.has(a) && lit.has(b);
            return <path key={a + b} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} className={`edge ${on ? "on" : ""} ${dim(a) || dim(b) ? "dim" : ""}`} />;
          })}
          {columns.flat().map((n) => {
            const pt = pos.get(n.id)!;
            const h = worst(n.id);
            const label = n.type === "source" ? n.name.split(".")[1] : n.name;
            return (
              <g key={n.id} transform={`translate(${pt.x},${pt.y})`} className={`dn ${n.layer} ${selected === n.id ? "sel" : ""} ${dim(n.id) ? "dim" : ""}`}
                onClick={() => onSelect(n.id)} tabIndex={0} role="button" aria-label={`${n.name}, ${LAYER_LABEL[n.layer]}`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
                <rect width={W} height={H} rx={3} />
                <rect width={4} height={H} className="band" />
                <text x={12} y={17} className="nm">{label.length > 22 ? label.slice(0, 21) + "…" : label}</text>
                <text x={12} y={32} className="sub">{n.type === "source" ? n.sourceName : n.type === "exposure" ? n.exposureType : n.materialized ?? n.type}</text>
                {h !== "ok" && <circle cx={W - 12} cy={H / 2} r={5} className={`hdot ${h}`} />}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
