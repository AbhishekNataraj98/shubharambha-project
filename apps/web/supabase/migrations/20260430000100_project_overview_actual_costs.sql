create table if not exists public.project_overview_actual_costs (
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_key text not null,
  floor_index integer not null default 0,
  stage_label text not null,
  actual_cost numeric(12,2) not null default 0,
  updated_by uuid not null references public.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (project_id, stage_key, floor_index)
);

create index if not exists project_overview_actual_costs_project_idx
  on public.project_overview_actual_costs(project_id, updated_at desc);

alter table public.project_overview_actual_costs enable row level security;

create policy "Members can read project overview actuals"
  on public.project_overview_actual_costs
  for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_overview_actual_costs.project_id
        and (
          p.customer_id = auth.uid()
          or p.contractor_id = auth.uid()
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = auth.uid()
          )
        )
    )
  );

create policy "Members can upsert project overview actuals"
  on public.project_overview_actual_costs
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_overview_actual_costs.project_id
        and (
          p.customer_id = auth.uid()
          or p.contractor_id = auth.uid()
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = auth.uid()
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_overview_actual_costs.project_id
        and (
          p.customer_id = auth.uid()
          or p.contractor_id = auth.uid()
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = auth.uid()
          )
        )
    )
  );
