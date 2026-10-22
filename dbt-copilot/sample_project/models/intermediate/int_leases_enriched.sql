-- One row per lease with unit, property and tenant attributes attached.
select
    l.lease_id,
    l.tenant_id,
    l.unit_id,
    u.property_id,
    t.credit_band,
    u.bedrooms,
    u.market_rent,
    l.monthly_rent,
    l.lease_start_on,
    l.lease_end_on,
    l.lease_status,
    {{ months_between('l.lease_start_on', 'l.lease_end_on') }} + 1 as lease_term_months
from {{ ref('stg_harbor__leases') }} l
join {{ ref('stg_harbor__units') }} u using (unit_id)
join {{ ref('stg_harbor__tenants') }} t using (tenant_id)
