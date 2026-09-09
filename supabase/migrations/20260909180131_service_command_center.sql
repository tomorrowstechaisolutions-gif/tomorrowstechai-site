-- Extend the existing Services foundation without replacing Catalog identity,
-- assignments, invoices, or historical prices.
begin;

alter table public.catalog_items
  add column discount_rules text,
  add column custom_pricing_allowed boolean not null default true,
  add column minimum_contract_months integer not null default 0 check (minimum_contract_months between 0 and 120),
  add column trial_days integer not null default 0 check (trial_days between 0 and 365),
  add column renewal_settings text,
  add column margin_threshold_pct numeric(5,2) not null default 40 check (margin_threshold_pct between -999.99 and 100);

alter table public.service_costs
  add column software_cost_cents integer check (software_cost_cents >= 0),
  add column ai_api_cost_cents integer check (ai_api_cost_cents >= 0),
  add column hosting_cost_cents integer check (hosting_cost_cents >= 0),
  add column contractor_cost_cents integer check (contractor_cost_cents >= 0),
  add column labor_hours numeric(8,2) check (labor_hours >= 0),
  add column labor_hourly_rate_cents integer check (labor_hourly_rate_cents >= 0),
  add column ad_platform_cost_cents integer check (ad_platform_cost_cents >= 0),
  add column other_cost_cents integer check (other_cost_cents >= 0),
  add column notes text,
  add column updated_at timestamptz not null default now();

alter table public.client_services
  add column assigned_manager text,
  add column billing_status text not null default 'not_connected'
    check (billing_status in ('not_connected','active','past_due','paused','cancelled'));

create table public.service_inclusions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_items(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  quantity numeric(10,2) check (quantity is null or quantity >= 0),
  frequency text not null default 'as_needed'
    check (frequency in ('one_time','daily','weekly','monthly','quarterly','annually','as_needed','custom')),
  custom_frequency text,
  is_included boolean not null default true,
  is_optional_addon boolean not null default false,
  client_facing_description text,
  internal_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_included and is_optional_addon))
);
create index service_inclusions_order on public.service_inclusions(service_id, sort_order, created_at);

