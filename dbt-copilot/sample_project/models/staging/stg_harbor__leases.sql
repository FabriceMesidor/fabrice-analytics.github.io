select
    lease_id,
    application_id,
    tenant_id,
    unit_id,
    cast(start_date as date) as lease_start_on,
    cast(end_date as date) as lease_end_on,
    cast(monthly_rent as decimal(10, 2)) as monthly_rent,
    status as lease_status
from {{ source('harbor', 'raw_leases') }}
