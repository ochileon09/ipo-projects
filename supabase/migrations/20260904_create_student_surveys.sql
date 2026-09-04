create table if not exists public.student_surveys (
  id uuid primary key default gen_random_uuid(),
  student_id text not null check (char_length(student_id) between 1 and 12),
  student_name text not null check (char_length(student_name) between 1 and 30),
  grade smallint not null check (grade between 1 and 3),
  wake_time time not null,
  sleep_time time not null,
  tidiness smallint not null check (tidiness between 1 and 5),
  noise_sensitivity smallint not null check (noise_sensitivity between 1 and 5),
  preferred_temperature smallint not null check (preferred_temperature between 18 and 28),
  roommate_preference text check (char_length(roommate_preference) <= 200),
  accessibility_needs text check (char_length(accessibility_needs) <= 500),
  created_at timestamptz not null default now()
);

alter table public.student_surveys enable row level security;

create policy "allow anonymous survey submissions"
on public.student_surveys
for insert
to anon, authenticated
with check (true);

revoke select, update, delete on public.student_surveys from anon, authenticated;
grant insert on public.student_surveys to anon, authenticated;
