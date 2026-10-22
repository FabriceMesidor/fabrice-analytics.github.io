select
    payment_id,
    lease_id,
    cast(due_date as date) as due_on,
    cast(nullif(cast(paid_at as varchar), '') as date) as paid_on,
    cast(amount as decimal(10, 2)) as amount_paid,
    nullif(payment_method, '') as payment_method
from {{ source('harbor', 'raw_payments') }}
