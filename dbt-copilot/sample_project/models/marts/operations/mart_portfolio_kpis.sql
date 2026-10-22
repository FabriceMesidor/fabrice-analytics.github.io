with occupancy as (select * from {{ ref('mart_occupancy') }}),
collections as (
    select property_id, avg(collection_rate) as collection_rate_12m
    from {{ ref('mart_delinquency_monthly') }}
    where due_month >= date '2025-10-01'
    group by all
),
funnel as (
    select property_id, sum(applications) as applications_12m, avg(conversion_rate) as conversion_rate_12m
    from {{ ref('mart_leasing_funnel') }}
    where submitted_month >= date '2025-10-01'
    group by all
)
select
    o.*,
    c.collection_rate_12m,
    f.applications_12m,
    f.conversion_rate_12m
from occupancy o
left join collections c using (property_id)
left join funnel f using (property_id)
