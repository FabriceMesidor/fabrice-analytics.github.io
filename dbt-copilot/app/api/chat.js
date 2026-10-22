// Generated from server/handler.ts by npm run build:api. Do not edit by hand.

// server/handler.ts
import Anthropic from "@anthropic-ai/sdk";

// src/data/harbor_lease.json
var harbor_lease_default = {
  metadata: {
    project_name: "harbor_lease",
    dbt_version: "1.12.6",
    generated_at: "2026-10-22T16:56:56.341413Z"
  },
  manifest: {
    metadata: {
      dbt_schema_version: "https://schemas.getdbt.com/dbt/manifest/v12.json"
    },
    nodes: {
      "model.harbor_lease.int_leases_enriched": {
        unique_id: "model.harbor_lease.int_leases_enriched",
        name: "int_leases_enriched",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/intermediate/int_leases_enriched.sql",
        schema: "main",
        database: "harbor_lease",
        raw_code: "-- One row per lease with unit, property and tenant attributes attached.\nselect\n    l.lease_id,\n    l.tenant_id,\n    l.unit_id,\n    u.property_id,\n    t.credit_band,\n    u.bedrooms,\n    u.market_rent,\n    l.monthly_rent,\n    l.lease_start_on,\n    l.lease_end_on,\n    l.lease_status,\n    {{ months_between('l.lease_start_on', 'l.lease_end_on') }} + 1 as lease_term_months\nfrom {{ ref('stg_harbor__leases') }} l\njoin {{ ref('stg_harbor__units') }} u using (unit_id)\njoin {{ ref('stg_harbor__tenants') }} t using (tenant_id)",
        config: {
          materialized: "ephemeral",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__leases",
            "model.harbor_lease.stg_harbor__units",
            "model.harbor_lease.stg_harbor__tenants"
          ]
        }
      },
      "model.harbor_lease.int_payments_with_status": {
        unique_id: "model.harbor_lease.int_payments_with_status",
        name: "int_payments_with_status",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/intermediate/int_payments_with_status.sql",
        schema: "main",
        database: "harbor_lease",
        raw_code: "-- Classifies every rent obligation as on_time, late or missed.\nselect\n    p.payment_id,\n    p.lease_id,\n    l.property_id,\n    l.credit_band,\n    p.due_on,\n    p.paid_on,\n    l.monthly_rent as amount_due,\n    p.amount_paid,\n    p.payment_method,\n    case\n        when p.paid_on is null then 'missed'\n        when p.paid_on > p.due_on + interval 5 day then 'late'\n        else 'on_time'\n    end as payment_status,\n    case when p.paid_on is not null then date_diff('day', p.due_on, p.paid_on) end as days_to_pay\nfrom {{ ref('stg_harbor__payments') }} p\njoin {{ ref('int_leases_enriched') }} l using (lease_id)",
        config: {
          materialized: "ephemeral",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__payments",
            "model.harbor_lease.int_leases_enriched"
          ]
        }
      },
      "model.harbor_lease.int_application_funnel": {
        unique_id: "model.harbor_lease.int_application_funnel",
        name: "int_application_funnel",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/intermediate/int_application_funnel.sql",
        schema: "main",
        database: "harbor_lease",
        raw_code: "-- Application outcomes joined to the lease they produced, if any.\nselect\n    a.application_id,\n    a.tenant_id,\n    u.property_id,\n    a.submitted_on,\n    a.decided_on,\n    a.application_status,\n    l.lease_id is not null as converted_to_lease,\n    date_diff('day', a.submitted_on, a.decided_on) as days_to_decision\nfrom {{ ref('stg_harbor__applications') }} a\njoin {{ ref('stg_harbor__units') }} u using (unit_id)\nleft join {{ ref('stg_harbor__leases') }} l using (application_id)",
        config: {
          materialized: "ephemeral",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__applications",
            "model.harbor_lease.stg_harbor__units",
            "model.harbor_lease.stg_harbor__leases"
          ]
        }
      },
      "model.harbor_lease.mart_delinquency_monthly": {
        unique_id: "model.harbor_lease.mart_delinquency_monthly",
        name: "mart_delinquency_monthly",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/mart_delinquency_monthly.sql",
        description: "Collections and delinquency by property and due month. Used by the finance team's monthly close.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    property_id,\n    date_trunc('month', due_on) as due_month,\n    count(*) as obligations,\n    sum(amount_due) as rent_due,\n    sum(amount_paid) as rent_collected,\n    round(sum(amount_paid) / nullif(sum(amount_due), 0), 4) as collection_rate,\n    avg(case when payment_status = 'missed' then 1.0 else 0 end) as missed_rate,\n    avg(case when payment_status = 'late' then 1.0 else 0 end) as late_rate,\n    case\n        when avg(case when payment_status = 'missed' then 1.0 else 0 end) >= 0.05 then 'critical'\n        when avg(case when payment_status <> 'on_time' then 1.0 else 0 end) >= 0.15 then 'watch'\n        else 'healthy'\n    end as delinquency_tier\nfrom {{ ref('fct_rent_payments') }}\ngroup by all",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_rent_payments"
          ]
        },
        columns: {
          collection_rate: {
            name: "collection_rate",
            description: "Rent collected divided by rent due.",
            data_type: "DOUBLE"
          },
          delinquency_tier: {
            name: "delinquency_tier",
            description: "healthy, watch or critical.",
            data_type: "VARCHAR"
          },
          property_id: {
            name: "property_id",
            description: "",
            data_type: "VARCHAR"
          },
          due_month: {
            name: "due_month",
            description: "",
            data_type: "TIMESTAMP"
          },
          obligations: {
            name: "obligations",
            description: "",
            data_type: "BIGINT"
          },
          rent_due: {
            name: "rent_due",
            description: "",
            data_type: "DECIMAL(38,2)"
          },
          rent_collected: {
            name: "rent_collected",
            description: "",
            data_type: "DECIMAL(38,2)"
          },
          missed_rate: {
            name: "missed_rate",
            description: "",
            data_type: "DOUBLE"
          },
          late_rate: {
            name: "late_rate",
            description: "",
            data_type: "DOUBLE"
          }
        }
      },
      "model.harbor_lease.mart_collections_by_credit_band": {
        unique_id: "model.harbor_lease.mart_collections_by_credit_band",
        name: "mart_collections_by_credit_band",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/mart_collections_by_credit_band.sql",
        description: "Collection rate and average days to pay by tenant credit band.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    credit_band,\n    count(*) as obligations,\n    round(sum(amount_paid) / nullif(sum(amount_due), 0), 4) as collection_rate,\n    avg(days_to_pay) as avg_days_to_pay\nfrom {{ ref('fct_rent_payments') }}\ngroup by all",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_rent_payments"
          ]
        },
        columns: {
          credit_band: {
            name: "credit_band",
            description: "",
            data_type: "VARCHAR"
          },
          obligations: {
            name: "obligations",
            description: "",
            data_type: "BIGINT"
          },
          collection_rate: {
            name: "collection_rate",
            description: "",
            data_type: "DOUBLE"
          },
          avg_days_to_pay: {
            name: "avg_days_to_pay",
            description: "",
            data_type: "DOUBLE"
          }
        }
      },
      "model.harbor_lease.fct_rent_payments": {
        unique_id: "model.harbor_lease.fct_rent_payments",
        name: "fct_rent_payments",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/fct_rent_payments.sql",
        description: "One row per rent obligation (lease x due month), classified on_time, late or missed. Incremental on due_on. Source of truth for collections reporting.\n",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "{{ config(materialized='incremental', unique_key='payment_id') }}\n\nselect *\nfrom {{ ref('int_payments_with_status') }}\n{% if is_incremental() %}\nwhere due_on > (select max(due_on) from {{ this }})\n{% endif %}",
        config: {
          materialized: "incremental",
          unique_key: "payment_id",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.int_payments_with_status"
          ]
        },
        columns: {
          payment_id: {
            name: "payment_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          payment_status: {
            name: "payment_status",
            description: "on_time (paid within 5 days of due date), late, or missed.",
            data_type: "VARCHAR"
          },
          days_to_pay: {
            name: "days_to_pay",
            description: "Days from due date to payment. Null when missed.",
            data_type: "BIGINT"
          },
          lease_id: {
            name: "lease_id",
            description: "",
            data_type: "VARCHAR"
          },
          property_id: {
            name: "property_id",
            description: "",
            data_type: "VARCHAR"
          },
          credit_band: {
            name: "credit_band",
            description: "",
            data_type: "VARCHAR"
          },
          due_on: {
            name: "due_on",
            description: "",
            data_type: "DATE"
          },
          paid_on: {
            name: "paid_on",
            description: "",
            data_type: "DATE"
          },
          amount_due: {
            name: "amount_due",
            description: "",
            data_type: "DECIMAL(10,2)"
          },
          amount_paid: {
            name: "amount_paid",
            description: "",
            data_type: "DECIMAL(10,2)"
          },
          payment_method: {
            name: "payment_method",
            description: "",
            data_type: "VARCHAR"
          }
        }
      },
      "model.harbor_lease.mart_occupancy": {
        unique_id: "model.harbor_lease.mart_occupancy",
        name: "mart_occupancy",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/mart_occupancy.sql",
        description: "Current occupancy by property.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    p.property_id,\n    p.property_name,\n    p.unit_count,\n    sum(case when u.is_occupied then 1 else 0 end) as occupied_units,\n    round(sum(case when u.is_occupied then 1 else 0 end) / nullif(p.unit_count, 0), 4) as occupancy_rate,\n    avg(u.market_rent) as avg_market_rent\nfrom {{ ref('dim_properties') }} p\nleft join {{ ref('dim_units') }} u using (property_id)\ngroup by 1, 2, 3",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_properties",
            "model.harbor_lease.dim_units"
          ]
        },
        columns: {
          property_id: {
            name: "property_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          occupancy_rate: {
            name: "occupancy_rate",
            description: "Occupied units divided by total units.",
            data_type: "DOUBLE"
          },
          property_name: {
            name: "property_name",
            description: "",
            data_type: "VARCHAR"
          },
          unit_count: {
            name: "unit_count",
            description: "",
            data_type: "BIGINT"
          },
          occupied_units: {
            name: "occupied_units",
            description: "",
            data_type: "HUGEINT"
          },
          avg_market_rent: {
            name: "avg_market_rent",
            description: "",
            data_type: "DOUBLE"
          }
        }
      },
      "model.harbor_lease.mart_leasing_funnel": {
        unique_id: "model.harbor_lease.mart_leasing_funnel",
        name: "mart_leasing_funnel",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/mart_leasing_funnel.sql",
        description: "Applications, approvals and signed leases by property and month.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    property_id,\n    date_trunc('month', submitted_on) as submitted_month,\n    count(*) as applications,\n    sum(case when application_status = 'approved' then 1 else 0 end) as approved,\n    sum(case when converted_to_lease then 1 else 0 end) as leases_signed,\n    round(avg(case when converted_to_lease then 1.0 else 0 end), 4) as conversion_rate,\n    avg(days_to_decision) as avg_days_to_decision\nfrom {{ ref('int_application_funnel') }}\ngroup by all",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.int_application_funnel"
          ]
        },
        columns: {
          property_id: {
            name: "property_id",
            description: "",
            data_type: "VARCHAR"
          },
          submitted_month: {
            name: "submitted_month",
            description: "",
            data_type: "TIMESTAMP"
          },
          applications: {
            name: "applications",
            description: "",
            data_type: "BIGINT"
          },
          approved: {
            name: "approved",
            description: "",
            data_type: "HUGEINT"
          },
          leases_signed: {
            name: "leases_signed",
            description: "",
            data_type: "HUGEINT"
          },
          conversion_rate: {
            name: "conversion_rate",
            description: "",
            data_type: "DOUBLE"
          },
          avg_days_to_decision: {
            name: "avg_days_to_decision",
            description: "",
            data_type: "DOUBLE"
          }
        }
      },
      "model.harbor_lease.mart_portfolio_kpis": {
        unique_id: "model.harbor_lease.mart_portfolio_kpis",
        name: "mart_portfolio_kpis",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/mart_portfolio_kpis.sql",
        description: "One row per property combining occupancy, trailing-12-month collections and leasing conversion. Feeds the executive dashboard.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "with occupancy as (select * from {{ ref('mart_occupancy') }}),\ncollections as (\n    select property_id, avg(collection_rate) as collection_rate_12m\n    from {{ ref('mart_delinquency_monthly') }}\n    where due_month >= date '2025-10-01'\n    group by all\n),\nfunnel as (\n    select property_id, sum(applications) as applications_12m, avg(conversion_rate) as conversion_rate_12m\n    from {{ ref('mart_leasing_funnel') }}\n    where submitted_month >= date '2025-10-01'\n    group by all\n)\nselect\n    o.*,\n    c.collection_rate_12m,\n    f.applications_12m,\n    f.conversion_rate_12m\nfrom occupancy o\nleft join collections c using (property_id)\nleft join funnel f using (property_id)",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_occupancy",
            "model.harbor_lease.mart_delinquency_monthly",
            "model.harbor_lease.mart_leasing_funnel"
          ]
        },
        columns: {
          property_id: {
            name: "property_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          property_name: {
            name: "property_name",
            description: "",
            data_type: "VARCHAR"
          },
          unit_count: {
            name: "unit_count",
            description: "",
            data_type: "BIGINT"
          },
          occupied_units: {
            name: "occupied_units",
            description: "",
            data_type: "HUGEINT"
          },
          occupancy_rate: {
            name: "occupancy_rate",
            description: "",
            data_type: "DOUBLE"
          },
          avg_market_rent: {
            name: "avg_market_rent",
            description: "",
            data_type: "DOUBLE"
          },
          collection_rate_12m: {
            name: "collection_rate_12m",
            description: "",
            data_type: "DOUBLE"
          },
          applications_12m: {
            name: "applications_12m",
            description: "",
            data_type: "HUGEINT"
          },
          conversion_rate_12m: {
            name: "conversion_rate_12m",
            description: "",
            data_type: "DOUBLE"
          }
        }
      },
      "model.harbor_lease.dim_units": {
        unique_id: "model.harbor_lease.dim_units",
        name: "dim_units",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/dim_units.sql",
        description: "One row per unit, flagged occupied when an active lease exists.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    u.unit_id,\n    u.property_id,\n    u.unit_number,\n    u.bedrooms,\n    u.market_rent,\n    exists (\n        select 1 from {{ ref('stg_harbor__leases') }} l\n        where l.unit_id = u.unit_id and l.lease_status = 'active'\n    ) as is_occupied\nfrom {{ ref('stg_harbor__units') }} u",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__leases",
            "model.harbor_lease.stg_harbor__units"
          ]
        },
        columns: {
          unit_id: {
            name: "unit_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          is_occupied: {
            name: "is_occupied",
            description: "True when the unit has an active lease today.",
            data_type: "BOOLEAN"
          },
          property_id: {
            name: "property_id",
            description: "",
            data_type: "VARCHAR"
          },
          unit_number: {
            name: "unit_number",
            description: "",
            data_type: "INTEGER"
          },
          bedrooms: {
            name: "bedrooms",
            description: "",
            data_type: "INTEGER"
          },
          market_rent: {
            name: "market_rent",
            description: "",
            data_type: "DECIMAL(10,2)"
          }
        }
      },
      "model.harbor_lease.dim_properties": {
        unique_id: "model.harbor_lease.dim_properties",
        name: "dim_properties",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/dim_properties.sql",
        description: "One row per property with its unit count. Grain is property_id.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "-- Layering shortcut: reads the raw source directly instead of the staging model.\nselect\n    p.property_id,\n    p.property_name,\n    p.city,\n    p.state,\n    p.property_type,\n    cast(p.acquired_at as date) as acquired_on,\n    count(u.unit_id) as unit_count\nfrom {{ source('harbor', 'raw_properties') }} p\nleft join {{ ref('stg_harbor__units') }} u using (property_id)\ngroup by all",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_properties",
            "model.harbor_lease.stg_harbor__units"
          ]
        },
        columns: {
          property_id: {
            name: "property_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          unit_count: {
            name: "unit_count",
            description: "Number of rentable units in the property.",
            data_type: "BIGINT"
          },
          property_name: {
            name: "property_name",
            description: "",
            data_type: "VARCHAR"
          },
          city: {
            name: "city",
            description: "",
            data_type: "VARCHAR"
          },
          state: {
            name: "state",
            description: "",
            data_type: "VARCHAR"
          },
          property_type: {
            name: "property_type",
            description: "",
            data_type: "VARCHAR"
          },
          acquired_on: {
            name: "acquired_on",
            description: "",
            data_type: "DATE"
          }
        }
      },
      "model.harbor_lease.dim_tenants": {
        unique_id: "model.harbor_lease.dim_tenants",
        name: "dim_tenants",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/dim_tenants.sql",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    t.tenant_id,\n    t.first_name,\n    t.last_name,\n    t.email,\n    t.created_on,\n    t.credit_band,\n    count(l.lease_id) as lease_count,\n    min(l.lease_start_on) as first_lease_start_on\nfrom {{ ref('stg_harbor__tenants') }} t\nleft join {{ ref('stg_harbor__leases') }} l using (tenant_id)\ngroup by all",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__tenants",
            "model.harbor_lease.stg_harbor__leases"
          ]
        },
        columns: {
          tenant_id: {
            name: "tenant_id",
            description: "",
            data_type: "VARCHAR"
          },
          first_name: {
            name: "first_name",
            description: "",
            data_type: "VARCHAR"
          },
          last_name: {
            name: "last_name",
            description: "",
            data_type: "VARCHAR"
          },
          email: {
            name: "email",
            description: "",
            data_type: "VARCHAR"
          },
          created_on: {
            name: "created_on",
            description: "",
            data_type: "DATE"
          },
          credit_band: {
            name: "credit_band",
            description: "",
            data_type: "VARCHAR"
          },
          lease_count: {
            name: "lease_count",
            description: "",
            data_type: "BIGINT"
          },
          first_lease_start_on: {
            name: "first_lease_start_on",
            description: "",
            data_type: "DATE"
          }
        }
      },
      "model.harbor_lease.fct_leases": {
        unique_id: "model.harbor_lease.fct_leases",
        name: "fct_leases",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/fct_leases.sql",
        description: "One row per signed lease with rent compared to market rent.",
        schema: "main_marts",
        database: "harbor_lease",
        raw_code: "select\n    lease_id,\n    tenant_id,\n    unit_id,\n    property_id,\n    credit_band,\n    monthly_rent,\n    market_rent,\n    round(monthly_rent / market_rent - 1, 4) as rent_vs_market_pct,\n    lease_start_on,\n    lease_end_on,\n    lease_term_months,\n    lease_status\nfrom {{ ref('int_leases_enriched') }}",
        config: {
          materialized: "table",
          schema: "marts",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.int_leases_enriched"
          ]
        },
        columns: {
          lease_id: {
            name: "lease_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          rent_vs_market_pct: {
            name: "rent_vs_market_pct",
            description: "Contracted rent divided by market rent, minus 1.",
            data_type: "DOUBLE"
          },
          lease_status: {
            name: "lease_status",
            description: "active, expired, renewed or terminated_early.",
            data_type: "VARCHAR"
          },
          tenant_id: {
            name: "tenant_id",
            description: "",
            data_type: "VARCHAR"
          },
          unit_id: {
            name: "unit_id",
            description: "",
            data_type: "VARCHAR"
          },
          property_id: {
            name: "property_id",
            description: "",
            data_type: "VARCHAR"
          },
          credit_band: {
            name: "credit_band",
            description: "",
            data_type: "VARCHAR"
          },
          monthly_rent: {
            name: "monthly_rent",
            description: "",
            data_type: "DECIMAL(10,2)"
          },
          market_rent: {
            name: "market_rent",
            description: "",
            data_type: "DECIMAL(10,2)"
          },
          lease_start_on: {
            name: "lease_start_on",
            description: "",
            data_type: "DATE"
          },
          lease_end_on: {
            name: "lease_end_on",
            description: "",
            data_type: "DATE"
          },
          lease_term_months: {
            name: "lease_term_months",
            description: "",
            data_type: "BIGINT"
          }
        }
      },
      "model.harbor_lease.stg_harbor__leases": {
        unique_id: "model.harbor_lease.stg_harbor__leases",
        name: "stg_harbor__leases",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__leases.sql",
        description: "Cleaned leases. One row per signed lease.",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    lease_id,\n    application_id,\n    tenant_id,\n    unit_id,\n    cast(start_date as date) as lease_start_on,\n    cast(end_date as date) as lease_end_on,\n    cast(monthly_rent as decimal(10, 2)) as monthly_rent,\n    status as lease_status\nfrom {{ source('harbor', 'raw_leases') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_leases"
          ]
        },
        columns: {
          lease_id: {
            name: "lease_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          unit_id: {
            name: "unit_id",
            description: "Unit under lease.",
            data_type: "VARCHAR"
          },
          monthly_rent: {
            name: "monthly_rent",
            description: "Contracted monthly rent in USD.",
            data_type: "DECIMAL(10,2)"
          },
          lease_status: {
            name: "lease_status",
            description: "active, expired, renewed or terminated_early.",
            data_type: "VARCHAR"
          },
          application_id: {
            name: "application_id",
            description: "",
            data_type: "VARCHAR"
          },
          tenant_id: {
            name: "tenant_id",
            description: "",
            data_type: "VARCHAR"
          },
          lease_start_on: {
            name: "lease_start_on",
            description: "",
            data_type: "DATE"
          },
          lease_end_on: {
            name: "lease_end_on",
            description: "",
            data_type: "DATE"
          }
        }
      },
      "model.harbor_lease.stg_harbor__applications": {
        unique_id: "model.harbor_lease.stg_harbor__applications",
        name: "stg_harbor__applications",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__applications.sql",
        description: "Cleaned rental applications.",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    application_id,\n    tenant_id,\n    unit_id,\n    cast(submitted_at as date) as submitted_on,\n    status as application_status,\n    cast(nullif(cast(decided_at as varchar), '') as date) as decided_on\nfrom {{ source('harbor', 'raw_applications') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_applications"
          ]
        },
        columns: {
          application_id: {
            name: "application_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          application_status: {
            name: "application_status",
            description: "approved, declined or withdrawn.",
            data_type: "VARCHAR"
          },
          tenant_id: {
            name: "tenant_id",
            description: "",
            data_type: "VARCHAR"
          },
          unit_id: {
            name: "unit_id",
            description: "",
            data_type: "VARCHAR"
          },
          submitted_on: {
            name: "submitted_on",
            description: "",
            data_type: "DATE"
          },
          decided_on: {
            name: "decided_on",
            description: "",
            data_type: "DATE"
          }
        }
      },
      "model.harbor_lease.stg_harbor__maintenance_requests": {
        unique_id: "model.harbor_lease.stg_harbor__maintenance_requests",
        name: "stg_harbor__maintenance_requests",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__maintenance_requests.sql",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    request_id,\n    unit_id,\n    cast(opened_at as date) as opened_on,\n    cast(nullif(cast(closed_at as varchar), '') as date) as closed_on,\n    category,\n    priority\nfrom {{ source('harbor', 'raw_maintenance_requests') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_maintenance_requests"
          ]
        },
        columns: {
          request_id: {
            name: "request_id",
            description: "",
            data_type: "VARCHAR"
          },
          unit_id: {
            name: "unit_id",
            description: "",
            data_type: "VARCHAR"
          },
          opened_on: {
            name: "opened_on",
            description: "",
            data_type: "DATE"
          },
          closed_on: {
            name: "closed_on",
            description: "",
            data_type: "DATE"
          },
          category: {
            name: "category",
            description: "",
            data_type: "VARCHAR"
          },
          priority: {
            name: "priority",
            description: "",
            data_type: "VARCHAR"
          }
        }
      },
      "model.harbor_lease.stg_harbor__units": {
        unique_id: "model.harbor_lease.stg_harbor__units",
        name: "stg_harbor__units",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__units.sql",
        description: "Cleaned units. One row per rentable unit.",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    unit_id,\n    property_id,\n    unit_number,\n    bedrooms,\n    cast(market_rent as decimal(10, 2)) as market_rent\nfrom {{ source('harbor', 'raw_units') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_units"
          ]
        },
        columns: {
          unit_id: {
            name: "unit_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          property_id: {
            name: "property_id",
            description: "Property the unit belongs to.",
            data_type: "VARCHAR"
          },
          bedrooms: {
            name: "bedrooms",
            description: "Number of bedrooms (0 = studio).",
            data_type: "INTEGER"
          },
          market_rent: {
            name: "market_rent",
            description: "Current asking rent in USD.",
            data_type: "DECIMAL(10,2)"
          },
          unit_number: {
            name: "unit_number",
            description: "",
            data_type: "INTEGER"
          }
        }
      },
      "model.harbor_lease.stg_harbor__tenants": {
        unique_id: "model.harbor_lease.stg_harbor__tenants",
        name: "stg_harbor__tenants",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__tenants.sql",
        description: "Cleaned tenant accounts. Email is lower-cased.",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    tenant_id,\n    first_name,\n    last_name,\n    lower(email) as email,\n    cast(created_at as date) as created_on,\n    credit_band\nfrom {{ source('harbor', 'raw_tenants') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_tenants"
          ]
        },
        columns: {
          tenant_id: {
            name: "tenant_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          email: {
            name: "email",
            description: "Tenant email, lower-cased.",
            data_type: "VARCHAR"
          },
          credit_band: {
            name: "credit_band",
            description: "Credit band at signup, A (strongest) to D.",
            data_type: "VARCHAR"
          },
          first_name: {
            name: "first_name",
            description: "",
            data_type: "VARCHAR"
          },
          last_name: {
            name: "last_name",
            description: "",
            data_type: "VARCHAR"
          },
          created_on: {
            name: "created_on",
            description: "",
            data_type: "DATE"
          }
        }
      },
      "model.harbor_lease.stg_harbor__payments": {
        unique_id: "model.harbor_lease.stg_harbor__payments",
        name: "stg_harbor__payments",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__payments.sql",
        description: "Cleaned rent payments. One row per lease per month due.",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    payment_id,\n    lease_id,\n    cast(due_date as date) as due_on,\n    cast(nullif(cast(paid_at as varchar), '') as date) as paid_on,\n    cast(amount as decimal(10, 2)) as amount_paid,\n    nullif(payment_method, '') as payment_method\nfrom {{ source('harbor', 'raw_payments') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_payments"
          ]
        },
        columns: {
          payment_id: {
            name: "payment_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          lease_id: {
            name: "lease_id",
            description: "Lease the payment belongs to.",
            data_type: "VARCHAR"
          },
          due_on: {
            name: "due_on",
            description: "First day of the month the rent was due.",
            data_type: "DATE"
          },
          paid_on: {
            name: "paid_on",
            description: "Date funds were received. Null if unpaid.",
            data_type: "DATE"
          },
          payment_method: {
            name: "payment_method",
            description: "ach, card or check. Should be present whenever paid_on is set.",
            data_type: "VARCHAR"
          },
          amount_paid: {
            name: "amount_paid",
            description: "",
            data_type: "DECIMAL(10,2)"
          }
        }
      },
      "model.harbor_lease.stg_harbor__properties": {
        unique_id: "model.harbor_lease.stg_harbor__properties",
        name: "stg_harbor__properties",
        resource_type: "model",
        package_name: "harbor_lease",
        original_file_path: "models/staging/stg_harbor__properties.sql",
        description: "Cleaned properties. One row per property.",
        schema: "main_staging",
        database: "harbor_lease",
        raw_code: "select\n    property_id,\n    property_name,\n    city,\n    state,\n    property_type,\n    cast(acquired_at as date) as acquired_on\nfrom {{ source('harbor', 'raw_properties') }}",
        config: {
          materialized: "view",
          schema: "staging",
          enabled: true
        },
        depends_on: {
          nodes: [
            "source.harbor_lease.harbor.raw_properties"
          ]
        },
        columns: {
          property_id: {
            name: "property_id",
            description: "Primary key.",
            data_type: "VARCHAR"
          },
          property_name: {
            name: "property_name",
            description: "Marketing name of the property.",
            data_type: "VARCHAR"
          },
          city: {
            name: "city",
            description: "City where the property is located.",
            data_type: "VARCHAR"
          },
          state: {
            name: "state",
            description: "Two-letter state code.",
            data_type: "VARCHAR"
          },
          property_type: {
            name: "property_type",
            description: "Building type (garden, mid-rise, high-rise, townhome).",
            data_type: "VARCHAR"
          },
          acquired_on: {
            name: "acquired_on",
            description: "Date the property joined the portfolio.",
            data_type: "DATE"
          }
        }
      },
      "test.harbor_lease.unique_fct_rent_payments_payment_id.15da0b981f": {
        unique_id: "test.harbor_lease.unique_fct_rent_payments_payment_id.15da0b981f",
        name: "unique_fct_rent_payments_payment_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/_finance.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "payment_id",
        attached_node: "model.harbor_lease.fct_rent_payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_rent_payments"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "payment_id"
          }
        }
      },
      "test.harbor_lease.not_null_fct_rent_payments_payment_id.10fe5e830f": {
        unique_id: "test.harbor_lease.not_null_fct_rent_payments_payment_id.10fe5e830f",
        name: "not_null_fct_rent_payments_payment_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/_finance.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "payment_id",
        attached_node: "model.harbor_lease.fct_rent_payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_rent_payments"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "payment_id"
          }
        }
      },
      "test.harbor_lease.accepted_values_fct_rent_payments_payment_status__on_time__late__missed.eeb6253cd4": {
        unique_id: "test.harbor_lease.accepted_values_fct_rent_payments_payment_status__on_time__late__missed.eeb6253cd4",
        name: "accepted_values_fct_rent_payments_payment_status__on_time__late__missed",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/_finance.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_accepted_values(**_dbt_generic_test_kwargs) }}{{ config(alias="accepted_values_fct_rent_payme_6ebdca38247754ffa2235968f5bf839b") }}',
        column_name: "payment_status",
        attached_node: "model.harbor_lease.fct_rent_payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_rent_payments"
          ]
        },
        test_metadata: {
          name: "accepted_values",
          kwargs: {
            column_name: "payment_status",
            values: [
              "on_time",
              "late",
              "missed"
            ]
          }
        }
      },
      "test.harbor_lease.accepted_values_mart_delinquency_monthly_delinquency_tier__healthy__watch__critical.d048946981": {
        unique_id: "test.harbor_lease.accepted_values_mart_delinquency_monthly_delinquency_tier__healthy__watch__critical.d048946981",
        name: "accepted_values_mart_delinquency_monthly_delinquency_tier__healthy__watch__critical",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/finance/_finance.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_accepted_values(**_dbt_generic_test_kwargs) }}{{ config(alias="accepted_values_mart_delinquen_c67fb971cb612331a64e31c38e080a63") }}',
        column_name: "delinquency_tier",
        attached_node: "model.harbor_lease.mart_delinquency_monthly",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_delinquency_monthly"
          ]
        },
        test_metadata: {
          name: "accepted_values",
          kwargs: {
            column_name: "delinquency_tier",
            values: [
              "healthy",
              "watch",
              "critical"
            ]
          }
        }
      },
      "test.harbor_lease.unique_mart_occupancy_property_id.9e578e624f": {
        unique_id: "test.harbor_lease.unique_mart_occupancy_property_id.9e578e624f",
        name: "unique_mart_occupancy_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/_operations.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.mart_occupancy",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_occupancy"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.not_null_mart_occupancy_property_id.2050bb2c32": {
        unique_id: "test.harbor_lease.not_null_mart_occupancy_property_id.2050bb2c32",
        name: "not_null_mart_occupancy_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/_operations.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.mart_occupancy",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_occupancy"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.unique_mart_portfolio_kpis_property_id.718501fd53": {
        unique_id: "test.harbor_lease.unique_mart_portfolio_kpis_property_id.718501fd53",
        name: "unique_mart_portfolio_kpis_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/_operations.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.mart_portfolio_kpis",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_portfolio_kpis"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.not_null_mart_portfolio_kpis_property_id.7d2dcd7efa": {
        unique_id: "test.harbor_lease.not_null_mart_portfolio_kpis_property_id.7d2dcd7efa",
        name: "not_null_mart_portfolio_kpis_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/operations/_operations.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.mart_portfolio_kpis",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_portfolio_kpis"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.unique_dim_properties_property_id.1c1ee8cb9a": {
        unique_id: "test.harbor_lease.unique_dim_properties_property_id.1c1ee8cb9a",
        name: "unique_dim_properties_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.dim_properties",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_properties"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.not_null_dim_properties_property_id.6539e5200f": {
        unique_id: "test.harbor_lease.not_null_dim_properties_property_id.6539e5200f",
        name: "not_null_dim_properties_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.dim_properties",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_properties"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.unique_dim_units_unit_id.c176adb411": {
        unique_id: "test.harbor_lease.unique_dim_units_unit_id.c176adb411",
        name: "unique_dim_units_unit_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "unit_id",
        attached_node: "model.harbor_lease.dim_units",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_units"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "unit_id"
          }
        }
      },
      "test.harbor_lease.not_null_dim_units_unit_id.e0fd777706": {
        unique_id: "test.harbor_lease.not_null_dim_units_unit_id.e0fd777706",
        name: "not_null_dim_units_unit_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "unit_id",
        attached_node: "model.harbor_lease.dim_units",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_units"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "unit_id"
          }
        }
      },
      "test.harbor_lease.unique_dim_tenants_tenant_id.c2e035daf0": {
        unique_id: "test.harbor_lease.unique_dim_tenants_tenant_id.c2e035daf0",
        name: "unique_dim_tenants_tenant_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "tenant_id",
        attached_node: "model.harbor_lease.dim_tenants",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_tenants"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "tenant_id"
          }
        }
      },
      "test.harbor_lease.not_null_dim_tenants_tenant_id.66864894db": {
        unique_id: "test.harbor_lease.not_null_dim_tenants_tenant_id.66864894db",
        name: "not_null_dim_tenants_tenant_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "tenant_id",
        attached_node: "model.harbor_lease.dim_tenants",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.dim_tenants"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "tenant_id"
          }
        }
      },
      "test.harbor_lease.unique_fct_leases_lease_id.424506d6b0": {
        unique_id: "test.harbor_lease.unique_fct_leases_lease_id.424506d6b0",
        name: "unique_fct_leases_lease_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "lease_id",
        attached_node: "model.harbor_lease.fct_leases",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_leases"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "lease_id"
          }
        }
      },
      "test.harbor_lease.not_null_fct_leases_lease_id.8b78eae21a": {
        unique_id: "test.harbor_lease.not_null_fct_leases_lease_id.8b78eae21a",
        name: "not_null_fct_leases_lease_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "lease_id",
        attached_node: "model.harbor_lease.fct_leases",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_leases"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "lease_id"
          }
        }
      },
      "test.harbor_lease.accepted_values_fct_leases_lease_status__active__expired__renewed.a656ad49fc": {
        unique_id: "test.harbor_lease.accepted_values_fct_leases_lease_status__active__expired__renewed.a656ad49fc",
        name: "accepted_values_fct_leases_lease_status__active__expired__renewed",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/marts/core/_core.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_accepted_values(**_dbt_generic_test_kwargs) }}{{ config(alias="accepted_values_fct_leases_24ffc7b1d0a84611286f1fdea5b1a257") }}',
        column_name: "lease_status",
        attached_node: "model.harbor_lease.fct_leases",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.fct_leases"
          ]
        },
        test_metadata: {
          name: "accepted_values",
          kwargs: {
            column_name: "lease_status",
            values: [
              "active",
              "expired",
              "renewed"
            ]
          }
        }
      },
      "test.harbor_lease.unique_stg_harbor__properties_property_id.d7d4599e29": {
        unique_id: "test.harbor_lease.unique_stg_harbor__properties_property_id.d7d4599e29",
        name: "unique_stg_harbor__properties_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.stg_harbor__properties",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__properties"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__properties_property_id.dbc46c9cc1": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__properties_property_id.dbc46c9cc1",
        name: "not_null_stg_harbor__properties_property_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "property_id",
        attached_node: "model.harbor_lease.stg_harbor__properties",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__properties"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "property_id"
          }
        }
      },
      "test.harbor_lease.accepted_values_stg_harbor__properties_property_type__garden__mid_rise__high_rise__townhome.0838906832": {
        unique_id: "test.harbor_lease.accepted_values_stg_harbor__properties_property_type__garden__mid_rise__high_rise__townhome.0838906832",
        name: "accepted_values_stg_harbor__properties_property_type__garden__mid_rise__high_rise__townhome",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_accepted_values(**_dbt_generic_test_kwargs) }}{{ config(alias="accepted_values_stg_harbor__pr_26f546b1c7fa0a9c71b37b29287ad89f") }}',
        column_name: "property_type",
        attached_node: "model.harbor_lease.stg_harbor__properties",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__properties"
          ]
        },
        test_metadata: {
          name: "accepted_values",
          kwargs: {
            column_name: "property_type",
            values: [
              "garden",
              "mid-rise",
              "high-rise",
              "townhome"
            ]
          }
        }
      },
      "test.harbor_lease.unique_stg_harbor__units_unit_id.5f66a7aee5": {
        unique_id: "test.harbor_lease.unique_stg_harbor__units_unit_id.5f66a7aee5",
        name: "unique_stg_harbor__units_unit_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "unit_id",
        attached_node: "model.harbor_lease.stg_harbor__units",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__units"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "unit_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__units_unit_id.5f7034fa8d": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__units_unit_id.5f7034fa8d",
        name: "not_null_stg_harbor__units_unit_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "unit_id",
        attached_node: "model.harbor_lease.stg_harbor__units",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__units"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "unit_id"
          }
        }
      },
      "test.harbor_lease.relationships_stg_harbor__units_property_id__property_id__ref_stg_harbor__properties_.ba7418e2c3": {
        unique_id: "test.harbor_lease.relationships_stg_harbor__units_property_id__property_id__ref_stg_harbor__properties_.ba7418e2c3",
        name: "relationships_stg_harbor__units_property_id__property_id__ref_stg_harbor__properties_",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_relationships(**_dbt_generic_test_kwargs) }}{{ config(alias="relationships_stg_harbor__unit_75dfc10f1fc8f57d893a746861dd0f2a") }}',
        column_name: "property_id",
        attached_node: "model.harbor_lease.stg_harbor__units",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__properties",
            "model.harbor_lease.stg_harbor__units"
          ]
        },
        test_metadata: {
          name: "relationships",
          kwargs: {
            column_name: "property_id",
            to: "ref('stg_harbor__properties')",
            field: "property_id"
          }
        }
      },
      "test.harbor_lease.unique_stg_harbor__tenants_tenant_id.8e4b669ba4": {
        unique_id: "test.harbor_lease.unique_stg_harbor__tenants_tenant_id.8e4b669ba4",
        name: "unique_stg_harbor__tenants_tenant_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "tenant_id",
        attached_node: "model.harbor_lease.stg_harbor__tenants",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__tenants"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "tenant_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__tenants_tenant_id.97ec7fb019": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__tenants_tenant_id.97ec7fb019",
        name: "not_null_stg_harbor__tenants_tenant_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "tenant_id",
        attached_node: "model.harbor_lease.stg_harbor__tenants",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__tenants"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "tenant_id"
          }
        }
      },
      "test.harbor_lease.accepted_values_stg_harbor__tenants_credit_band__A__B__C__D.11a100a8bd": {
        unique_id: "test.harbor_lease.accepted_values_stg_harbor__tenants_credit_band__A__B__C__D.11a100a8bd",
        name: "accepted_values_stg_harbor__tenants_credit_band__A__B__C__D",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_accepted_values(**_dbt_generic_test_kwargs) }}",
        column_name: "credit_band",
        attached_node: "model.harbor_lease.stg_harbor__tenants",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__tenants"
          ]
        },
        test_metadata: {
          name: "accepted_values",
          kwargs: {
            column_name: "credit_band",
            values: [
              "A",
              "B",
              "C",
              "D"
            ]
          }
        }
      },
      "test.harbor_lease.unique_stg_harbor__applications_application_id.2ffbb88f40": {
        unique_id: "test.harbor_lease.unique_stg_harbor__applications_application_id.2ffbb88f40",
        name: "unique_stg_harbor__applications_application_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "application_id",
        attached_node: "model.harbor_lease.stg_harbor__applications",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__applications"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "application_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__applications_application_id.eb5de97848": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__applications_application_id.eb5de97848",
        name: "not_null_stg_harbor__applications_application_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "application_id",
        attached_node: "model.harbor_lease.stg_harbor__applications",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__applications"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "application_id"
          }
        }
      },
      "test.harbor_lease.accepted_values_stg_harbor__applications_application_status__approved__declined__withdrawn.de2e63be48": {
        unique_id: "test.harbor_lease.accepted_values_stg_harbor__applications_application_status__approved__declined__withdrawn.de2e63be48",
        name: "accepted_values_stg_harbor__applications_application_status__approved__declined__withdrawn",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_accepted_values(**_dbt_generic_test_kwargs) }}{{ config(alias="accepted_values_stg_harbor__ap_5bcb850a24fd721db720b0d0b35c8d1c") }}',
        column_name: "application_status",
        attached_node: "model.harbor_lease.stg_harbor__applications",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__applications"
          ]
        },
        test_metadata: {
          name: "accepted_values",
          kwargs: {
            column_name: "application_status",
            values: [
              "approved",
              "declined",
              "withdrawn"
            ]
          }
        }
      },
      "test.harbor_lease.unique_stg_harbor__leases_lease_id.1770bb879f": {
        unique_id: "test.harbor_lease.unique_stg_harbor__leases_lease_id.1770bb879f",
        name: "unique_stg_harbor__leases_lease_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "lease_id",
        attached_node: "model.harbor_lease.stg_harbor__leases",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__leases"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "lease_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__leases_lease_id.cecabeae95": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__leases_lease_id.cecabeae95",
        name: "not_null_stg_harbor__leases_lease_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "lease_id",
        attached_node: "model.harbor_lease.stg_harbor__leases",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__leases"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "lease_id"
          }
        }
      },
      "test.harbor_lease.relationships_stg_harbor__leases_unit_id__unit_id__ref_stg_harbor__units_.551d158285": {
        unique_id: "test.harbor_lease.relationships_stg_harbor__leases_unit_id__unit_id__ref_stg_harbor__units_.551d158285",
        name: "relationships_stg_harbor__leases_unit_id__unit_id__ref_stg_harbor__units_",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_relationships(**_dbt_generic_test_kwargs) }}{{ config(alias="relationships_stg_harbor__leas_e8cb2b09f02d097985e1987ac8e90454") }}',
        column_name: "unit_id",
        attached_node: "model.harbor_lease.stg_harbor__leases",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__units",
            "model.harbor_lease.stg_harbor__leases"
          ]
        },
        test_metadata: {
          name: "relationships",
          kwargs: {
            column_name: "unit_id",
            to: "ref('stg_harbor__units')",
            field: "unit_id"
          }
        }
      },
      "test.harbor_lease.unique_stg_harbor__payments_payment_id.30f9ef8fc2": {
        unique_id: "test.harbor_lease.unique_stg_harbor__payments_payment_id.30f9ef8fc2",
        name: "unique_stg_harbor__payments_payment_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_unique(**_dbt_generic_test_kwargs) }}",
        column_name: "payment_id",
        attached_node: "model.harbor_lease.stg_harbor__payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__payments"
          ]
        },
        test_metadata: {
          name: "unique",
          kwargs: {
            column_name: "payment_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__payments_payment_id.f209ef459e": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__payments_payment_id.f209ef459e",
        name: "not_null_stg_harbor__payments_payment_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "payment_id",
        attached_node: "model.harbor_lease.stg_harbor__payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__payments"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "payment_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__payments_lease_id.51a0282049": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__payments_lease_id.51a0282049",
        name: "not_null_stg_harbor__payments_lease_id",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: "{{ test_not_null(**_dbt_generic_test_kwargs) }}",
        column_name: "lease_id",
        attached_node: "model.harbor_lease.stg_harbor__payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__payments"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "lease_id"
          }
        }
      },
      "test.harbor_lease.relationships_stg_harbor__payments_lease_id__lease_id__ref_stg_harbor__leases_.7a5a725239": {
        unique_id: "test.harbor_lease.relationships_stg_harbor__payments_lease_id__lease_id__ref_stg_harbor__leases_.7a5a725239",
        name: "relationships_stg_harbor__payments_lease_id__lease_id__ref_stg_harbor__leases_",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_relationships(**_dbt_generic_test_kwargs) }}{{ config(alias="relationships_stg_harbor__paym_b8cf61055dfeb0dccf610bd3acff8632") }}',
        column_name: "lease_id",
        attached_node: "model.harbor_lease.stg_harbor__payments",
        config: {
          materialized: "test",
          severity: "ERROR",
          schema: "dbt_test__audit",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__leases",
            "model.harbor_lease.stg_harbor__payments"
          ]
        },
        test_metadata: {
          name: "relationships",
          kwargs: {
            column_name: "lease_id",
            to: "ref('stg_harbor__leases')",
            field: "lease_id"
          }
        }
      },
      "test.harbor_lease.not_null_stg_harbor__payments_payment_method.738551f3ea": {
        unique_id: "test.harbor_lease.not_null_stg_harbor__payments_payment_method.738551f3ea",
        name: "not_null_stg_harbor__payments_payment_method",
        resource_type: "test",
        package_name: "harbor_lease",
        original_file_path: "models/staging/_stg_harbor.yml",
        schema: "main_dbt_test__audit",
        database: "harbor_lease",
        raw_code: '{{ test_not_null(**_dbt_generic_test_kwargs) }}{{ config(severity="warn",where="paid_on is not null") }}',
        column_name: "payment_method",
        attached_node: "model.harbor_lease.stg_harbor__payments",
        config: {
          materialized: "test",
          severity: "warn",
          schema: "dbt_test__audit",
          where: "paid_on is not null",
          enabled: true
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.stg_harbor__payments"
          ]
        },
        test_metadata: {
          name: "not_null",
          kwargs: {
            column_name: "payment_method"
          }
        }
      }
    },
    sources: {
      "source.harbor_lease.harbor.raw_properties": {
        unique_id: "source.harbor_lease.harbor.raw_properties",
        name: "raw_properties",
        source_name: "harbor",
        resource_type: "source",
        description: "One row per property in the portfolio.",
        schema: "main_raw",
        loaded_at_field: "_loaded_at",
        freshness: {},
        original_file_path: "models/staging/_sources.yml"
      },
      "source.harbor_lease.harbor.raw_units": {
        unique_id: "source.harbor_lease.harbor.raw_units",
        name: "raw_units",
        source_name: "harbor",
        resource_type: "source",
        description: "One row per rentable unit.",
        schema: "main_raw",
        loaded_at_field: "_loaded_at",
        freshness: {},
        original_file_path: "models/staging/_sources.yml"
      },
      "source.harbor_lease.harbor.raw_tenants": {
        unique_id: "source.harbor_lease.harbor.raw_tenants",
        name: "raw_tenants",
        source_name: "harbor",
        resource_type: "source",
        description: "One row per tenant account, including credit band at signup.",
        schema: "main_raw",
        loaded_at_field: "_loaded_at",
        freshness: {},
        original_file_path: "models/staging/_sources.yml"
      },
      "source.harbor_lease.harbor.raw_applications": {
        unique_id: "source.harbor_lease.harbor.raw_applications",
        name: "raw_applications",
        source_name: "harbor",
        resource_type: "source",
        description: "Rental applications submitted through the leasing portal.",
        schema: "main_raw",
        loaded_at_field: "cast(submitted_at as timestamp)",
        freshness: {
          warn_after: {
            count: 24,
            period: "hour"
          },
          error_after: {
            count: 48,
            period: "hour"
          }
        },
        original_file_path: "models/staging/_sources.yml"
      },
      "source.harbor_lease.harbor.raw_leases": {
        unique_id: "source.harbor_lease.harbor.raw_leases",
        name: "raw_leases",
        source_name: "harbor",
        resource_type: "source",
        description: "Signed leases. One row per lease.",
        schema: "main_raw",
        loaded_at_field: "_loaded_at",
        freshness: {},
        original_file_path: "models/staging/_sources.yml"
      },
      "source.harbor_lease.harbor.raw_payments": {
        unique_id: "source.harbor_lease.harbor.raw_payments",
        name: "raw_payments",
        source_name: "harbor",
        resource_type: "source",
        description: "Monthly rent obligations and their payment status.",
        schema: "main_raw",
        loaded_at_field: "cast(due_date as timestamp)",
        freshness: {
          warn_after: {
            count: 12,
            period: "hour"
          },
          error_after: {
            count: 24,
            period: "hour"
          }
        },
        original_file_path: "models/staging/_sources.yml"
      },
      "source.harbor_lease.harbor.raw_maintenance_requests": {
        unique_id: "source.harbor_lease.harbor.raw_maintenance_requests",
        name: "raw_maintenance_requests",
        source_name: "harbor",
        resource_type: "source",
        description: "Work orders opened by tenants or staff.",
        schema: "main_raw",
        loaded_at_field: "_loaded_at",
        freshness: {},
        original_file_path: "models/staging/_sources.yml"
      }
    },
    exposures: {
      "exposure.harbor_lease.executive_portfolio_dashboard": {
        unique_id: "exposure.harbor_lease.executive_portfolio_dashboard",
        name: "executive_portfolio_dashboard",
        label: "Executive Portfolio Dashboard",
        type: "dashboard",
        description: "Weekly leadership view of occupancy, collections and leasing.",
        maturity: "high",
        owner: {
          name: "Analytics Engineering"
        },
        depends_on: {
          nodes: [
            "model.harbor_lease.mart_portfolio_kpis",
            "model.harbor_lease.mart_delinquency_monthly"
          ]
        }
      }
    }
  },
  run_results: {
    metadata: {
      generated_at: "2026-10-22T16:56:56.341413Z"
    },
    results: [
      {
        unique_id: "model.harbor_lease.stg_harbor__applications",
        status: "success",
        execution_time: 0.159,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.stg_harbor__payments",
        status: "success",
        execution_time: 0.168,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.stg_harbor__maintenance_requests",
        status: "success",
        execution_time: 0.18,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.stg_harbor__leases",
        status: "success",
        execution_time: 0.184,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.accepted_values_stg_harbor__applications_application_status__approved__declined__withdrawn.de2e63be48",
        status: "pass",
        execution_time: 0.103,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.stg_harbor__properties",
        status: "success",
        execution_time: 0.136,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.stg_harbor__units",
        status: "success",
        execution_time: 0.149,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.stg_harbor__tenants",
        status: "success",
        execution_time: 0.168,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__applications_application_id.eb5de97848",
        status: "pass",
        execution_time: 0.073,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_stg_harbor__applications_application_id.2ffbb88f40",
        status: "pass",
        execution_time: 0.063,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__payments_payment_id.f209ef459e",
        status: "pass",
        execution_time: 0.061,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__payments_lease_id.51a0282049",
        status: "pass",
        execution_time: 0.067,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__payments_payment_method.738551f3ea",
        status: "warn",
        execution_time: 0.09,
        failures: 104,
        message: "Got 104 results, configured to warn if != 0"
      },
      {
        unique_id: "test.harbor_lease.relationships_stg_harbor__payments_lease_id__lease_id__ref_stg_harbor__leases_.7a5a725239",
        status: "pass",
        execution_time: 0.056,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_stg_harbor__payments_payment_id.30f9ef8fc2",
        status: "pass",
        execution_time: 0.089,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__leases_lease_id.cecabeae95",
        status: "pass",
        execution_time: 0.071,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_stg_harbor__properties_property_id.d7d4599e29",
        status: "pass",
        execution_time: 0.082,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.accepted_values_stg_harbor__properties_property_type__garden__mid_rise__high_rise__townhome.0838906832",
        status: "pass",
        execution_time: 0.104,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_stg_harbor__leases_lease_id.1770bb879f",
        status: "pass",
        execution_time: 0.128,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__properties_property_id.dbc46c9cc1",
        status: "pass",
        execution_time: 0.104,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__units_unit_id.5f7034fa8d",
        status: "pass",
        execution_time: 0.073,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_stg_harbor__units_unit_id.5f66a7aee5",
        status: "pass",
        execution_time: 0.081,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.relationships_stg_harbor__leases_unit_id__unit_id__ref_stg_harbor__units_.551d158285",
        status: "pass",
        execution_time: 0.1,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.relationships_stg_harbor__units_property_id__property_id__ref_stg_harbor__properties_.ba7418e2c3",
        status: "pass",
        execution_time: 0.082,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.accepted_values_stg_harbor__tenants_credit_band__A__B__C__D.11a100a8bd",
        status: "pass",
        execution_time: 0.124,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_stg_harbor__tenants_tenant_id.97ec7fb019",
        status: "pass",
        execution_time: 0.099,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_stg_harbor__tenants_tenant_id.8e4b669ba4",
        status: "pass",
        execution_time: 0.111,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.dim_properties",
        status: "success",
        execution_time: 0.178,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.dim_units",
        status: "success",
        execution_time: 0.142,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.not_null_dim_properties_property_id.6539e5200f",
        status: "pass",
        execution_time: 0.049,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.mart_leasing_funnel",
        status: "success",
        execution_time: 0.181,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.dim_tenants",
        status: "success",
        execution_time: 0.177,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.unique_dim_properties_property_id.1c1ee8cb9a",
        status: "pass",
        execution_time: 0.096,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_dim_units_unit_id.e0fd777706",
        status: "pass",
        execution_time: 0.069,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_dim_tenants_tenant_id.66864894db",
        status: "pass",
        execution_time: 0.054,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.fct_leases",
        status: "success",
        execution_time: 0.145,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.unique_dim_units_unit_id.c176adb411",
        status: "pass",
        execution_time: 0.061,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_dim_tenants_tenant_id.c2e035daf0",
        status: "pass",
        execution_time: 0.107,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.accepted_values_fct_leases_lease_status__active__expired__renewed.a656ad49fc",
        status: "fail",
        execution_time: 0.133,
        failures: 1,
        message: "Got 1 result, configured to fail if != 0"
      },
      {
        unique_id: "test.harbor_lease.not_null_fct_leases_lease_id.8b78eae21a",
        status: "pass",
        execution_time: 0.075,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.fct_rent_payments",
        status: "success",
        execution_time: 0.178,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.mart_occupancy",
        status: "success",
        execution_time: 0.209,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.unique_fct_leases_lease_id.424506d6b0",
        status: "pass",
        execution_time: 0.084,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_fct_rent_payments_payment_id.10fe5e830f",
        status: "pass",
        execution_time: 0.07,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.accepted_values_fct_rent_payments_payment_status__on_time__late__missed.eeb6253cd4",
        status: "pass",
        execution_time: 0.078,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_mart_occupancy_property_id.2050bb2c32",
        status: "pass",
        execution_time: 0.045,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_fct_rent_payments_payment_id.15da0b981f",
        status: "pass",
        execution_time: 0.055,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.unique_mart_occupancy_property_id.9e578e624f",
        status: "pass",
        execution_time: 0.052,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.mart_delinquency_monthly",
        status: "success",
        execution_time: 0.071,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "model.harbor_lease.mart_collections_by_credit_band",
        status: "success",
        execution_time: 0.078,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.accepted_values_mart_delinquency_monthly_delinquency_tier__healthy__watch__critical.d048946981",
        status: "pass",
        execution_time: 0.025,
        failures: 0,
        message: ""
      },
      {
        unique_id: "model.harbor_lease.mart_portfolio_kpis",
        status: "success",
        execution_time: 0.035,
        failures: null,
        message: "OK"
      },
      {
        unique_id: "test.harbor_lease.unique_mart_portfolio_kpis_property_id.718501fd53",
        status: "pass",
        execution_time: 0.035,
        failures: 0,
        message: ""
      },
      {
        unique_id: "test.harbor_lease.not_null_mart_portfolio_kpis_property_id.7d2dcd7efa",
        status: "pass",
        execution_time: 0.036,
        failures: 0,
        message: ""
      }
    ]
  }
};

