select
    property_id,
    date_trunc('month', due_on) as due_month,
    count(*) as obligations,
    sum(amount_due) as rent_due,
    sum(amount_paid) as rent_collected,
    round(sum(amount_paid) / nullif(sum(amount_due), 0), 4) as collection_rate,
    avg(case when payment_status = 'missed' then 1.0 else 0 end) as missed_rate,
    avg(case when payment_status = 'late' then 1.0 else 0 end) as late_rate,
    case
        when avg(case when payment_status = 'missed' then 1.0 else 0 end) >= 0.05 then 'critical'
        when avg(case when payment_status <> 'on_time' then 1.0 else 0 end) >= 0.15 then 'watch'
        else 'healthy'
    end as delinquency_tier
from {{ ref('fct_rent_payments') }}
group by all
