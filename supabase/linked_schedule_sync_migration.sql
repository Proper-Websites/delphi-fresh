-- Delphi linked schedule sync migration
-- Run in Supabase SQL editor

-- 1) my_work_tasks: linked metadata
alter table if exists public.my_work_tasks
  add column if not exists linked boolean not null default false,
  add column if not exists linked_source text,
  add column if not exists linked_key text,
  add column if not exists linked_ref_id bigint,
  add column if not exists linked_ref_sub_id bigint;

create unique index if not exists my_work_tasks_linked_key_uq
  on public.my_work_tasks (linked_key)
  where linked_key is not null;

create index if not exists my_work_tasks_linked_source_ref_idx
  on public.my_work_tasks (linked_source, linked_ref_id);

-- 2) calendar_events: mirror metadata
alter table if exists public.calendar_events
  add column if not exists source_layer text not null default 'manual',
  add column if not exists linked boolean not null default false,
  add column if not exists linked_source text,
  add column if not exists linked_key text,
  add column if not exists linked_ref_id bigint,
  add column if not exists linked_ref_sub_id bigint;

create unique index if not exists calendar_events_linked_key_uq
  on public.calendar_events (linked_key)
  where linked_key is not null;

create index if not exists calendar_events_linked_source_ref_idx
  on public.calendar_events (linked_source, linked_ref_id);

-- 3) sales_outreach: source/follow-up extensions (if older table)
alter table if exists public.sales_outreach
  add column if not exists source text,
  add column if not exists instantly_list text,
  add column if not exists campaign text,
  add column if not exists prospect_group text,
  add column if not exists interest_level text,
  add column if not exists plan_mode text,
  add column if not exists budget_tier text,
  add column if not exists response_tags text[],
  add column if not exists asked_for text,
  add column if not exists asked_for_secondary text,
  add column if not exists auto_top_prospect boolean not null default false,
  add column if not exists next_follow_up_date date,
  add column if not exists next_follow_up_time text,
  add column if not exists follow_up_type text,
  add column if not exists company_name text,
  add column if not exists prospect_name text,
  add column if not exists role text,
  add column if not exists industry text,
  add column if not exists email text,
  add column if not exists secondary_email text,
  add column if not exists cell_phone text,
  add column if not exists business_phone text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists fee text,
  add column if not exists mrr text,
  add column if not exists special_notes text;

-- 3b) fix status constraint so Delphi values persist (includes verdict)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'sales_outreach_status_check'
      and conrelid = 'public.sales_outreach'::regclass
  ) then
    alter table public.sales_outreach drop constraint sales_outreach_status_check;
  end if;
  alter table public.sales_outreach
    add constraint sales_outreach_status_check
    check (status in ('interested', 'follow_up', 'meeting_scheduled', 'verdict', 'no_response'));
end$$;

-- 4) source taxonomy migration: instantly_ai -> cold_email
update public.sales_outreach
set source = 'cold_email'
where source = 'instantly_ai';

-- 5) optional sanity defaults
update public.sales_outreach
set source = 'cold_email'
where source is null;

-- 6) ensure anon access exists for sales_outreach
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_outreach'
      and policyname = 'Allow anon users full access to sales_outreach (temporary)'
  ) then
    create policy "Allow anon users full access to sales_outreach (temporary)"
      on public.sales_outreach
      for all
      to anon
      using (true)
      with check (true);
  end if;
end$$;

-- 6a) ask PostgREST to refresh schema cache
notify pgrst, 'reload schema';

-- 6b) sales_page_state: persist strategy/tasks/limbo/options/starred ids
create table if not exists public.sales_page_state (
  key text primary key,
  payload jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sales_page_state_updated_at on public.sales_page_state;
create trigger trg_sales_page_state_updated_at
before update on public.sales_page_state
for each row
execute procedure public.set_updated_at();

alter table public.sales_page_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_page_state'
      and policyname = 'Allow authenticated users full access to sales_page_state'
  ) then
    create policy "Allow authenticated users full access to sales_page_state"
      on public.sales_page_state
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_page_state'
      and policyname = 'Allow anon users full access to sales_page_state (temporary)'
  ) then
    create policy "Allow anon users full access to sales_page_state (temporary)"
      on public.sales_page_state
      for all
      to anon
      using (true)
      with check (true);
  end if;
end$$;

-- 7) development_projects: ensure all Delphi fields exist
alter table if exists public.development_projects
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website_url text,
  add column if not exists commenting_tool_url text,
  add column if not exists deposit_amount text;

-- 7b) development stage/status constraints aligned to app
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'development_projects_stage_check'
      and conrelid = 'public.development_projects'::regclass
  ) then
    alter table public.development_projects drop constraint development_projects_stage_check;
  end if;
  alter table public.development_projects
    add constraint development_projects_stage_check
    check (stage in ('rough_draft', 'final_draft', 'retrieve_info', 'finalize', 'launch'));
exception when duplicate_object then
  null;
end$$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'development_projects_status_check'
      and conrelid = 'public.development_projects'::regclass
  ) then
    alter table public.development_projects drop constraint development_projects_status_check;
  end if;
  alter table public.development_projects
    add constraint development_projects_status_check
    check (status in ('in_progress', 'review', 'planning'));
exception when duplicate_object then
  null;
end$$;

-- map any legacy stage values into current set before stage check applies
update public.development_projects
set stage = case
  when stage = 'draft' then 'rough_draft'
  when stage = 'import' then 'final_draft'
  else stage
end
where stage in ('draft', 'import');

-- 8) subscription_clients: ensure all Delphi fields exist
alter table if exists public.subscription_clients
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists client_since date;

-- 9) refresh schema cache (again after all alterations)
notify pgrst, 'reload schema';
