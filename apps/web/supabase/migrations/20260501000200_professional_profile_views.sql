create table if not exists public.professional_profile_views (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.users(id) on delete cascade,
  viewer_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists professional_profile_views_professional_idx
  on public.professional_profile_views (professional_id, created_at desc);

create index if not exists professional_profile_views_viewer_idx
  on public.professional_profile_views (viewer_id, created_at desc);

alter table public.professional_profile_views enable row level security;

drop policy if exists "authenticated can insert own profile view" on public.professional_profile_views;
create policy "authenticated can insert own profile view"
  on public.professional_profile_views
  for insert
  with check (auth.uid() = viewer_id);

drop policy if exists "authenticated can read profile views" on public.professional_profile_views;
create policy "authenticated can read profile views"
  on public.professional_profile_views
  for select
  using (auth.role() = 'authenticated');
