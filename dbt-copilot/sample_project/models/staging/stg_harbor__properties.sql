select
    property_id,
    property_name,
    city,
    state,
    property_type,
    cast(acquired_at as date) as acquired_on
from {{ source('harbor', 'raw_properties') }}
