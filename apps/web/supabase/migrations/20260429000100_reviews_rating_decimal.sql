-- Allow fractional review ratings (e.g. 4.2) from averaged category scores.
alter table public.reviews
  alter column rating type numeric(3,1) using rating::numeric(3,1);

alter table public.reviews
  drop constraint if exists reviews_rating_check;

alter table public.reviews
  add constraint reviews_rating_check check (rating between 1 and 5);
