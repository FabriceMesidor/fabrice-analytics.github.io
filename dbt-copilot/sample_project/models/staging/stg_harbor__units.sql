select
    unit_id,
    property_id,
    unit_number,
    bedrooms,
    cast(market_rent as decimal(10, 2)) as market_rent
from {{ source('harbor', 'raw_units') }}
