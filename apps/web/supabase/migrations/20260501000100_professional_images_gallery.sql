create table if not exists public.professional_images (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.users(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists professional_images_professional_id_idx
  on public.professional_images (professional_id, created_at);

alter table public.professional_images enable row level security;

drop policy if exists "professionals manage own images" on public.professional_images;
create policy "professionals manage own images"
  on public.professional_images
  for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

drop policy if exists "authenticated users read professional images" on public.professional_images;
create policy "authenticated users read professional images"
  on public.professional_images
  for select
  using (auth.role() = 'authenticated');
