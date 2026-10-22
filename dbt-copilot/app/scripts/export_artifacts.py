"""Trim dbt artifacts (manifest, run_results, catalog) to the fields dbt Copilot reads.

The output keeps dbt's own shapes, so the app loads it with the same code path it
uses for a full manifest.json a visitor uploads.

    python3 scripts/export_artifacts.py ../sample_project/target src/data/harbor_lease.json
"""
import json
import sys
from pathlib import Path

NODE_KEYS = ["unique_id", "name", "resource_type", "package_name", "original_file_path", "description",
             "schema", "database", "tags", "raw_code", "column_name", "attached_node", "meta"]
CONFIG_KEYS = ["materialized", "severity", "unique_key", "schema", "where", "enabled"]


def trim_node(n):
    out = {k: n[k] for k in NODE_KEYS if k in n and n[k] not in (None, "", [], {})}
    out["config"] = {k: n["config"][k] for k in CONFIG_KEYS if k in n.get("config", {}) and n["config"][k] is not None}
    out["depends_on"] = {"nodes": n.get("depends_on", {}).get("nodes", [])}
    if n.get("columns"):
        out["columns"] = {c: {"name": v["name"], "description": v.get("description", ""), "data_type": v.get("data_type")}
                          for c, v in n["columns"].items()}
    if n.get("test_metadata"):
        tm = n["test_metadata"]
        kwargs = {k: v for k, v in tm.get("kwargs", {}).items() if k in ("column_name", "values", "to", "field")}
        out["test_metadata"] = {"name": tm["name"], "kwargs": kwargs}
    return out


def main(target_dir, out_path):
    t = Path(target_dir)
    manifest = json.loads((t / "manifest.json").read_text())
    run_results = json.loads((t / "run_results.json").read_text())
    catalog = json.loads((t / "catalog.json").read_text()) if (t / "catalog.json").exists() else {"nodes": {}}

    nodes = {uid: trim_node(n) for uid, n in manifest["nodes"].items() if n["resource_type"] in ("model", "test", "snapshot")}
    # column data types from the catalog, when the manifest does not declare them
    for uid, cat in catalog.get("nodes", {}).items():
        if uid not in nodes:
            continue
        cols = nodes[uid].setdefault("columns", {})
        for cname, c in cat.get("columns", {}).items():
            key = cname.lower()
            col = cols.setdefault(key, {"name": key, "description": "", "data_type": None})
            col["data_type"] = col.get("data_type") or c.get("type")

    sources = {}
    for uid, s in manifest["sources"].items():
        sources[uid] = {
            "unique_id": uid, "name": s["name"], "source_name": s["source_name"], "resource_type": "source",
            "description": s.get("description", ""), "schema": s.get("schema"),
            "loaded_at_field": s.get("loaded_at_field"),
            "freshness": {k: v for k, v in (s.get("freshness") or {}).items() if v and k in ("warn_after", "error_after")
                          and (v.get("count") is not None)},
            "original_file_path": s.get("original_file_path"),
        }
    exposures = {uid: {"unique_id": uid, "name": e["name"], "label": e.get("label"), "type": e.get("type"),
                       "description": e.get("description", ""), "maturity": e.get("maturity"),
                       "owner": {"name": e.get("owner", {}).get("name")},
                       "depends_on": {"nodes": e.get("depends_on", {}).get("nodes", [])}}
                 for uid, e in manifest.get("exposures", {}).items()}

    results = [{"unique_id": r["unique_id"], "status": r["status"], "execution_time": round(r.get("execution_time") or 0, 3),
                "failures": r.get("failures"), "message": (r.get("message") or "")[:300]}
               for r in run_results["results"] if r["unique_id"] in nodes]

    out = {
        "metadata": {"project_name": manifest["metadata"].get("project_name", "harbor_lease"),
                     "dbt_version": manifest["metadata"]["dbt_version"],
                     "generated_at": run_results["metadata"]["generated_at"]},
        "manifest": {"metadata": {"dbt_schema_version": manifest["metadata"]["dbt_schema_version"]},
                     "nodes": nodes, "sources": sources, "exposures": exposures},
        "run_results": {"metadata": {"generated_at": run_results["metadata"]["generated_at"]}, "results": results},
    }
    Path(out_path).write_text(json.dumps(out, indent=1))
    print(f"wrote {out_path}: {sum(1 for n in nodes.values() if n['resource_type']=='model')} models, "
          f"{sum(1 for n in nodes.values() if n['resource_type']=='test')} tests, {len(sources)} sources, "
          f"{len(results)} run results, {Path(out_path).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
