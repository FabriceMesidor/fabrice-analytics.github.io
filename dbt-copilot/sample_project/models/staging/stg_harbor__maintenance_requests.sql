select
    request_id,
    unit_id,
    cast(opened_at as date) as opened_on,
    cast(nullif(cast(closed_at as varchar), '') as date) as closed_on,
    category,
    priority
from {{ source('harbor', 'raw_maintenance_requests') }}
