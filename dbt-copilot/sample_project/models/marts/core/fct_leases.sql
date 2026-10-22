select
    lease_id,
    tenant_id,
    unit_id,
    property_id,
    credit_band,
    monthly_rent,
    market_rent,
    round(monthly_rent / market_rent - 1, 4) as rent_vs_market_pct,
    lease_start_on,
    lease_end_on,
    lease_term_months,
    lease_status
from {{ ref('int_leases_enriched') }}
