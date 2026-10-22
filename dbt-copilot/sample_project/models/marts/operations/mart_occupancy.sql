select
    p.property_id,
    p.property_name,
    p.unit_count,
    sum(case when u.is_occupied then 1 else 0 end) as occupied_units,
    round(sum(case when u.is_occupied then 1 else 0 end) / nullif(p.unit_count, 0), 4) as occupancy_rate,
    avg(u.market_rent) as avg_market_rent
from {{ ref('dim_properties') }} p
left join {{ ref('dim_units') }} u using (property_id)
group by 1, 2, 3
