select
    tenant_id,
    first_name,
    last_name,
    lower(email) as email,
    cast(created_at as date) as created_on,
    credit_band
from {{ source('harbor', 'raw_tenants') }}
