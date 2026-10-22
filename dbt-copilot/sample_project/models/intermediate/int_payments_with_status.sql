-- Classifies every rent obligation as on_time, late or missed.
select
    p.payment_id,
    p.lease_id,
    l.property_id,
    l.credit_band,
    p.due_on,
    p.paid_on,
    l.monthly_rent as amount_due,
    p.amount_paid,
    p.payment_method,
    case
        when p.paid_on is null then 'missed'
        when p.paid_on > p.due_on + interval 5 day then 'late'
        else 'on_time'
    end as payment_status,
    case when p.paid_on is not null then date_diff('day', p.due_on, p.paid_on) end as days_to_pay
from {{ ref('stg_harbor__payments') }} p
join {{ ref('int_leases_enriched') }} l using (lease_id)
