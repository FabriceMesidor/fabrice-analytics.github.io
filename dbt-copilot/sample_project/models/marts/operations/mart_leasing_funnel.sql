select
    property_id,
    date_trunc('month', submitted_on) as submitted_month,
    count(*) as applications,
    sum(case when application_status = 'approved' then 1 else 0 end) as approved,
    sum(case when converted_to_lease then 1 else 0 end) as leases_signed,
    round(avg(case when converted_to_lease then 1.0 else 0 end), 4) as conversion_rate,
    avg(days_to_decision) as avg_days_to_decision
from {{ ref('int_application_funnel') }}
group by all
