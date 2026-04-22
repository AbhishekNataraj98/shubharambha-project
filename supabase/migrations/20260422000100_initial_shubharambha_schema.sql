-- Extensions
create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('customer', 'contractor', 'worker', 'supplier');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('active', 'on_hold', 'completed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'construction_stage') then
    create type public.construction_stage as enum (
      'foundation',
      'plinth',
      'walls',
      'slab',
      'plastering',
      'finishing'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_mode') then
    create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_category') then
    create type public.payment_category as enum ('labour', 'material', 'contractor_fee', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending_confirmation', 'confirmed', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_type') then
    create type public.message_type as enum ('text', 'photo', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_member_role') then
    create type public.project_member_role as enum ('customer', 'contractor', 'worker', 'viewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'enquiry_status') then
    create type public.enquiry_status as enum ('open', 'responded', 'closed');
  end if;
end
$$;

-- Common trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- USERS
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone_number text not null unique,
  name text not null,
  role public.user_role not null,
  city text not null,
  pincode text not null,
  profile_photo_url text,
  bio text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CONTRACTOR PROFILES
create table if not exists public.contractor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  business_name text,
  years_experience int not null default 0 check (years_experience >= 0),
  specialization text[] not null default '{}',
  service_locations text[] not null default '{}',
  license_number text,
  hourly_rate numeric(12,2) check (hourly_rate is null or hourly_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WORKER PROFILES
create table if not exists public.worker_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  skill_tags text[] not null default '{}',
  years_experience int not null default 0 check (years_experience >= 0),
  daily_rate numeric(12,2) check (daily_rate is null or daily_rate >= 0),
  availability_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PROJECTS
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users (id) on delete restrict,
  contractor_id uuid references public.users (id) on delete set null,
  name text not null,
  address text not null,
  city text not null,
  status public.project_status not null default 'active',
  current_stage public.construction_stage not null default 'foundation',
  start_date date not null,
  expected_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PROJECT MEMBERS
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.project_member_role not null default 'viewer',
  invited_by uuid references public.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- MILESTONES
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  stage public.construction_stage,
  due_date date,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DAILY UPDATES
create table if not exists public.daily_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  posted_by uuid not null references public.users (id) on delete restrict,
  description text not null,
  stage_tag public.construction_stage not null,
  photo_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- MESSAGES
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete restrict,
  content text not null,
  attachment_urls text[] not null default '{}',
  message_type public.message_type not null default 'text',
  created_at timestamptz not null default now()
);

-- PAYMENTS
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  recorded_by uuid not null references public.users (id) on delete restrict,
  paid_to uuid not null references public.users (id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode public.payment_mode not null,
  paid_to_category public.payment_category not null,
  description text not null,
  receipt_url text,
  status public.payment_status not null default 'pending_confirmation',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PAYMENT CONFIRMATIONS
create table if not exists public.payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  confirmer_id uuid not null references public.users (id) on delete restrict,
  is_confirmed boolean not null,
  note text,
  created_at timestamptz not null default now(),
  unique (payment_id, confirmer_id)
);

-- REVIEWS
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete restrict,
  reviewee_id uuid not null references public.users (id) on delete restrict,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_id, reviewee_id)
);

-- ENQUIRIES
create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  subject text not null,
  message text not null,
  status public.enquiry_status not null default 'open',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SHOPS
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  description text,
  city text not null,
  address text,
  phone_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PRODUCTS
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  unit text not null default 'unit',
  stock_quantity int not null default 0 check (stock_quantity >= 0),
  image_urls text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_users_role on public.users (role);
create index if not exists idx_projects_customer_id on public.projects (customer_id);
create index if not exists idx_projects_contractor_id on public.projects (contractor_id);
create index if not exists idx_project_members_project_id on public.project_members (project_id);
create index if not exists idx_project_members_user_id on public.project_members (user_id);
create index if not exists idx_milestones_project_id on public.milestones (project_id);
create index if not exists idx_daily_updates_project_id on public.daily_updates (project_id);
create index if not exists idx_messages_project_id on public.messages (project_id);
create index if not exists idx_payments_project_id on public.payments (project_id);
create index if not exists idx_payment_confirmations_payment_id on public.payment_confirmations (payment_id);
create index if not exists idx_reviews_project_id on public.reviews (project_id);
create index if not exists idx_enquiries_customer_id on public.enquiries (customer_id);
create index if not exists idx_enquiries_recipient_id on public.enquiries (recipient_id);
create index if not exists idx_shops_owner_id on public.shops (owner_id);
create index if not exists idx_products_shop_id on public.products (shop_id);

-- Update triggers
drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_contractor_profiles_set_updated_at on public.contractor_profiles;
create trigger trg_contractor_profiles_set_updated_at
before update on public.contractor_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_worker_profiles_set_updated_at on public.worker_profiles;
create trigger trg_worker_profiles_set_updated_at
before update on public.worker_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_set_updated_at on public.projects;
create trigger trg_projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_milestones_set_updated_at on public.milestones;
create trigger trg_milestones_set_updated_at
before update on public.milestones
for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_set_updated_at on public.payments;
create trigger trg_payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists trg_enquiries_set_updated_at on public.enquiries;
create trigger trg_enquiries_set_updated_at
before update on public.enquiries
for each row execute function public.set_updated_at();

drop trigger if exists trg_shops_set_updated_at on public.shops;
create trigger trg_shops_set_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_set_updated_at on public.products;
create trigger trg_products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- RLS helper function
create or replace function public.is_project_member(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
  )
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_uuid
      and pm.user_id = auth.uid()
  );
$$;

-- Enable RLS
alter table public.users enable row level security;
alter table public.contractor_profiles enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;
alter table public.daily_updates enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.payment_confirmations enable row level security;
alter table public.reviews enable row level security;
alter table public.enquiries enable row level security;
alter table public.shops enable row level security;
alter table public.products enable row level security;

-- USERS policies
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
on public.users for select
to authenticated
using (id = auth.uid());

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
on public.users for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- CONTRACTOR PROFILES policies
drop policy if exists "contractor_profiles_select_authenticated" on public.contractor_profiles;
create policy "contractor_profiles_select_authenticated"
on public.contractor_profiles for select
to authenticated
using (true);

drop policy if exists "contractor_profiles_insert_own" on public.contractor_profiles;
create policy "contractor_profiles_insert_own"
on public.contractor_profiles for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "contractor_profiles_update_own" on public.contractor_profiles;
create policy "contractor_profiles_update_own"
on public.contractor_profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- WORKER PROFILES policies
drop policy if exists "worker_profiles_select_authenticated" on public.worker_profiles;
create policy "worker_profiles_select_authenticated"
on public.worker_profiles for select
to authenticated
using (true);

drop policy if exists "worker_profiles_insert_own" on public.worker_profiles;
create policy "worker_profiles_insert_own"
on public.worker_profiles for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "worker_profiles_update_own" on public.worker_profiles;
create policy "worker_profiles_update_own"
on public.worker_profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- PROJECTS policies
drop policy if exists "projects_select_if_member" on public.projects;
create policy "projects_select_if_member"
on public.projects for select
to authenticated
using (
  customer_id = auth.uid()
  or contractor_id = auth.uid()
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "projects_insert_customer_or_contractor" on public.projects;
create policy "projects_insert_customer_or_contractor"
on public.projects for insert
to authenticated
with check (
  customer_id = auth.uid() or contractor_id = auth.uid()
);

drop policy if exists "projects_update_if_owner_side" on public.projects;
create policy "projects_update_if_owner_side"
on public.projects for update
to authenticated
using (customer_id = auth.uid() or contractor_id = auth.uid())
with check (customer_id = auth.uid() or contractor_id = auth.uid());

-- PROJECT MEMBERS policies
drop policy if exists "project_members_select_if_related" on public.project_members;
create policy "project_members_select_if_related"
on public.project_members for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_project_member(project_id)
);

drop policy if exists "project_members_insert_if_project_owner" on public.project_members;
create policy "project_members_insert_if_project_owner"
on public.project_members for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
  )
);

