-- Application outcomes joined to the lease they produced, if any.
select
    a.application_id,
    a.tenant_id,
    u.property_id,
    a.submitted_on,
    a.decided_on,
    a.application_status,
    l.lease_id is not null as converted_to_lease,
    date_diff('day', a.submitted_on, a.decided_on) as days_to_decision
from {{ ref('stg_harbor__applications') }} a
join {{ ref('stg_harbor__units') }} u using (unit_id)
left join {{ ref('stg_harbor__leases') }} l using (application_id)
