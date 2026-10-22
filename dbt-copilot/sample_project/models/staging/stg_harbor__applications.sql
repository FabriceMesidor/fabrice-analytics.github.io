select
    application_id,
    tenant_id,
    unit_id,
    cast(submitted_at as date) as submitted_on,
    status as application_status,
    cast(nullif(cast(decided_at as varchar), '') as date) as decided_on
from {{ source('harbor', 'raw_applications') }}