// src/engine/project.ts
function layerOf(name, type, path = "") {
  if (type === "source") return "source";
  if (type === "exposure") return "exposure";
  const n = name.toLowerCase();
  const p = path.toLowerCase();
  if (n.startsWith("stg_") || p.includes("/staging/")) return "staging";
  if (n.startsWith("int_") || p.includes("/intermediate/")) return "intermediate";
  if (/^(fct|fact|dim|mart|rpt|agg|obt)_/.test(n) || p.includes("/marts/")) return "mart";
  return "other";
}
function loadProject(input, runResultsArg) {
  const manifest = input.manifest ?? input;
  const runResults = runResultsArg ?? input.run_results ?? null;
  if (!manifest || typeof manifest.nodes !== "object") {
    throw new Error("This doesn't look like a dbt manifest.json (no `nodes` key).");
  }
  const nodes = /* @__PURE__ */ new Map();
  const tests = [];
  for (const [id, n] of Object.entries(manifest.nodes)) {
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
        columns: Object.values(n.columns ?? {}).map((c) => ({
          name: String(c.name).toLowerCase(),
          description: (c.description ?? "").trim(),
          dataType: c.data_type ?? null,
          tests: []
        })),
        parents: [...n.depends_on?.nodes ?? []],
        children: [],
        tests: []
      });
    }
  }
  for (const [id, s] of Object.entries(manifest.sources ?? {})) {
    nodes.set(id, {
      id,
      name: `${s.source_name}.${s.name}`,
      type: "source",
      layer: "source",
      description: (s.description ?? "").trim(),
      path: s.original_file_path,
      columns: Object.values(s.columns ?? {}).map((c) => ({
        name: String(c.name).toLowerCase(),
        description: (c.description ?? "").trim(),
        dataType: c.data_type ?? null,
        tests: []
      })),
      parents: [],
      children: [],
      tests: [],
      freshness: s.freshness && (s.freshness.warn_after?.count != null || s.freshness.error_after?.count != null) ? s.freshness : null,
      sourceName: s.source_name
    });
  }
  for (const [id, e] of Object.entries(manifest.exposures ?? {})) {
    nodes.set(id, {
      id,
      name: e.name,
      type: "exposure",
      layer: "exposure",
      description: (e.description ?? "").trim(),
      columns: [],
      parents: [...e.depends_on?.nodes ?? []],
      children: [],
      tests: [],
      exposureType: e.type,
      owner: e.owner?.name
    });
  }
  for (const [id, n] of Object.entries(manifest.nodes)) {
    if (n.resource_type !== "test") continue;
    const attached = n.attached_node ?? (n.depends_on?.nodes ?? []).find((d) => nodes.has(d) && !d.startsWith("source.")) ?? n.depends_on?.nodes?.[0];
    const kind = n.test_metadata?.name ?? "singular";
    const column = (n.column_name ?? n.test_metadata?.kwargs?.column_name ?? void 0)?.toString().toLowerCase();
    const t = {
      id,
      name: n.name,
      kind,
      column,
      attachedTo: attached,
      severity: String(n.config?.severity ?? "error").toLowerCase() === "warn" ? "warn" : "error"
    };
    tests.push(t);
    const target = attached ? nodes.get(attached) : void 0;
    if (target) {
      target.tests.push(t);
      if (column) {
        let col = target.columns.find((c) => c.name === column);
        if (!col) {
          col = { name: column, description: "", dataType: null, tests: [] };
          target.columns.push(col);
        }
        col.tests.push(kind);
      }
    }
  }
  for (const node of nodes.values()) {
    node.parents = node.parents.filter((p) => nodes.has(p));
    for (const p of node.parents) nodes.get(p).children.push(node.id);
  }
  const resultList = runResults?.results ?? [];
  const byId = new Map(resultList.map((r) => [r.unique_id, r]));
  for (const node of nodes.values()) {
    const r = byId.get(node.id);
    if (r) {
      node.status = r.status;
      node.executionTime = r.execution_time;
    }
  }
  for (const t of tests) {
    const r = byId.get(t.id);
    if (r) {
      t.status = r.status;
      t.failures = r.failures ?? null;
      t.message = r.message ?? "";
    }
  }
  const byName = /* @__PURE__ */ new Map();
  for (const n of nodes.values()) {
    byName.set(n.name.toLowerCase(), n);
    if (n.type === "source") byName.set(n.name.split(".")[1].toLowerCase(), n);
  }
  return {
    name: input.metadata?.project_name ?? manifest.metadata?.project_name ?? guessProjectName(manifest),
    dbtVersion: input.metadata?.dbt_version ?? manifest.metadata?.dbt_version,
    generatedAt: runResults?.metadata?.generated_at ?? input.metadata?.generated_at ?? manifest.metadata?.generated_at,
    nodes,
    byName,
    tests,
    hasRunResults: resultList.length > 0
  };
}
function guessProjectName(manifest) {
  const first = Object.values(manifest.nodes ?? {}).find((n) => n.resource_type === "model");
  return first?.package_name ?? "dbt project";
}
var models = (p) => [...p.nodes.values()].filter((n) => n.type === "model" || n.type === "snapshot");
function resolveNode(p, text) {
  const q = text.toLowerCase().trim().replace(/[`'"?.,]/g, "");
  if (!q) return void 0;
  const exact = p.byName.get(q) ?? p.nodes.get(q);
  if (exact) return exact;
  const snake = q.replace(/\s+/g, "_");
  const direct = p.byName.get(snake);
  if (direct) return direct;
  const names = [...p.byName.keys()].sort((a, b) => b.length - a.length);
  const mentioned = names.find((n) => n.length > 3 && new RegExp(`(^|[^a-z0-9_])${escapeRe(n)}($|[^a-z0-9_])`).test(q));
  if (mentioned) return p.byName.get(mentioned);
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return void 0;
  let best;
  for (const node of p.nodes.values()) {
    const parts = node.name.toLowerCase().replace(/^(stg|int|fct|dim|mart)_+/, "").split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const w of words) if (parts.some((x) => x === w || x.startsWith(w) || w.startsWith(x) && x.length > 3)) score += 1;
    if (!score) continue;
    score = score / parts.length + (node.layer === "mart" ? 0.15 : 0) + (node.type === "exposure" ? -0.1 : 0);
    if (!best || score > best.score) best = { node, score };
  }
  return best && best.score >= 0.5 ? best.node : void 0;
}
var STOP = /* @__PURE__ */ new Set([
  "the",
  "what",
  "which",
  "model",
  "models",
  "table",
  "does",
  "show",
  "from",
  "into",
  "with",
  "and",
  "for",
  "are",
  "upstream",
  "downstream",
  "lineage",
  "explain",
  "about",
  "tell",
  "this",
  "that",
  "how",
  "health",
  "issues",
  "depends",
  "feeds",
  "uses",
  "break",
  "change",
  "changed",
  "impact",
  "calculated",
  "computed",
  "where",
  "come",
  "comes",
  "mart",
  "source",
  "sources",
  "test",
  "tests"
]);
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// src/engine/lineage.ts
function walk(p, startId, direction, maxDepth = 25) {
  const out = [];
  const dirs = direction === "both" ? ["upstream", "downstream"] : [direction];
  for (const d of dirs) {
    const seen = /* @__PURE__ */ new Set([startId]);
    let frontier = [startId];
    for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
      const next = [];
      for (const id of frontier) {
        const n = p.nodes.get(id);
        if (!n) continue;
        for (const nb of d === "upstream" ? n.parents : n.children) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          next.push(nb);
          out.push({ node: p.nodes.get(nb), distance: depth, direction: d });
        }
      }
      frontier = next;
    }
  }
  return out;
}
function impact(p, id) {
  const down = walk(p, id, "downstream");
  const models2 = down.filter((e) => e.node.type === "model" || e.node.type === "snapshot");
  const exposures = down.filter((e) => e.node.type === "exposure");
  const testCount = models2.reduce((s, e) => s + e.node.tests.length, 0);
  return { models: models2, exposures, testCount };
}

// src/engine/health.ts
var W = { error: 20, warn: 7, info: 2 };
function checkNode(p, n) {
  const f = [];
  const add = (code, severity, title, detail, fix) => f.push({ code, severity, nodeId: n.id, title, detail, fix });
  if (n.type === "source") {
    const feedsMart = impact(p, n.id).models.some((e) => e.node.layer === "mart");
    if (!n.freshness && feedsMart)
      add(
        "SRC_NO_FRESHNESS",
        "warn",
        "No freshness check",
        `${n.name} feeds marts but has no freshness rule, so a stalled load would go unnoticed.`,
        "Add `freshness: {warn_after, error_after}` and a `loaded_at_field`, then run `dbt source freshness` on a schedule."
      );
    if (!n.description) add("SRC_NO_DESC", "info", "Source undocumented", `${n.name} has no description.`, "Describe what system loads it and its grain.");
    return f;
  }
  if (n.type === "exposure") {
    const upstreamBroken = [...p.nodes.values()].filter((m) => m.type === "model" && isBroken(m) && reaches(p, m.id, n.id));
    if (upstreamBroken.length)
      add(
        "EXPOSURE_AT_RISK",
        "error",
        "Dashboard at risk",
        `${n.name} depends on ${upstreamBroken.map((m) => m.name).join(", ")}, which ${upstreamBroken.length > 1 ? "have" : "has"} failing tests or runs.`,
        "Fix the upstream failures before the next refresh, or warn the dashboard owner."
      );
    const upstreamWarn = [...p.nodes.values()].filter((m) => m.tests.some((t) => t.status === "warn") && reaches(p, m.id, n.id));
    if (upstreamWarn.length)
      add(
        "EXPOSURE_UPSTREAM_WARN",
        "warn",
        "Upstream test warnings",
        `Data feeding ${n.name} passed through ${upstreamWarn.map((m) => m.name).join(", ")}, which had test warnings in the last run.`,
        "Check whether the warning rows reach the metrics on this dashboard."
      );
    return f;
  }
  const isMart = n.layer === "mart";
  const physical = n.materialized !== "ephemeral";
  if (n.status === "error") add("RUN_ERROR", "error", "Last run failed", `${n.name} errored in the last run.`, "Check the run log and compiled SQL.");
  if (n.status === "skipped") add("RUN_SKIPPED", "error", "Skipped in last run", `${n.name} was skipped because an upstream node failed.`, "Fix the upstream failure first.");
  const failing = n.tests.filter((t) => t.status === "fail" || t.status === "error");
  const warning = n.tests.filter((t) => t.status === "warn");
  for (const t of failing)
    add(
      "TEST_FAILING",
      "error",
      `Failing test: ${t.kind}${t.column ? ` on ${t.column}` : ""}`,
      `${t.name} failed${t.failures ? ` with ${t.failures} bad row${t.failures === 1 ? "" : "s"}` : ""}.`,
      fixForTest(t.kind)
    );
  for (const t of warning)
    add(
      "TEST_WARNING",
      "warn",
      `Test warning: ${t.kind}${t.column ? ` on ${t.column}` : ""}`,
      `${t.name} returned ${t.failures ?? "some"} rows (severity: warn).`,
      fixForTest(t.kind)
    );
  if (!n.tests.length) add(
    "NO_TESTS",
    isMart ? "error" : "warn",
    "No tests",
    `${n.name} has no data tests at all.`,
    "Start with `unique` and `not_null` on the primary key."
  );
  else if (physical) {
    const pk = n.columns.find((c) => c.tests.includes("unique") && c.tests.includes("not_null"));
    const combo = n.tests.some((t) => /unique_combination|unique_key|grain/.test(t.kind));
    if (!pk && !combo)
      add(
        "NO_PK_TEST",
        isMart ? "warn" : "info",
        "Grain not tested",
        `No column on ${n.name} is tested as both unique and not_null, so duplicate rows would pass silently.`,
        "Test the primary key, or use `dbt_utils.unique_combination_of_columns` for a composite grain."
      );
  }
  if (!n.description) add(
    "NO_DESCRIPTION",
    isMart ? "warn" : "info",
    "No model description",
    `${n.name} has no description.`,
    "State the grain (one row per \u2026) and what the model is used for."
  );
  const cols = n.columns;
  if (cols.length) {
    const documented = cols.filter((c) => c.description).length;
    const pct = documented / cols.length;
    if (pct < 0.5 && (isMart || n.layer === "staging"))
      add(
        "COLUMNS_UNDOCUMENTED",
        isMart ? "warn" : "info",
        "Columns mostly undocumented",
        `${documented} of ${cols.length} columns have descriptions (${Math.round(pct * 100)}%).`,
        "Document at least the keys and every metric column."
      );
  }
  const srcParents = n.parents.filter((x) => p.nodes.get(x)?.type === "source");
  if (srcParents.length && n.layer !== "staging")
    add(
      "SOURCE_IN_MART",
      "warn",
      "Reads a raw source directly",
      `${n.name} selects from ${srcParents.map((x) => p.nodes.get(x).name).join(", ")} instead of a staging model, so cleaning logic is skipped or duplicated.`,
      "Point it at the matching `stg_` model."
    );
  if ((n.layer === "staging" || n.layer === "intermediate") && n.children.length === 0)
    add("UNUSED_MODEL", "info", "Nothing uses this model", `${n.name} has no downstream models or exposures.`, "Wire it into a mart, or delete it to cut build time.");
  if (n.sql && /select\s+\*\s+from/i.test(n.sql) && isMart)
    add(
      "SELECT_STAR",
      "info",
      "select * in a mart",
      `${n.name} uses select *, so upstream column changes reach consumers without review.`,
      "List columns explicitly in marts."
    );
  if (n.materialized === "incremental" && !n.uniqueKey)
    add("INCREMENTAL_NO_KEY", "warn", "Incremental without unique_key", "Late-arriving updates will create duplicates.", "Set `unique_key` in the config.");
  const fanIn = n.parents.length;
  if (fanIn >= 5) add("HIGH_FAN_IN", "info", "Many direct parents", `${n.name} joins ${fanIn} upstream nodes.`, "Consider an intermediate model to isolate join logic.");
  return f;
}
function fixForTest(kind) {
  switch (kind) {
    case "not_null":
      return "Find the rows with `select * from <model> where <column> is null` and fix them at the source or in staging.";
    case "unique":
      return "Look for a fan-out join upstream; check the grain of each joined table.";
    case "accepted_values":
      return "A new value appeared. Decide if it is valid; if so, add it to the accepted list and to downstream logic.";
    case "relationships":
      return "Orphaned keys: check load order or late-arriving dimension rows.";
    default:
      return "Run `dbt test --select <test>` and inspect the failing rows (`--store-failures` helps).";
  }
}
var isBroken = (n) => n.status === "error" || n.status === "skipped" || n.tests.some((t) => t.status === "fail" || t.status === "error");
function reaches(p, from, to) {
  const stack = [from];
  const seen = /* @__PURE__ */ new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...p.nodes.get(id)?.children ?? []);
  }
  return false;
}
var scoreOf = (flags) => Math.max(0, 100 - flags.reduce((s, f) => s + W[f.severity], 0));
function healthReport(p) {
  const byNode = /* @__PURE__ */ new Map();
  const flags = [];
  for (const n of p.nodes.values()) {
    const f = checkNode(p, n);
    byNode.set(n.id, f);
    flags.push(...f);
  }
  const ms = models(p);
  const scores = ms.map((m) => scoreOf(byNode.get(m.id) ?? []));
  const counts = { error: 0, warn: 0, info: 0 };
  flags.forEach((f) => counts[f.severity]++);
  const order = { error: 0, warn: 1, info: 2 };
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
      pkTested: ms.filter((m) => m.columns.some((c) => c.tests.includes("unique") && c.tests.includes("not_null"))).length
    },
    tests: {
      total: p.tests.length,
      pass: p.tests.filter((t) => t.status === "pass").length,
      warn: p.tests.filter((t) => t.status === "warn").length,
      fail: p.tests.filter((t) => t.status === "fail" || t.status === "error").length,
      notRun: p.tests.filter((t) => !t.status).length
    }
  };
}

// src/engine/tools.ts
var TOOL_DEFS = [
  {
    name: "list_models",
    description: "List models in the dbt project with layer, materialization, one-line description and health score. Optionally filter by layer.",
    input_schema: {
      type: "object",
      properties: { layer: { type: "string", enum: ["staging", "intermediate", "mart", "other"] } }
    }
  },
  {
    name: "search",
    description: "Find models, sources or exposures whose name, description or column names match a phrase. Use this when the user names something loosely (e.g. 'the delinquency report').",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "get_model",
    description: "Full detail for one node: description, file path, materialization, columns with types/descriptions/tests, direct parents and children, last run status, health flags and the model SQL.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Model, source (source.table) or exposure name" } }, required: ["name"] }
  },
  {
    name: "get_lineage",
    description: "Upstream (what it depends on) or downstream (what depends on it) nodes, with distance in hops.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        direction: { type: "string", enum: ["upstream", "downstream", "both"] },
        depth: { type: "integer", minimum: 1, maximum: 25 }
      },
      required: ["name", "direction"]
    }
  },
  {
    name: "get_impact",
    description: "Blast radius of changing or breaking a node: every downstream model, the dashboards/exposures that depend on it, and how many tests run on those models.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
  },
  {
    name: "get_health",
    description: "Health flags (failing tests, missing tests or docs, layering problems, freshness gaps). Without a name: project summary and the top issues. With a name: that node's flags.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, severity: { type: "string", enum: ["error", "warn", "info"] } }
    }
  }
];
var short = (s, n = 140) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
var brief = (n) => ({ name: n.name, type: n.type, layer: n.layer, materialized: n.materialized, description: short(n.description || "(no description)") });
function need(p, name) {
  const n = typeof name === "string" ? resolveNode(p, name) : void 0;
  if (!n) throw new Error(`No node matches "${String(name)}". Use search or list_models to find the exact name.`);
  return n;
}
function executeTool(p, name, input = {}) {
  switch (name) {
    case "list_models": {
      const layer = typeof input.layer === "string" ? input.layer : void 0;
      const ms = models(p).filter((m) => !layer || m.layer === layer).sort((a, b) => a.name.localeCompare(b.name));
      return { result: ms.map((m) => ({ ...brief(m), health: scoreOf(checkNode(p, m)) })), focus: [] };
    }
    case "search": {
      const q = String(input.query ?? "").toLowerCase();
      const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      const hits = [...p.nodes.values()].map((n) => {
        const hay = [n.name, n.description, ...n.columns.map((c) => c.name + " " + c.description)].join(" ").toLowerCase();
        const nameHits = words.filter((w) => n.name.toLowerCase().includes(w)).length;
        const textHits = words.filter((w) => hay.includes(w)).length;
        return { n, score: nameHits * 3 + textHits };
      }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
      return { result: hits.map((h) => brief(h.n)), focus: hits.slice(0, 3).map((h) => h.n.id) };
    }
    case "get_model": {
      const n = need(p, input.name);
      const flags = checkNode(p, n);
      return {
        result: {
          ...brief(n),
          description: n.description || "(no description)",
          path: n.path,
          schema: n.schema,
          last_run: n.status ? { status: n.status, seconds: n.executionTime } : "no run results loaded",
          columns: n.columns.map((c) => ({ name: c.name, type: c.dataType ?? void 0, description: c.description || void 0, tests: c.tests.length ? c.tests : void 0 })),
          parents: n.parents.map((x) => p.nodes.get(x).name),
          children: n.children.map((x) => p.nodes.get(x).name),
          tests: n.tests.map((t) => ({ test: t.kind, column: t.column, severity: t.severity, status: t.status ?? "not run", failures: t.failures ?? void 0 })),
          health: { score: scoreOf(flags), flags: flags.map((f) => ({ severity: f.severity, issue: f.title, detail: f.detail })) },
          sql: n.sql ? short(n.sql, 3e3) : void 0
        },
        focus: [n.id]
      };
    }
    case "get_lineage": {
      const n = need(p, input.name);
      const dir = ["upstream", "downstream", "both"].includes(String(input.direction)) ? input.direction : "upstream";
      const depth = Math.min(25, Math.max(1, Number(input.depth) || 25));
      const entries = walk(p, n.id, dir, depth);
      return {
        result: {
          node: n.name,
          direction: dir,
          count: entries.length,
          nodes: entries.map((e) => ({ name: e.node.name, type: e.node.type, layer: e.node.layer, hops: e.distance, direction: e.direction }))
        },
        focus: [n.id, ...entries.map((e) => e.node.id)]
      };
    }
    case "get_impact": {
      const n = need(p, input.name);
      const im = impact(p, n.id);
      return {
        result: {
          node: n.name,
          downstream_models: im.models.map((e) => ({ name: e.node.name, layer: e.node.layer, hops: e.distance })),
          exposures: im.exposures.map((e) => ({ name: e.node.name, type: e.node.exposureType, owner: e.node.owner, hops: e.distance })),
          tests_on_downstream_models: im.testCount
        },
        focus: [n.id, ...im.models.map((e) => e.node.id), ...im.exposures.map((e) => e.node.id)]
      };
    }
    case "get_health": {
      const sev = typeof input.severity === "string" ? input.severity : void 0;
      if (input.name) {
        const n = need(p, input.name);
        const flags2 = checkNode(p, n).filter((f) => !sev || f.severity === sev);
        return { result: { node: n.name, score: scoreOf(checkNode(p, n)), flags: flags2.map(({ code, severity, title, detail, fix }) => ({ code, severity, title, detail, fix })) }, focus: [n.id] };
      }
      const r = healthReport(p);
      const flags = r.flags.filter((f) => !sev || f.severity === sev);
      return {
        result: {
          project_score: r.score,
          counts: r.counts,
          coverage: r.coverage,
          tests: r.tests,
          top_issues: flags.slice(0, 15).map((f) => ({ node: p.nodes.get(f.nodeId).name, severity: f.severity, title: f.title, detail: f.detail, fix: f.fix }))
        },
        focus: [...new Set(flags.filter((f) => f.severity === "error").map((f) => f.nodeId))].slice(0, 8)
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
function projectBrief(p) {
  const by = (l) => models(p).filter((m) => m.layer === l).map((m) => m.name).sort().join(", ");
  const sources = [...p.nodes.values()].filter((n) => n.type === "source").map((n) => n.name).join(", ");
  const exps = [...p.nodes.values()].filter((n) => n.type === "exposure").map((n) => n.name).join(", ");
  return [
    `Project: ${p.name} (dbt ${p.dbtVersion ?? "?"}), artifacts generated ${p.generatedAt ?? "unknown"}.`,
    `Sources: ${sources || "none"}`,
    `Staging: ${by("staging") || "none"}`,
    `Intermediate: ${by("intermediate") || "none"}`,
    `Marts: ${by("mart") || "none"}`,
    by("other") ? `Other models: ${by("other")}` : "",
    `Exposures: ${exps || "none"}`
  ].filter(Boolean).join("\n");
}

// server/chat.ts
var MAX_ROUNDS = 6;
var MAX_TOOL_CHARS = 12e3;
function systemPrompt(p) {
  return `You are dbt Copilot, an assistant for analytics engineers exploring one dbt project.

Answer questions about lineage, model logic, columns, tests and data-quality health using ONLY facts returned by your tools. Call tools before answering; never guess a model, column or test that a tool has not shown you. If a tool says a name does not exist, search for it. If the project cannot answer the question, say so plainly.

Style:
- Lead with the direct answer in one or two sentences, then supporting bullets.
- Put model, column and source names in backticks.
- Keep answers under 180 words unless the user asks for more detail.
- When you explain SQL logic, describe what it does in business terms, then quote the key lines (at most 8) in a \`\`\`sql block.
- For health questions, rank issues by severity and give the concrete fix.
- Use bold, bullets, inline code and sql code blocks only. No headings, no tables.
- Stay on the topic of this dbt project; politely decline anything else.

${projectBrief(p)}`;
}
async function runChat(opts) {
  const { client, project: project2, model } = opts;
  const messages = opts.turns.map((t) => ({ role: t.role, content: t.content }));
  const trace = [];
  const focus = /* @__PURE__ */ new Set();
  const usage = { input: 0, output: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1200,
      system: systemPrompt(project2),
      tools: TOOL_DEFS,
      // on the final round, force a written answer instead of another tool call
      ...lastRound ? { tool_choice: { type: "none" } } : {},
      messages
    });
    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;
    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text: text || "I couldn't produce an answer for that. Try rephrasing.", focus: [...focus], trace, model, usage, mode: "ai" };
    }
    messages.push({ role: "assistant", content: res.content });
    const results = toolUses.map((tu) => {
      const t0 = Date.now();
      try {
        const { result, focus: f } = executeTool(project2, tu.name, tu.input ?? {});
        f.forEach((id) => focus.add(id));
        trace.push({ tool: tu.name, input: tu.input ?? {}, ok: true, ms: Date.now() - t0 });
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result).slice(0, MAX_TOOL_CHARS) };
      } catch (e) {
        trace.push({ tool: tu.name, input: tu.input ?? {}, ok: false, ms: Date.now() - t0 });
        return { type: "tool_result", tool_use_id: tu.id, content: e.message, is_error: true };
      }
    });
    messages.push({ role: "user", content: results });
  }
  return { text: "That question needed more lookups than I allow per answer. Try asking about one model at a time.", focus: [...focus], trace, model, usage, mode: "ai" };
}
function parseTurns(body) {
  const raw = body?.messages;
  if (!Array.isArray(raw) || !raw.length) throw new Error("Send {messages: [{role, content}]}.");
  const turns = raw.slice(-10).map((m) => {
    if (m?.role !== "user" && m?.role !== "assistant" || typeof m?.content !== "string" || !m.content.trim())
      throw new Error("Each message needs a role (user or assistant) and text content.");
    return { role: m.role, content: m.content.slice(0, 2e3) };
  });
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") throw new Error("The last message must be from the user.");
  return turns;
}
var RateLimiter = class {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  hits = /* @__PURE__ */ new Map();
  allow(key, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5e3) this.hits.clear();
    return true;
  }
};

