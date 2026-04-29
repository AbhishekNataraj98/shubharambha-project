-- Enforce one review per customer/project/professional pair.
-- Keep the newest row when duplicates already exist.
delete from public.reviews older
using public.reviews newer
where older.project_id = newer.project_id
  and older.reviewer_id = newer.reviewer_id
  and older.reviewee_id = newer.reviewee_id
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

create unique index if not exists reviews_project_reviewer_reviewee_uidx
  on public.reviews (project_id, reviewer_id, reviewee_id);
