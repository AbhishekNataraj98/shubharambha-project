create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  image_url text not null,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists project_images_project_id_created_at_idx
  on public.project_images(project_id, created_at desc);

alter table public.project_images enable row level security;

create policy "Project members can read project images"
  on public.project_images
  for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_images.project_id
        and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
    )
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_images.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "Project members can insert project images"
  on public.project_images
  for insert
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_images.project_id
        and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
    )
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_images.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "Project members can delete own images"
  on public.project_images
  for delete
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.projects p
      where p.id = project_images.project_id
        and (p.customer_id = auth.uid() or p.contractor_id = auth.uid())
    )
  );
