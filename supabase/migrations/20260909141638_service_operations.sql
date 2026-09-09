-- Services extend Catalog's identity. No seeded offerings, clients or sales.
begin;
create or replace function public.can_manage_services() returns boolean
language sql stable security invoker set search_path = public as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid() and role in ('owner','admin'));
$$;
revoke all on function public.can_manage_services() from public, anon;
grant execute on function public.can_manage_services() to authenticated, service_role;

alter table public.catalog_items
  add column sku text,
  add column service_type text not null default 'Custom',
  add column status text not null default 'active' check(status in ('active','draft','paused','retired')),
  add column billing_type text not null default 'one_time' check(billing_type in ('one_time','recurring','usage_based','custom_quote')),
  add column billing_interval text not null default 'monthly' check(billing_interval in ('monthly','quarterly','yearly','custom')),
  add column interval_months integer not null default 1 check(interval_months between 1 and 120),
  add column setup_fee_cents integer not null default 0 check(setup_fee_cents >= 0),
  add column taxable boolean not null default false,
  add column catalog_enabled boolean not null default true,
  add column proposal_enabled boolean not null default true,
  add column intake_enabled boolean not null default false,
  add column internal_sales_enabled boolean not null default true,
  add column public_enabled boolean not null default false,
  add column manual_invoice_enabled boolean not null default true,
  add column featured boolean not null default false,
  add column requires_quote boolean not null default false,
  add column requires_approval boolean not null default false,
  add column discount_eligible boolean not null default true;
update public.catalog_items set status = case when active then 'active' else 'retired' end,
  billing_type = case when billing = 'monthly' then 'recurring' else 'one_time' end;
create unique index catalog_sku_unique on public.catalog_items(lower(sku)) where sku is not null;
create index catalog_service_filter on public.catalog_items(status, billing_type, category);

create table public.service_costs (
 service_id uuid primary key references public.catalog_items(id) on delete restrict,
 internal_cost_cents integer check(internal_cost_cents >= 0),
 recurring_cost_cents integer check(recurring_cost_cents >= 0)
);
create table public.service_events (
 id uuid primary key default gen_random_uuid(), service_id uuid not null references public.catalog_items(id) on delete restrict,
 customer_id uuid references public.customers(id) on delete set null,
 event_type text not null, body text not null, actor text,
 created_at timestamptz not null default now()
);
create index service_events_recent on public.service_events(service_id, created_at desc);
create table public.service_price_history (
 id uuid primary key default gen_random_uuid(), service_id uuid not null references public.catalog_items(id) on delete restrict,
 price_cents integer not null, setup_fee_cents integer not null, billing_type text not null, interval_months integer not null,
 actor text, created_at timestamptz not null default now()
);
create index service_price_history_recent on public.service_price_history(service_id,created_at desc);
create table public.service_package_relationships (
 id uuid primary key default gen_random_uuid(), service_id uuid not null references public.catalog_items(id) on delete restrict,
 package_id uuid not null references public.catalog_items(id) on delete restrict,
 relationship_type text not null check(relationship_type in ('included','addon')),
 quantity numeric(10,2) not null default 1 check(quantity > 0), notes text,
 unique(service_id,package_id), check(service_id <> package_id)
);
create index service_packages_parent on public.service_package_relationships(package_id);
create function public.validate_service_package() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 -- Serialize graph edits to prevent concurrent A→B and B→A insertions.
 perform pg_advisory_xact_lock(74291);
 if exists(with recursive parents(id) as (
  select new.package_id union select r.package_id from public.service_package_relationships r join parents p on r.service_id=p.id where r.id<>new.id
 ) select 1 from parents where id=new.service_id) then raise exception 'Package relationships cannot form a cycle'; end if;
 return new;