drop policy if exists "project_members_update_if_project_owner" on public.project_members;
create policy "project_members_update_if_project_owner"
on public.project_members for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
  )
);

drop policy if exists "project_members_delete_if_project_owner" on public.project_members;
create policy "project_members_delete_if_project_owner"
on public.project_members for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
  )
);

-- MILESTONES policies
drop policy if exists "milestones_select_if_project_member" on public.milestones;
create policy "milestones_select_if_project_member"
on public.milestones for select
to authenticated
using (public.is_project_member(project_id));

drop policy if exists "milestones_insert_if_project_member" on public.milestones;
create policy "milestones_insert_if_project_member"
on public.milestones for insert
to authenticated
with check (
  public.is_project_member(project_id)
  and created_by = auth.uid()
);

drop policy if exists "milestones_update_if_project_member" on public.milestones;
create policy "milestones_update_if_project_member"
on public.milestones for update
to authenticated
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

-- DAILY UPDATES policies
drop policy if exists "daily_updates_select_if_project_member" on public.daily_updates;
create policy "daily_updates_select_if_project_member"
on public.daily_updates for select
to authenticated
using (public.is_project_member(project_id));

drop policy if exists "daily_updates_insert_if_project_member" on public.daily_updates;
create policy "daily_updates_insert_if_project_member"
on public.daily_updates for insert
to authenticated
with check (
  public.is_project_member(project_id)
  and posted_by = auth.uid()
);

