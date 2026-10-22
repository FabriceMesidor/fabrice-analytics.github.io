{% macro months_between(start_col, end_col) -%}
    date_diff('month', {{ start_col }}, {{ end_col }})
{%- endmacro %}
