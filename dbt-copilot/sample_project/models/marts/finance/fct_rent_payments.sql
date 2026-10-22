{{ config(materialized='incremental', unique_key='payment_id') }}

select *
from {{ ref('int_payments_with_status') }}
{% if is_incremental() %}
where due_on > (select max(due_on) from {{ this }})
{% endif %}
