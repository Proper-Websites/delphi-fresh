create table if not exists public.development_projects (
  id bigint primary key,
  name text not null,
  client text not null,
  status text not null check (status in ('in_progress', 'review', 'planning')),
  stage text not null default 'rough_draft' check (stage in ('rough_draft', 'final_draft', 'retrieve_info', 'finalize', 'launch')),
  contact_name text null,
  contact_email text null,
  contact_phone text null,
  website_url text null,
  commenting_tool_url text null,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  budget text not null default '',
  spent text not null default '',
  deposit_amount text null,
  start_date date not null,
  deadline date not null,
  team jsonb not null default '[]'::jsonb,
  tasks_total integer not null default 0 check (tasks_total >= 0),
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists development_projects_display_order_idx
  on public.development_projects (display_order asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_development_projects_updated_at on public.development_projects;
create trigger trg_development_projects_updated_at
before update on public.development_projects
for each row
execute procedure public.set_updated_at();

alter table public.development_projects enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'development_projects'
      and policyname = 'Allow authenticated users full access to development_projects'
  ) then
    create policy "Allow authenticated users full access to development_projects"
      on public.development_projects
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end$$;

alter table public.development_projects
  alter column start_date drop not null,
  alter column deadline drop not null;

alter table public.development_projects
  add column if not exists stage text not null default 'rough_draft';

alter table public.development_projects
  add column if not exists website_url text,
  add column if not exists commenting_tool_url text;

create table if not exists public.my_work_tasks (
  id bigint primary key,
  title text not null,
  project text not null default '',
  priority text not null check (priority in ('crucial', 'high', 'medium', 'low')),
  required boolean not null default false,
  task_date date null,
  start_time time null,
  end_time time null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  completed boolean not null default false,
  department text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists my_work_tasks_display_order_idx on public.my_work_tasks (display_order asc);
drop trigger if exists trg_my_work_tasks_updated_at on public.my_work_tasks;
create trigger trg_my_work_tasks_updated_at
before update on public.my_work_tasks
for each row
execute procedure public.set_updated_at();
alter table public.my_work_tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'my_work_tasks'
      and policyname = 'Allow authenticated users full access to my_work_tasks'
  ) then
    create policy "Allow authenticated users full access to my_work_tasks"
      on public.my_work_tasks
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
    where schemaname = 'public' and tablename = 'my_work_tasks'
      and policyname = 'Allow anon users full access to my_work_tasks (temporary)'
  ) then
    create policy "Allow anon users full access to my_work_tasks (temporary)"
      on public.my_work_tasks
      for all
      to anon
      using (true)
      with check (true);
  end if;
end$$;

create table if not exists public.calendar_events (
  id bigint primary key,
  title text not null,
  event_date date null,
  start_time time null,
  end_time time null,
  notes text null,
  all_day boolean not null default false,
  color text not null default 'cyan' check (color in ('cyan', 'violet', 'emerald', 'rose', 'amber')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_display_order_idx on public.calendar_events (display_order asc);
drop trigger if exists trg_calendar_events_updated_at on public.calendar_events;
create trigger trg_calendar_events_updated_at
before update on public.calendar_events
for each row
execute procedure public.set_updated_at();
alter table public.calendar_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'calendar_events'
      and policyname = 'Allow authenticated users full access to calendar_events'
  ) then
    create policy "Allow authenticated users full access to calendar_events"
      on public.calendar_events
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
    where schemaname = 'public' and tablename = 'calendar_events'
      and policyname = 'Allow anon users full access to calendar_events (temporary)'
  ) then
    create policy "Allow anon users full access to calendar_events (temporary)"
      on public.calendar_events
      for all
      to anon
      using (true)
      with check (true);
  end if;
end$$;

create table if not exists public.sales_outreach (
  id bigint primary key,
  prospect text not null,
  contact text not null default '',
  status text not null check (status in ('interested', 'follow_up', 'meeting_scheduled', 'verdict', 'no_response')),
  last_contact date null,
  emails_sent integer not null default 0 check (emails_sent >= 0),
  replies integer not null default 0 check (replies >= 0),
  notion_url text null,
  source text null,
  instantly_list text null,
  campaign text null,
  prospect_group text null,
  interest_level text null,
  plan_mode text null,
  budget_tier text null,
  response_tags text[] null,
  asked_for text null,
  asked_for_secondary text null,
  auto_top_prospect boolean not null default false,
  next_follow_up_date date null,
  next_follow_up_time text null,
  follow_up_type text null,
  company_name text null,
  prospect_name text null,
  role text null,
  industry text null,
  email text null,
  secondary_email text null,
  cell_phone text null,
  business_phone text null,
  city text null,
  state text null,
  time_zone_mode text null,
  client_time_zone text null,
  fee text null,
  mrr text null,
  special_notes text null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_outreach_display_order_idx on public.sales_outreach (display_order asc);
drop trigger if exists trg_sales_outreach_updated_at on public.sales_outreach;
create trigger trg_sales_outreach_updated_at
before update on public.sales_outreach
for each row
execute procedure public.set_updated_at();
alter table public.sales_outreach enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_outreach'
      and policyname = 'Allow authenticated users full access to sales_outreach'
  ) then
    create policy "Allow authenticated users full access to sales_outreach"
      on public.sales_outreach
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end$$;

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

create table if not exists public.subscription_clients (
  id bigint primary key,
  client text not null,
  contact_name text null,
  contact_phone text null,
  contact_email text null,
  client_since date null,
  plan text not null default '',
  mrr text not null default '',
  revisions_used integer not null default 0 check (revisions_used >= 0),
  revisions_total integer not null default 0 check (revisions_total >= 0),
  status text not null check (status in ('active', 'limit_reached', 'pending_payment')),
  next_billing date null,
  last_revision text not null default '',
  last_revision_date date null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_clients_display_order_idx on public.subscription_clients (display_order asc);
drop trigger if exists trg_subscription_clients_updated_at on public.subscription_clients;
create trigger trg_subscription_clients_updated_at
before update on public.subscription_clients
for each row
execute procedure public.set_updated_at();
alter table public.subscription_clients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subscription_clients'
      and policyname = 'Allow authenticated users full access to subscription_clients'
  ) then
    create policy "Allow authenticated users full access to subscription_clients"
      on public.subscription_clients
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
    where schemaname = 'public' and tablename = 'subscription_clients'
      and policyname = 'Allow anon users full access to subscription_clients (temporary)'
  ) then
    create policy "Allow anon users full access to subscription_clients (temporary)"
      on public.subscription_clients
      for all
      to anon
      using (true)
      with check (true);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'development_projects'
      and policyname = 'Allow anon users full access to development_projects (temporary)'
  ) then
    create policy "Allow anon users full access to development_projects (temporary)"
      on public.development_projects
      for all
      to anon
      using (true)
      with check (true);
  end if;
end$$;