drop policy if exists "daily_updates_update_own_if_project_member" on public.daily_updates;
create policy "daily_updates_update_own_if_project_member"
on public.daily_updates for update
to authenticated
using (public.is_project_member(project_id) and posted_by = auth.uid())
with check (public.is_project_member(project_id) and posted_by = auth.uid());

-- MESSAGES policies
drop policy if exists "messages_select_if_project_member" on public.messages;
create policy "messages_select_if_project_member"
on public.messages for select
to authenticated
using (public.is_project_member(project_id));

drop policy if exists "messages_insert_if_project_member" on public.messages;
create policy "messages_insert_if_project_member"
on public.messages for insert
to authenticated
with check (
  public.is_project_member(project_id)
  and sender_id = auth.uid()
);

drop policy if exists "messages_update_own_if_project_member" on public.messages;
create policy "messages_update_own_if_project_member"
on public.messages for update
to authenticated
using (public.is_project_member(project_id) and sender_id = auth.uid())
with check (public.is_project_member(project_id) and sender_id = auth.uid());

-- PAYMENTS policies
drop policy if exists "payments_select_if_project_member" on public.payments;
create policy "payments_select_if_project_member"
on public.payments for select
to authenticated
using (public.is_project_member(project_id));

drop policy if exists "payments_insert_if_project_member" on public.payments;
create policy "payments_insert_if_project_member"
on public.payments for insert
to authenticated
with check (
  public.is_project_member(project_id)
  and recorded_by = auth.uid()
);

drop policy if exists "payments_update_if_project_member" on public.payments;
create policy "payments_update_if_project_member"
on public.payments for update
to authenticated
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

-- PAYMENT CONFIRMATIONS policies
drop policy if exists "payment_confirmations_select_if_payment_visible" on public.payment_confirmations;
create policy "payment_confirmations_select_if_payment_visible"
on public.payment_confirmations for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = payment_id
      and public.is_project_member(p.project_id)
  )
);

drop policy if exists "payment_confirmations_insert_if_involved" on public.payment_confirmations;
create policy "payment_confirmations_insert_if_involved"
on public.payment_confirmations for insert
to authenticated
with check (
  confirmer_id = auth.uid()
  and exists (
    select 1
    from public.payments p
    where p.id = payment_id
      and (p.paid_to = auth.uid() or p.recorded_by = auth.uid())
  )
);

-- REVIEWS policies
drop policy if exists "reviews_select_if_project_member" on public.reviews;
create policy "reviews_select_if_project_member"
on public.reviews for select
to authenticated
using (public.is_project_member(project_id));

drop policy if exists "reviews_insert_if_reviewer_self" on public.reviews;
create policy "reviews_insert_if_reviewer_self"
on public.reviews for insert
to authenticated
with check (
  reviewer_id = auth.uid()
  and public.is_project_member(project_id)
);

drop policy if exists "reviews_update_if_reviewer" on public.reviews;
create policy "reviews_update_if_reviewer"
on public.reviews for update
to authenticated
using (reviewer_id = auth.uid())
with check (reviewer_id = auth.uid());

-- ENQUIRIES policies
drop policy if exists "enquiries_select_participants" on public.enquiries;
create policy "enquiries_select_participants"
on public.enquiries for select
to authenticated
using (customer_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "enquiries_insert_customer_only" on public.enquiries;
create policy "enquiries_insert_customer_only"
on public.enquiries for insert
to authenticated
with check (customer_id = auth.uid());

drop policy if exists "enquiries_update_participants" on public.enquiries;
create policy "enquiries_update_participants"
on public.enquiries for update
to authenticated
using (customer_id = auth.uid() or recipient_id = auth.uid())
with check (customer_id = auth.uid() or recipient_id = auth.uid());

-- SHOPS policies
drop policy if exists "shops_select_authenticated" on public.shops;
create policy "shops_select_authenticated"
on public.shops for select
to authenticated
using (true);

drop policy if exists "shops_insert_owner" on public.shops;
create policy "shops_insert_owner"
on public.shops for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner"
on public.shops for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- PRODUCTS policies
drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated"
on public.products for select
to authenticated
using (true);

drop policy if exists "products_insert_shop_owner" on public.products;
create policy "products_insert_shop_owner"
on public.products for insert
to authenticated
with check (
  exists (
    select 1
    from public.shops s
    where s.id = shop_id
      and s.owner_id = auth.uid()
  )
);

drop policy if exists "products_update_shop_owner" on public.products;
create policy "products_update_shop_owner"
on public.products for update
to authenticated
using (
  exists (
    select 1
    from public.shops s
    where s.id = shop_id
      and s.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shops s
    where s.id = shop_id
      and s.owner_id = auth.uid()
  )
);
