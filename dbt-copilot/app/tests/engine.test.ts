import { describe, expect, it } from "vitest";
import bundle from "../src/data/harbor_lease.json";
import { loadProject, models, resolveNode } from "../src/engine/project";
import { impact, layout, neighborhood, walk } from "../src/engine/lineage";
import { checkNode, healthReport } from "../src/engine/health";
import { executeTool } from "../src/engine/tools";
import { answerOffline } from "../src/engine/offline";

const p = loadProject(bundle as any);
const id = (name: string) => resolveNode(p, name)!.id;
const codes = (name: string) => checkNode(p, p.nodes.get(id(name))!).map((f) => f.code);

describe("loading", () => {
  it("reads models, sources, exposures and tests", () => {
    expect(models(p)).toHaveLength(20);
    expect([...p.nodes.values()].filter((n) => n.type === "source")).toHaveLength(7);
    expect([...p.nodes.values()].filter((n) => n.type === "exposure")).toHaveLength(1);
    expect(p.tests.length).toBe(37);
    expect(p.hasRunResults).toBe(true);
  });
  it("attaches column tests and catalog types", () => {
    const f = p.nodes.get(id("fct_rent_payments"))!;
    const pk = f.columns.find((c) => c.name === "payment_id")!;
    expect(pk.tests).toEqual(expect.arrayContaining(["unique", "not_null"]));
    expect(pk.dataType).toBeTruthy();
  });
  it("rejects files that are not manifests", () => {
    expect(() => loadProject({ hello: 1 })).toThrow(/manifest/);
  });
});

describe("name resolution", () => {
  it.each([
    ["fct_rent_payments", "fct_rent_payments"],
    ["What feeds the delinquency mart?", "mart_delinquency_monthly"],
    ["explain rent payments", "fct_rent_payments"],
    ["raw_payments", "harbor.raw_payments"],
    ["the executive dashboard", "executive_portfolio_dashboard"],
  ])("%s -> %s", (q, expected) => expect(resolveNode(p, q)?.name).toBe(expected));
});

describe("lineage", () => {
  it("walks upstream to the raw sources", () => {
    const up = walk(p, id("mart_delinquency_monthly"), "upstream").map((e) => e.node.name);
    expect(up).toEqual(expect.arrayContaining(["fct_rent_payments", "int_payments_with_status", "harbor.raw_payments", "harbor.raw_tenants"]));
  });
  it("finds the exposure in the blast radius of a staging model", () => {
    const im = impact(p, id("stg_harbor__payments"));
    expect(im.exposures.map((e) => e.node.name)).toContain("executive_portfolio_dashboard");
    expect(im.models.map((e) => e.node.name)).toContain("mart_portfolio_kpis");
  });
  it("lays out a neighborhood left to right", () => {
    const ids = neighborhood(p, [id("fct_rent_payments")], 2);
    const { columns, edges } = layout(p, ids);
    const colOf = (n: string) => columns.findIndex((c) => c.some((x) => x.name === n));
    expect(colOf("int_payments_with_status")).toBeLessThan(colOf("fct_rent_payments"));
    for (const [a, b] of edges) expect(colOf(p.nodes.get(a)!.name)).toBeLessThan(colOf(p.nodes.get(b)!.name));
  });
});

describe("health checks catch the planted issues", () => {
  it("failing accepted_values test on fct_leases", () => expect(codes("fct_leases")).toContain("TEST_FAILING"));
  it("warning not_null test on stg_harbor__payments", () => expect(codes("stg_harbor__payments")).toContain("TEST_WARNING"));
  it("dim_properties reads a raw source", () => expect(codes("dim_properties")).toContain("SOURCE_IN_MART"));
  it("unused, untested staging model", () => {
    expect(codes("stg_harbor__maintenance_requests")).toEqual(expect.arrayContaining(["UNUSED_MODEL", "NO_TESTS", "NO_DESCRIPTION"]));
  });
  it("select * in the incremental mart", () => expect(codes("fct_rent_payments")).toContain("SELECT_STAR"));
  it("grain not tested on aggregate marts", () => expect(codes("mart_delinquency_monthly")).toContain("NO_PK_TEST"));
  it("sources feeding marts without freshness", () => {
    expect(codes("raw_leases")).toContain("SRC_NO_FRESHNESS");
    expect(codes("raw_payments")).not.toContain("SRC_NO_FRESHNESS");
  });
  it("a clean model has no errors", () => expect(codes("mart_occupancy").filter((c) => c.startsWith("TEST") || c.startsWith("RUN"))).toEqual([]));
  it("project report adds up", () => {
    const r = healthReport(p);
    expect(r.tests.fail).toBe(1);
    expect(r.tests.warn).toBe(1);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });
});

describe("tools", () => {
  it("get_model returns columns, parents and sql", () => {
    const { result, focus } = executeTool(p, "get_model", { name: "fct_leases" }) as any;
    expect(result.parents).toEqual(["int_leases_enriched"]);
    expect(result.sql).toMatch(/rent_vs_market_pct/);
    expect(focus).toHaveLength(1);
  });
  it("unknown names give a helpful error", () => {
    expect(() => executeTool(p, "get_model", { name: "nope_nothing" })).toThrow(/search or list_models/);
  });
  it("search finds by description words", () => {
    const { result } = executeTool(p, "search", { query: "occupancy" }) as any;
    expect(result[0].name).toBe("mart_occupancy");
  });
});

describe("offline answers", () => {
  it.each([
    ["What feeds mart_delinquency_monthly?", /built from/],
    ["What breaks if I change stg_harbor__payments?", /executive_portfolio_dashboard/],
    ["Is fct_leases healthy?", /Failing test/],
    ["What are the biggest health issues?", /Project health/],
    ["Which models have no tests?", /stg_harbor__maintenance_requests/],
    ["Explain fct_rent_payments", /an incremental mart model/],
    ["Can I trust the executive dashboard?", /Upstream/],
    ["list the marts", /mart models/],
  ])("%s", (q, re) => {
    const a = answerOffline(p, q);
    expect(a.text).toMatch(re);
    expect(a.trace.length).toBeGreaterThan(0);
  });
});

describe("calculation questions", () => {
  it("shows the SQL behind a column", () => {
    const a = answerOffline(p, "Explain how payment_status is calculated");
    expect(a.text).toMatch(/```sql/);
    expect(a.text).toMatch(/when p\.paid_on is null then 'missed'/);
    expect(a.text).toMatch(/as payment_status/);
  });
});
