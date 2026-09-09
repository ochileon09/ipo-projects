create or replace function public.check_student_surveys_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select to_regclass('public.student_surveys') is not null;
$$;

revoke all on function public.check_student_surveys_ready() from public;
grant execute on function public.check_student_surveys_ready() to anon, authenticated;
