select
    t.tenant_id,
    t.first_name,
    t.last_name,
    t.email,
    t.created_on,
    t.credit_band,
    count(l.lease_id) as lease_count,
    min(l.lease_start_on) as first_lease_start_on
from {{ ref('stg_harbor__tenants') }} t
left join {{ ref('stg_harbor__leases') }} l using (tenant_id)
group by all
