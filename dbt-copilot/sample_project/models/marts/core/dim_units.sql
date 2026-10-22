select
    u.unit_id,
    u.property_id,
    u.unit_number,
    u.bedrooms,
    u.market_rent,
    exists (
        select 1 from {{ ref('stg_harbor__leases') }} l
        where l.unit_id = u.unit_id and l.lease_status = 'active'
    ) as is_occupied
from {{ ref('stg_harbor__units') }} u