end $$;
create trigger service_package_cycle before insert or update on public.service_package_relationships for each row execute function public.validate_service_package();
create table public.service_automation_settings (
 service_id uuid primary key references public.catalog_items(id) on delete restrict,
 create_project boolean not null default false,
 task_template_id uuid references public.task_templates(id) on delete restrict,
 default_assignee text, due_date_offset_days integer not null default 14 check(due_date_offset_days between 0 and 3650),
 notify_admin boolean not null default false
);
create table public.client_services (
 id uuid primary key default gen_random_uuid(), service_id uuid not null references public.catalog_items(id) on delete restrict,
 customer_id uuid not null references public.customers(id) on delete restrict,
 status text not null default 'active' check(status in ('active','paused','ended')),
 sale_price_cents integer not null check(sale_price_cents >= 0),
 billing_type text not null check(billing_type in ('one_time','recurring','usage_based','custom_quote')),
 interval_months integer not null default 1 check(interval_months between 1 and 120),
 start_date date not null default current_date, end_date date, next_billing_date date,
 subscription_id text, proposal_id uuid references public.proposals(id) on delete set null,
 invoice_id uuid references public.invoices(id) on delete set null,
 job_id uuid references public.jobs(id) on delete set null,
 activation_key uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_date is null or end_date >= start_date),
 check(next_billing_date is null or next_billing_date >= start_date)
);
create index client_services_service on public.client_services(service_id,status);
create index client_services_customer on public.client_services(customer_id);
create unique index client_services_subscription on public.client_services(subscription_id,service_id) where subscription_id is not null;
alter table public.jobs add column client_service_id uuid unique references public.client_services(id) on delete restrict;
alter table public.proposal_items add column service_id uuid references public.catalog_items(id) on delete restrict,
 add column service_snapshot jsonb;
alter table public.invoice_items add column service_id uuid references public.catalog_items(id) on delete restrict,
 add column service_snapshot jsonb;
create index proposal_items_service on public.proposal_items(service_id) where service_id is not null;
create index invoice_items_service on public.invoice_items(service_id) where service_id is not null;

-- No cost columns on Catalog: its existing consumers cannot leak costs.
do $$ declare t text; begin
 foreach t in array array['service_costs','service_events','service_price_history','service_package_relationships','service_automation_settings','client_services'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);
  execute format('grant all on public.%I to service_role', t);
  execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_read', t,
   case when t = 'service_costs' then 'public.can_manage_services()' else 'public.is_admin()' end);
  execute format('create policy %I on public.%I for insert to authenticated with check(public.can_manage_services())',t || '_insert',t);
  if t not in ('service_events','service_price_history') then
   execute format('create policy %I on public.%I for update to authenticated using(public.can_manage_services()) with check(public.can_manage_services())',t || '_update',t);
  end if;
 end loop;
end $$;
grant delete on public.service_package_relationships to authenticated;
create policy service_package_remove on public.service_package_relationships for delete to authenticated using(public.can_manage_services());
-- Tighten pre-existing Catalog writes; viewer is a real existing read-only role.
drop policy catalog_items_admin_insert on public.catalog_items;
drop policy catalog_items_admin_update on public.catalog_items;
drop policy catalog_items_admin_delete on public.catalog_items;
create policy catalog_service_insert on public.catalog_items for insert to authenticated with check(public.can_manage_services());
create policy catalog_service_update on public.catalog_items for update to authenticated using(public.can_manage_services()) with check(public.can_manage_services());
revoke delete on public.catalog_items from authenticated;

-- Compatibility for existing Catalog and payment-link consumers.
create function public.sync_service_catalog() returns trigger language plpgsql security invoker set search_path = public as $$
begin
 if tg_op = 'INSERT' then
  if new.billing = 'monthly' and new.billing_type = 'one_time' then new.billing_type := 'recurring'; end if;
  if not new.active and new.status = 'active' then new.status := 'retired'; end if;
 else
  if new.active is distinct from old.active and new.status = old.status and new.catalog_enabled = old.catalog_enabled then
   new.status := case when new.active then 'active' else 'retired' end;
  end if;
  if new.billing is distinct from old.billing and new.billing_type = old.billing_type then
   new.billing_type := case when new.billing = 'monthly' then 'recurring' else 'one_time' end;
  end if;
 end if;
 new.billing := case when new.billing_type = 'recurring' then 'monthly' else 'one_time' end;
 new.active := new.status = 'active' and new.catalog_enabled;
 new.interval_months := case new.billing_interval when 'monthly' then 1 when 'quarterly' then 3 when 'yearly' then 12 else new.interval_months end;
 return new;
