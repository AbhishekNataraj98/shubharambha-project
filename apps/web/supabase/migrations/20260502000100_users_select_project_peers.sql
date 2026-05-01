-- Mobile/web project lists (and headers) load contractor/customer/worker names via
-- supabase.from('users').select('id,name').in('id', [...]). The existing policy only
-- allowed selecting one's own row, so peer names always came back empty.

drop policy if exists "users_select_project_peers" on public.users;

create policy "users_select_project_peers"
on public.users for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where (
      p.customer_id = auth.uid()
      or p.contractor_id = auth.uid()
      or exists (
        select 1
        from public.project_members pm_viewer
        where pm_viewer.project_id = p.id
          and pm_viewer.user_id = auth.uid()
      )
    )
    and (
      p.customer_id = users.id
      or p.contractor_id = users.id
      or exists (
        select 1
        from public.project_members pm_peer
        where pm_peer.project_id = p.id
          and pm_peer.user_id = users.id
      )
    )
  )
);
