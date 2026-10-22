-- Layering shortcut: reads the raw source directly instead of the staging model.
select
    p.property_id,
    p.property_name,
    p.city,
    p.state,
    p.property_type,
    cast(p.acquired_at as date) as acquired_on,
    count(u.unit_id) as unit_count
from {{ source('harbor', 'raw_properties') }} p
left join {{ ref('stg_harbor__units') }} u using (property_id)
group by all
