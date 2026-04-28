-- Seed demo data for Shubharambha
-- Uses enum types created in the initial schema migration.

begin;

-- Fixed UUIDs for deterministic local demo data.
-- Users
--   customer:   11111111-1111-1111-1111-111111111111
--   contractor: 22222222-2222-2222-2222-222222222222
--   worker:     33333333-3333-3333-3333-333333333333
-- Project
--   44444444-4444-4444-4444-444444444444

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at
)
values
  (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'authenticated',
    'authenticated',
    'rajiv.customer@example.com',
    '$2a$10$dummyhashforseeddataonlynotforproduction000000000000000',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Rajiv Reddy"}'::jsonb,
    now(),
    now(),
    '+919811111111',
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222'::uuid,
    'authenticated',
    'authenticated',
    'suresh.contractor@example.com',
    '$2a$10$dummyhashforseeddataonlynotforproduction000000000000000',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Suresh Constructions"}'::jsonb,
    now(),
    now(),
    '+919822222222',
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333'::uuid,
    'authenticated',
    'authenticated',
    'imran.worker@example.com',
    '$2a$10$dummyhashforseeddataonlynotforproduction000000000000000',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Imran Shaikh"}'::jsonb,
    now(),
    now(),
    '+919833333333',
    now()
  )
on conflict (id) do nothing;

insert into public.users (
  id,
  phone_number,
  name,
  role,
  city,
  pincode,
  profile_photo_url,
  bio,
  is_verified
)
values
  (
    '11111111-1111-1111-1111-111111111111'::uuid,
    '+919811111111',
    'Rajiv Reddy',
    'customer'::public.user_role,
    'Hyderabad',
    '500081',
    'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400',
    'Building a modern 2-floor family home in Kondapur.',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222'::uuid,
    '+919822222222',
    'Suresh Kumar',
    'contractor'::public.user_role,
    'Hyderabad',
    '500034',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    'Civil contractor with 12+ years of residential project experience.',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333'::uuid,
    '+919833333333',
    'Imran Shaikh',
    'worker'::public.user_role,
    'Hyderabad',
    '500070',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    'Masonry and shuttering specialist.',
    true
  )
on conflict (id) do nothing;

insert into public.contractor_profiles (
  id,
  user_id,
  business_name,
  years_experience,
  specialization,
  service_locations,
  license_number,
  hourly_rate
)
values (
  '55555555-5555-5555-5555-555555555555'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Suresh Constructions',
  12,
  array['residential', 'villa', 'renovation'],
  array['Hyderabad', 'Secunderabad', 'Gachibowli'],
  'TS-CIV-2020-1188',
  950.00
)
on conflict (user_id) do nothing;

insert into public.worker_profiles (
  id,
  user_id,
  skill_tags,
  years_experience,
  daily_rate,
  availability_note
)
values (
  '66666666-6666-6666-6666-666666666666'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid,
  array['masonry', 'blockwork', 'plastering'],
  7,
  1200.00,
  'Available full-time for the next 45 days.'
)
on conflict (user_id) do nothing;

insert into public.projects (
  id,
  customer_id,
  contractor_id,
  name,
  address,
  city,
  status,
  current_stage,
  start_date,
  expected_end_date
)
values (
  '44444444-4444-4444-4444-444444444444'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Reddy Residence - G+1 Home',
  'Plot 28, Botanical Garden Road, Kondapur',
  'Hyderabad',
  'active'::public.project_status,
  'walls'::public.construction_stage,
  date '2026-03-10',
  date '2026-12-20'
)
on conflict (id) do nothing;

insert into public.project_members (
  id,
  project_id,
  user_id,
  role,
  invited_by
)
values
  (
    '77777777-7777-7777-7777-777777777771'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'customer'::public.project_member_role,
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  (
    '77777777-7777-7777-7777-777777777772'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'contractor'::public.project_member_role,
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  (
    '77777777-7777-7777-7777-777777777773'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    'worker'::public.project_member_role,
    '22222222-2222-2222-2222-222222222222'::uuid
  )
on conflict (project_id, user_id) do nothing;

insert into public.daily_updates (
  id,
  project_id,
  posted_by,
  description,
  stage_tag,
  photo_urls
)
values
  (
    '88888888-8888-8888-8888-888888888881'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'Foundation footing concrete completed for all primary columns.',
    'foundation'::public.construction_stage,
    array[
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200'
    ]
  ),
  (
    '88888888-8888-8888-8888-888888888882'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    'Plinth beam shuttering removed and curing started.',
    'plinth'::public.construction_stage,
    array[
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=1200'
    ]
  ),
  (
    '88888888-8888-8888-8888-888888888883'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'Ground floor blockwork reached lintel level in living and kitchen area.',
    'walls'::public.construction_stage,
    array[
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200'
    ]
  )
on conflict (id) do nothing;

insert into public.payments (
  id,
  project_id,
  recorded_by,
  paid_to,
  amount,
  payment_mode,
  paid_to_category,
  description,
  receipt_url,
  status,
  paid_at
)
values
  (
    '99999999-9999-9999-9999-999999999991'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    85000.00,
    'bank_transfer'::public.payment_mode,
    'contractor_fee'::public.payment_category,
    'Initial mobilization advance for site setup and workforce.',
    'https://example.com/receipts/mobilization-advance.pdf',
    'confirmed'::public.payment_status,
    now() - interval '20 days'
  ),
  (
    '99999999-9999-9999-9999-999999999992'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    18000.00,
    'upi'::public.payment_mode,
    'labour'::public.payment_category,
    'Weekly labour payout for masonry and shuttering tasks.',
    null,
    'pending_confirmation'::public.payment_status,
    now() - interval '9 days'
  ),
  (
    '99999999-9999-9999-9999-999999999993'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    42000.00,
    'cheque'::public.payment_mode,
    'material'::public.payment_category,
    'Cement and steel batch payment - cheque bounced on bank verification.',
    'https://example.com/receipts/material-batch-1.jpg',
    'rejected'::public.payment_status,
    now() - interval '5 days'
  ),
  (
    '99999999-9999-9999-9999-999999999994'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    22000.00,
    'cash'::public.payment_mode,
    'labour'::public.payment_category,
    'Direct payout for extra weekend labour and curing support.',
    null,
    'confirmed'::public.payment_status,
    now() - interval '2 days'
  )
on conflict (id) do nothing;

insert into public.messages (
  id,
  project_id,
  sender_id,
  content,
  attachment_urls,
  message_type
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'Blockwork is on track. We can start lintel reinforcement by Friday.',
    '{}'::text[],
    'text'::public.message_type
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid,
    '44444444-4444-4444-4444-444444444444'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Please share tomorrow morning site photos before concrete order.',
    '{}'::text[],
    'text'::public.message_type
  )
on conflict (id) do nothing;

commit;