create table public.service_deliverables (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_items(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  quantity numeric(10,2) check (quantity is null or quantity >= 0),
  frequency text not null default 'as_needed'
    check (frequency in ('one_time','daily','weekly','monthly','quarterly','annually','as_needed','custom')),
  custom_frequency text,
  client_facing_description text,
  internal_notes text,
  sort_order integer not null default 0,
  automation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_deliverables_order on public.service_deliverables(service_id, sort_order, created_at);

do $$ declare t text; begin
  foreach t in array array['service_inclusions','service_deliverables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_manage_services())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_manage_services()) with check (public.can_manage_services())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_manage_services())', t || '_delete', t);
  end loop;
end $$;

create trigger service_inclusions_touch before update on public.service_inclusions
for each row execute function public.touch_updated_at();
create trigger service_deliverables_touch before update on public.service_deliverables
for each row execute function public.touch_updated_at();
create trigger service_costs_touch before update on public.service_costs
for each row execute function public.touch_updated_at();

-- Append richer operational facts while preserving the existing view's column order.
create or replace view public.service_directory with (security_invoker=true) as
select
  c.id,c.name,c.category,c.description,c.billing,c.from_cents,c.active,c.position,c.notes,c.created_at,c.updated_at,
  c.sku,c.service_type,c.status,c.billing_type,c.billing_interval,c.interval_months,c.setup_fee_cents,c.taxable,
  c.catalog_enabled,c.proposal_enabled,c.intake_enabled,c.internal_sales_enabled,c.public_enabled,c.manual_invoice_enabled,
  c.featured,c.requires_quote,c.requires_approval,c.discount_eligible,
  k.internal_cost_cents,k.recurring_cost_cents,
  case
    when c.billing_type='recurring' and a.mrr_cents > 0 and costs.effective_cost_cents is not null then
      100.0 * (a.mrr_cents - costs.effective_cost_cents * a.monthly_cost_units) / a.mrr_cents
    when c.billing_type='recurring' and c.from_cents > 0 and costs.effective_cost_cents is not null then
      100.0 * (c.from_cents - costs.effective_cost_cents) / c.from_cents
    when c.billing_type<>'recurring' and c.from_cents > 0 and not c.requires_quote and costs.effective_cost_cents is not null then
      100.0 * (c.from_cents - costs.effective_cost_cents) / c.from_cents
  end margin,
  coalesce(a.active_clients,0) active_clients,coalesce(a.subscriptions,0) subscriptions,coalesce(a.mrr_cents,0) mrr_cents,
  coalesce(r.revenue_cents,0) revenue_cents,coalesce(r.sales_count,0) sales_count,
  c.discount_rules,c.custom_pricing_allowed,c.minimum_contract_months,c.trial_days,c.renewal_settings,c.margin_threshold_pct,c.ad_image_path,
  k.software_cost_cents,k.ai_api_cost_cents,k.hosting_cost_cents,k.contractor_cost_cents,k.labor_hours,k.labor_hourly_rate_cents,
  k.ad_platform_cost_cents,k.other_cost_cents,k.notes cost_notes,
  costs.component_cost_cents,
  costs.effective_cost_cents,
  case when c.billing_type='recurring' and costs.effective_cost_cents is not null
    then round(costs.effective_cost_cents * a.monthly_cost_units)::bigint
    else costs.effective_cost_cents end calculated_internal_cost_cents,
  case
    when c.billing_type='recurring' and a.mrr_cents > 0 and costs.effective_cost_cents is not null
      then round(a.mrr_cents - costs.effective_cost_cents * a.monthly_cost_units)::bigint
    when c.billing_type<>'recurring' and not c.requires_quote and costs.effective_cost_cents is not null
      then c.from_cents - costs.effective_cost_cents
  end gross_profit_cents,
  case
    when costs.effective_cost_cents is null then 'missing_cost'
    when c.status='active' and c.from_cents=0 and not c.requires_quote then 'needs_attention'
    when c.status='active' and coalesce(a.active_clients,0)=0 then 'no_clients'
    when c.from_cents > 0
      and (case
        when c.billing_type='recurring' and a.mrr_cents > 0 then 100.0 * (a.mrr_cents - costs.effective_cost_cents * a.monthly_cost_units) / a.mrr_cents
        else 100.0 * (c.from_cents - costs.effective_cost_cents) / c.from_cents end) < c.margin_threshold_pct then 'low_margin'
    else 'healthy'
  end health
from public.catalog_items c
left join public.service_costs k on k.service_id=c.id
left join lateral (
  select
    count(distinct customer_id) filter(where status='active') active_clients,
    count(*) filter(where status='active' and billing_type='recurring') subscriptions,
    coalesce(sum(sale_price_cents::numeric/interval_months) filter(where status='active' and billing_type='recurring'),0) mrr_cents,
    coalesce(sum(1.0/interval_months) filter(where status='active' and billing_type='recurring'),0) monthly_cost_units
  from public.client_services a where a.service_id=c.id
) a on true
left join lateral (
  select sum(amount_cents) revenue_cents,count(distinct invoice_id) sales_count
  from public.service_sales r where r.service_id=c.id
) r on true
cross join lateral (
  select
    case when k.software_cost_cents is not null or k.ai_api_cost_cents is not null or k.hosting_cost_cents is not null
      or k.contractor_cost_cents is not null or k.labor_hours is not null or k.labor_hourly_rate_cents is not null
      or k.ad_platform_cost_cents is not null or k.other_cost_cents is not null
      then coalesce(k.software_cost_cents,0)+coalesce(k.ai_api_cost_cents,0)+coalesce(k.hosting_cost_cents,0)
        +coalesce(k.contractor_cost_cents,0)+round(coalesce(k.labor_hours,0)*coalesce(k.labor_hourly_rate_cents,0))::integer
        +coalesce(k.ad_platform_cost_cents,0)+coalesce(k.other_cost_cents,0)
    end component_cost_cents,
    case when c.billing_type='recurring'
      then coalesce(k.recurring_cost_cents,
        case when k.software_cost_cents is not null or k.ai_api_cost_cents is not null or k.hosting_cost_cents is not null
          or k.contractor_cost_cents is not null or k.labor_hours is not null or k.labor_hourly_rate_cents is not null
          or k.ad_platform_cost_cents is not null or k.other_cost_cents is not null
          then coalesce(k.software_cost_cents,0)+coalesce(k.ai_api_cost_cents,0)+coalesce(k.hosting_cost_cents,0)
            +coalesce(k.contractor_cost_cents,0)+round(coalesce(k.labor_hours,0)*coalesce(k.labor_hourly_rate_cents,0))::integer
            +coalesce(k.ad_platform_cost_cents,0)+coalesce(k.other_cost_cents,0) end)
      else coalesce(k.internal_cost_cents,
        case when k.software_cost_cents is not null or k.ai_api_cost_cents is not null or k.hosting_cost_cents is not null
          or k.contractor_cost_cents is not null or k.labor_hours is not null or k.labor_hourly_rate_cents is not null
          or k.ad_platform_cost_cents is not null or k.other_cost_cents is not null
          then coalesce(k.software_cost_cents,0)+coalesce(k.ai_api_cost_cents,0)+coalesce(k.hosting_cost_cents,0)
            +coalesce(k.contractor_cost_cents,0)+round(coalesce(k.labor_hours,0)*coalesce(k.labor_hourly_rate_cents,0))::integer
            +coalesce(k.ad_platform_cost_cents,0)+coalesce(k.other_cost_cents,0) end)
    end effective_cost_cents
) costs;

create or replace function public.service_summary(p_from timestamptz,p_to timestamptz) returns jsonb
language sql stable security invoker set search_path=public as $$
  with period_sales as (
    select service_id,
      coalesce(sum(amount_cents),0) revenue_cents,
      coalesce(sum(amount_cents) filter(where billing_type='recurring'),0) recurring_revenue_cents,
      coalesce(sum(amount_cents) filter(where billing_type='one_time'),0) one_time_revenue_cents
    from public.service_sales where occurred_at>=p_from and occurred_at<p_to group by service_id
  ), leaders as (
    select d.id,d.name,d.mrr_cents,coalesce(p.revenue_cents,0) revenue_cents,
      greatest(d.mrr_cents,coalesce(p.revenue_cents,0)) performance_cents
    from public.service_directory d left join period_sales p on p.service_id=d.id
    where d.status='active'
    order by performance_cents desc,d.name limit 3
  )
  select jsonb_build_object(
    'active_services',(select count(*) from public.service_directory where status='active'),
    'mrr_cents',(select coalesce(sum(mrr_cents),0) from public.service_directory where status='active'),
    'subscriptions',(select coalesce(sum(subscriptions),0) from public.service_directory),
    'active_clients',(select count(distinct customer_id) from public.client_services where status='active'),
    'average_margin',(select avg(margin) from public.service_directory where status='active'),
    'revenue_cents',(select coalesce(sum(revenue_cents),0) from period_sales),
    'recurring_revenue_cents',(select coalesce(sum(recurring_revenue_cents),0) from period_sales),
    'one_time_cents',(select coalesce(sum(one_time_revenue_cents),0) from period_sales),
    'top_services',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mrr_cents',mrr_cents,'revenue_cents',revenue_cents) order by performance_cents desc,name),'[]'::jsonb) from leaders)
  );
$$;

commit;
