import type { Node, Project } from "./project";

export type Direction = "upstream" | "downstream" | "both";

export interface LineageEntry { node: Node; distance: number; direction: "upstream" | "downstream" }

/** Breadth-first walk of the DAG. distance 1 = direct parent/child. */
export function walk(p: Project, startId: string, direction: Direction, maxDepth = 25): LineageEntry[] {
  const out: LineageEntry[] = [];
  const dirs: ("upstream" | "downstream")[] = direction === "both" ? ["upstream", "downstream"] : [direction];
  for (const d of dirs) {
    const seen = new Set<string>([startId]);
    let frontier = [startId];
    for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        const n = p.nodes.get(id);
        if (!n) continue;
        for (const nb of d === "upstream" ? n.parents : n.children) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          next.push(nb);
          out.push({ node: p.nodes.get(nb)!, distance: depth, direction: d });
        }
      }
      frontier = next;
    }
  }
  return out;
}

/** Ids for a focused subgraph around one or more nodes: the nodes plus `hops` levels each way. */
export function neighborhood(p: Project, ids: string[], hops = 2): Set<string> {
  const keep = new Set(ids.filter((i) => p.nodes.has(i)));
  for (const id of [...keep]) for (const e of walk(p, id, "both", hops)) keep.add(e.node.id);
  return keep;
}

/** Everything a change to this node can break: downstream models, exposures and the tests on them. */
export function impact(p: Project, id: string) {
  const down = walk(p, id, "downstream");
  const models = down.filter((e) => e.node.type === "model" || e.node.type === "snapshot");
  const exposures = down.filter((e) => e.node.type === "exposure");
  const testCount = models.reduce((s, e) => s + e.node.tests.length, 0);
  return { models, exposures, testCount };
}

/** Longest-path layering for a left-to-right DAG drawing, with barycenter ordering inside each layer. */
export function layout(p: Project, ids: Set<string>) {
  const list = [...ids].map((i) => p.nodes.get(i)!).filter(Boolean);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (n: Node): number => {
    if (depth.has(n.id)) return depth.get(n.id)!;
    if (visiting.has(n.id)) return 0; // cycle guard
    visiting.add(n.id);
    const ps = n.parents.filter((x) => ids.has(x)).map((x) => d(p.nodes.get(x)!));
    const v = ps.length ? Math.max(...ps) + 1 : 0;
    visiting.delete(n.id);
    depth.set(n.id, v);
    return v;
  };
  list.forEach(d);
  const cols: Node[][] = [];
  for (const n of list) (cols[depth.get(n.id)!] ??= []).push(n);
  const order = new Map<string, number>();
  cols.forEach((c) => c.sort((a, b) => a.name.localeCompare(b.name)).forEach((n, i) => order.set(n.id, i)));
  for (let pass = 0; pass < 4; pass++) {
    for (let ci = 1; ci < cols.length; ci++) {
      const c = cols[ci] ?? [];
      const bary = (n: Node) => {
        const ps = n.parents.filter((x) => order.has(x) && depth.get(x)! < ci);
        return ps.length ? ps.reduce((s, x) => s + order.get(x)!, 0) / ps.length : order.get(n.id)!;
      };
      c.sort((a, b) => bary(a) - bary(b)).forEach((n, i) => order.set(n.id, i));
    }
  }
  const edges: [string, string][] = [];
  for (const n of list) for (const par of n.parents) if (ids.has(par)) edges.push([par, n.id]);
  return { columns: cols.map((c) => c ?? []), edges };
}