// server/handler.ts
var project = loadProject(harbor_lease_default);
var limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_10MIN ?? 15), 10 * 60 * 1e3);
var allowed = (process.env.ALLOWED_ORIGINS ?? "https://fabrice-analytics.com,https://www.fabrice-analytics.com,https://tools.fabrice-analytics.com,http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
var originAllowed = (origin) => !origin || allowed.includes(origin);
function cors(origin) {
  const ok = !!origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin"
  };
}
var json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });
var handler_default = {
  async fetch(request) {
    const headers = cors(request.headers.get("origin"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET") return json({ ok: true, project: project.name, ai: Boolean(process.env.ANTHROPIC_API_KEY) }, 200, headers);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, headers);
    if (!originAllowed(request.headers.get("origin"))) return json({ error: "This origin isn't allowed.", code: "forbidden" }, 403, headers);
    if (!process.env.ANTHROPIC_API_KEY) return json({ error: "The AI backend isn't configured.", code: "not_configured" }, 503, headers);
    const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!limiter.allow(ip)) return json({ error: "You've asked a lot of questions in a short time. Try again in a few minutes.", code: "rate_limited" }, 429, headers);
    let turns;
    try {
      turns = parseTurns(await request.json());
    } catch (e) {
      return json({ error: e.message, code: "bad_request" }, 400, headers);
    }
    try {
      const client = new Anthropic();
      const result = await runChat({ client, project, turns, model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5" });
      return json(result, 200, headers);
    } catch (e) {
      console.error("chat failed", e?.status, e?.message);
      const status = e?.status === 429 ? 429 : 502;
      return json({ error: status === 429 ? "The AI service is busy. Try again shortly." : "The AI service had a problem answering.", code: "upstream_error" }, status, headers);
    }
  }
};
export {
  handler_default as default
};