end $$;
create trigger catalog_service_sync before insert or update on public.catalog_items for each row execute function public.sync_service_catalog();
create function public.audit_service() returns trigger language plpgsql security invoker set search_path = public as $$
declare who text := coalesce(auth.jwt()->>'email','system');
begin
 insert into public.service_events(service_id,event_type,body,actor) values(new.id,
  case when tg_op='INSERT' then 'created' when new.status is distinct from old.status then 'status_changed' else 'edited' end,
  case when tg_op='INSERT' then 'Service created: ' || new.name else 'Service updated: ' || new.name || ' (' || new.status || ')' end,who);
 if tg_op='INSERT' or (new.from_cents,new.setup_fee_cents,new.billing_type,new.interval_months) is distinct from (old.from_cents,old.setup_fee_cents,old.billing_type,old.interval_months) then
  insert into public.service_price_history(service_id,price_cents,setup_fee_cents,billing_type,interval_months,actor)
  values(new.id,new.from_cents,new.setup_fee_cents,new.billing_type,new.interval_months,who);
 end if;
 return new;
end $$;
create trigger catalog_service_audit after insert or update on public.catalog_items for each row execute function public.audit_service();

-- Atomic creation/editing of operational fields and private costs. Explicit whitelist.
create function public.save_service(p_id uuid, p_data jsonb, p_cost jsonb, p_expected timestamptz default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare s public.catalog_items; result_id uuid;
begin
 if not public.can_manage_services() then raise exception 'Not authorized'; end if;
 if p_id is null then
  insert into public.catalog_items(name,status) values(p_data->>'name','draft') returning * into s;
 else
  select * into s from public.catalog_items where id=p_id for update;
  if not found then raise exception 'Service not found'; end if;
  if p_expected is null or s.updated_at <> p_expected then raise exception 'Service changed; reload before saving' using errcode='40001'; end if;
 end if;
 result_id := s.id;
 s := jsonb_populate_record(s,p_data);
 update public.catalog_items set name=s.name,sku=nullif(s.sku,''),description=s.description,category=s.category,
 service_type=s.service_type,status=s.status,billing_type=s.billing_type,billing_interval=s.billing_interval,
 interval_months=s.interval_months,from_cents=s.from_cents,setup_fee_cents=s.setup_fee_cents,taxable=s.taxable,
 position=s.position,catalog_enabled=s.catalog_enabled,proposal_enabled=s.proposal_enabled,intake_enabled=s.intake_enabled,
 internal_sales_enabled=s.internal_sales_enabled,public_enabled=s.public_enabled,manual_invoice_enabled=s.manual_invoice_enabled,
 featured=s.featured,requires_quote=s.requires_quote,requires_approval=s.requires_approval,discount_eligible=s.discount_eligible
 where id=result_id;
 insert into public.service_costs(service_id,internal_cost_cents,recurring_cost_cents)
 values(result_id,(p_cost->>'internal_cost_cents')::integer,(p_cost->>'recurring_cost_cents')::integer)
 on conflict(service_id) do update set internal_cost_cents=excluded.internal_cost_cents,recurring_cost_cents=excluded.recurring_cost_cents;
 return result_id;
end $$;
revoke all on function public.save_service(uuid,jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.save_service(uuid,jsonb,jsonb,timestamptz) to authenticated;

-- Real collected revenue, allocated proportionally after invoice discounts.
-- The legacy branch runs only when no payment ledger rows exist, avoiding double counting.
create view public.service_sales with (security_invoker=true) as
with receipts as (
 select p.invoice_id,p.amount_cents,p.paid_on::timestamptz occurred_at from public.invoice_payments p
 union all
 select i.id,coalesce(nullif(i.amount_paid_cents,0),nullif(i.amount_cents,0),i.launch_cents),i.paid_at
 from public.invoices i where i.status='paid' and i.paid_at is not null
 and not exists(select 1 from public.invoice_payments p where p.invoice_id=i.id)
), allocations as (
 select ii.service_id,i.id invoice_id,i.invoice_number,i.customer_id,i.client_business_name client_name,i.proposal_id,
 round(r.amount_cents::numeric * ii.total_price_cents / nullif(i.subtotal_cents,0))::bigint amount_cents,
 r.occurred_at,i.owner,'one_time'::text billing_type,i.status
 from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id join receipts r on r.invoice_id=i.id
 where ii.service_id is not null and ii.item_kind not in ('recurring','discount') and i.status not in ('void','refunded') and upper(i.currency)='USD'
 union all
 select i.catalog_item_id,i.id,i.invoice_number,i.customer_id,i.client_business_name,i.proposal_id,r.amount_cents,r.occurred_at,i.owner,
 case when i.billing='monthly' then 'recurring' else 'one_time' end,i.status
 from public.invoices i join receipts r on r.invoice_id=i.id
 where i.catalog_item_id is not null and i.status not in ('void','refunded') and upper(i.currency)='USD'
 and not exists(select 1 from public.invoice_items ii where ii.invoice_id=i.id)
)
select * from allocations where amount_cents is not null;
revoke all on public.service_sales from anon;
grant select on public.service_sales to authenticated,service_role;
create view public.service_client_revenue with(security_invoker=true) as
 select service_id,customer_id,sum(amount_cents) revenue_cents from public.service_sales group by service_id,customer_id;
revoke all on public.service_client_revenue from anon;
grant select on public.service_client_revenue to authenticated,service_role;

create view public.service_directory with(security_invoker=true) as
select c.*,k.internal_cost_cents,k.recurring_cost_cents,
 case when c.from_cents > 0 and not c.requires_quote and c.billing_type not in ('custom_quote','usage_based') then
  100.0*(c.from_cents-case when c.billing_type='recurring' then k.recurring_cost_cents else k.internal_cost_cents end)/c.from_cents end margin,
 coalesce(a.active_clients,0) active_clients,coalesce(a.subscriptions,0) subscriptions,coalesce(a.mrr_cents,0) mrr_cents,
 coalesce(r.revenue_cents,0) revenue_cents,coalesce(r.sales_count,0) sales_count
from public.catalog_items c left join public.service_costs k on k.service_id=c.id
left join lateral(select count(distinct customer_id) filter(where status='active') active_clients,
 count(*) filter(where status='active' and billing_type='recurring') subscriptions,
 sum(sale_price_cents::numeric/interval_months) filter(where status='active' and billing_type='recurring') mrr_cents
 from public.client_services a where a.service_id=c.id) a on true
left join lateral(select sum(amount_cents) revenue_cents,count(distinct invoice_id) sales_count from public.service_sales r where r.service_id=c.id) r on true;
revoke all on public.service_directory from anon;
grant select on public.service_directory to authenticated,service_role;

create function public.service_summary(p_from timestamptz,p_to timestamptz) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('active_services',count(*) filter(where status='active'),
 'mrr_cents',coalesce(sum(mrr_cents) filter(where status='active'),0),
 'subscriptions',coalesce(sum(subscriptions),0),'average_margin',avg(margin) filter(where status='active'),
 'one_time_cents',(select coalesce(sum(amount_cents),0) from public.service_sales where billing_type='one_time' and occurred_at>=p_from and occurred_at<p_to))
 from public.service_directory;
$$;
revoke all on function public.service_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.service_summary(timestamptz,timestamptz) to authenticated,service_role;

-- Activation, work creation and audit are one transaction. Row lock + UNIQUE
-- client_service_id make replay and concurrent activation safe.
create function public.activate_service_work() returns trigger language plpgsql security invoker set search_path=public as $$
declare cfg public.service_automation_settings; s public.catalog_items; template_key_value text; project_id uuid; who text := coalesce(auth.jwt()->>'email','system');
begin
 if tg_op='UPDATE' then new.updated_at:=now(); end if;
 if new.status='active' and (tg_op='INSERT' or old.status <> 'active') then
  select * into s from public.catalog_items where id=new.service_id;
  if s.status <> 'active' and new.proposal_id is null and new.invoice_id is null then raise exception 'Activate the service before assigning clients'; end if;
  select * into cfg from public.service_automation_settings where service_id=new.service_id;
  if cfg.create_project then
   if new.proposal_id is not null then select job_id into project_id from public.proposals where id=new.proposal_id for update; end if;
   if project_id is null and new.invoice_id is not null then
    select job_id into project_id from public.invoices where id=new.invoice_id for update;
    if project_id is null then select id into project_id from public.jobs where invoice_id=new.invoice_id; end if;
   end if;
   if project_id is null then
    insert into public.jobs(customer_id,title,client_service_id,owner,due_at,invoice_id,project_type)
    values(new.customer_id,s.name,new.id,cfg.default_assignee,now()+make_interval(days=>cfg.due_date_offset_days),new.invoice_id,
     case s.service_type when 'Website' then 'website' when 'AI Solution' then 'ai_system' when 'Software' then 'custom_software' when 'Logo / Branding' then 'branding' when 'Consulting' then 'consulting' else 'other' end)
    on conflict(client_service_id) do update set client_service_id=excluded.client_service_id returning id into project_id;
   end if;
   if new.proposal_id is not null then update public.proposals set job_id=project_id where id=new.proposal_id and job_id is null; end if;
   if new.invoice_id is not null then update public.invoices set job_id=project_id where id=new.invoice_id and job_id is null; end if;
   update public.client_services set job_id=project_id where id=new.id;
   select key into template_key_value from public.task_templates where id=cfg.task_template_id and active;
   if template_key_value is not null and not exists(select 1 from public.tasks where job_id=project_id and template_key=template_key_value) then
    insert into public.tasks(title,notes,kind,type,status,priority,due_at,sort_order,owner,created_by,job_id,customer_id,service_id,proposal_id,source,template_key,estimated_hours)
    select title,description,'task',type,'not_started',priority,now()+make_interval(days=>offset_days),sort_order,cfg.default_assignee,who,project_id,new.customer_id,new.service_id,new.proposal_id,'system',template_key_value,estimated_hours
    from public.task_template_items where template_id=cfg.task_template_id;
    insert into public.task_dependencies(task_id,depends_on_task_id,dependency_type)
    select t.id,dep.id,'blocks' from public.task_template_items ti
    join public.tasks t on t.job_id=project_id and t.template_key=template_key_value and t.sort_order=ti.sort_order
    join public.tasks dep on dep.job_id=project_id and dep.template_key=template_key_value and dep.sort_order=ti.depends_on_order
    where ti.template_id=cfg.task_template_id on conflict do nothing;
    insert into public.task_events(task_id,event_type,body,actor)
    select id,'generated','Created by service activation.',who from public.tasks where job_id=project_id and template_key=template_key_value;
   end if;
  end if;
  if cfg.notify_admin and not exists(select 1 from public.tasks where service_id=new.service_id and customer_id=new.customer_id and title='Review activation: '||s.name) then
   insert into public.tasks(title,kind,type,status,service_id,customer_id,owner,created_by,source)
   values('Review activation: '||s.name,'task','internal','not_started',new.service_id,new.customer_id,cfg.default_assignee,who,'system');
  end if;
 end if;
 insert into public.service_events(service_id,customer_id,event_type,body,actor)
 values(new.service_id,new.customer_id,'client_changed','Client service '||new.status,who);
 return new;
end $$;
-- AFTER skips ON CONFLICT DO NOTHING replays and the assignment FK exists.
create trigger client_service_work after insert or update of status on public.client_services for each row execute function public.activate_service_work();
create trigger client_service_touch before update on public.client_services for each row execute function public.touch_updated_at();

-- Completed sales attach existing clients to their snapshotted services.
-- Invoices converted from proposals reuse the proposal assignment.
create unique index client_services_proposal_service on public.client_services(proposal_id,service_id) where proposal_id is not null;
create unique index client_services_invoice_service on public.client_services(invoice_id,service_id) where invoice_id is not null;
create function public.attach_sold_services() returns trigger language plpgsql security invoker set search_path=public as $$
declare line record; invoice_source uuid; proposal_source uuid;
begin
 if new.customer_id is null then return new; end if;
 if tg_table_name='proposals' then
  if new.status not in ('signed','converted','paid') then return new; end if;
  proposal_source:=new.id;
 else
  if new.status<>'paid' then return new; end if;
  proposal_source:=new.proposal_id; invoice_source:=new.id;
 end if;
 for line in
  select p.service_id,coalesce(p.service_snapshot->>'billing_type','one_time') billing_type,
   coalesce((p.service_snapshot->>'interval_months')::integer,1) interval_months,
   sum(p.total_price_cents)::integer amount
  from public.proposal_items p where tg_table_name='proposals' and p.proposal_id=new.id and p.service_id is not null
   and p.is_billable and not p.is_optional and p.item_type<>'discount'
   and (coalesce(p.service_snapshot->>'billing_type','one_time')<>'recurring' or p.item_type='recurring')
  group by p.service_id,p.service_snapshot->>'billing_type',p.service_snapshot->>'interval_months'
  union all
  select i.service_id,coalesce(i.service_snapshot->>'billing_type','one_time'),coalesce((i.service_snapshot->>'interval_months')::integer,1),sum(i.total_price_cents)::integer
  from public.invoice_items i where tg_table_name='invoices' and i.invoice_id=new.id and i.service_id is not null and i.item_kind<>'discount'
   and (coalesce(i.service_snapshot->>'billing_type','one_time')<>'recurring' or i.item_kind='recurring')
  group by i.service_id,i.service_snapshot->>'billing_type',i.service_snapshot->>'interval_months'
  union all
  select i.catalog_item_id,case when i.billing='monthly' then 'recurring' else 'one_time' end,1,i.amount_cents
  from public.invoices i where tg_table_name='invoices' and i.id=new.id and i.catalog_item_id is not null
   and not exists(select 1 from public.invoice_items ii where ii.invoice_id=i.id)
 loop
  if proposal_source is not null and exists(select 1 from public.client_services where proposal_id=proposal_source and service_id=line.service_id) then continue; end if;
  insert into public.client_services(service_id,customer_id,sale_price_cents,billing_type,interval_months,proposal_id,invoice_id)
  values(line.service_id,new.customer_id,line.amount,line.billing_type,line.interval_months,proposal_source,invoice_source) on conflict do nothing;
 end loop;
 return new;
end $$;
create trigger proposal_service_sale after update of status,customer_id on public.proposals for each row execute function public.attach_sold_services();
create trigger invoice_service_sale after update of status,customer_id on public.invoices for each row execute function public.attach_sold_services();
create function public.sync_service_subscription() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.stripe_subscription_id is not null then
  update public.client_services set status=case new.status when 'churned' then 'ended' else new.status end,
   next_billing_date=new.renews_at::date,end_date=case when new.status='churned' then current_date else null end
  where customer_id=new.id and subscription_id=new.stripe_subscription_id;
 end if;
 return new;
end $$;
create trigger customer_service_subscription after update of status,renews_at,stripe_subscription_id on public.customers for each row execute function public.sync_service_subscription();
-- Trigger-only functions are not API endpoints.
revoke all on function public.sync_service_catalog(),public.audit_service(),public.activate_service_work(),public.validate_service_package(),public.attach_sold_services(),public.sync_service_subscription() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
