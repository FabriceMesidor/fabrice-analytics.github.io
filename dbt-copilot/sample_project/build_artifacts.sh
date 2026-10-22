#!/usr/bin/env bash
# Rebuild the Harbor Lease warehouse and the dbt artifacts the app ships with.
# Order matters: the catalog needs built tables, and run_results.json must come from `dbt build`.
set -euo pipefail
cd "$(dirname "$0")"
export DBT_PROFILES_DIR=.
python3 gen_seeds.py
dbt seed
dbt build --exclude resource_type:seed || true   # one test fails and one warns on purpose
dbt docs generate
dbt build --exclude resource_type:seed || true
python3 ../app/scripts/export_artifacts.py target ../app/src/data/harbor_lease.json
