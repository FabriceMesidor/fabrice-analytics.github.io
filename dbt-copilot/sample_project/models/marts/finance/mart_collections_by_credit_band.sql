select
    credit_band,
    count(*) as obligations,
    round(sum(amount_paid) / nullif(sum(amount_due), 0), 4) as collection_rate,
    avg(days_to_pay) as avg_days_to_pay
from {{ ref('fct_rent_payments') }}
group by all
