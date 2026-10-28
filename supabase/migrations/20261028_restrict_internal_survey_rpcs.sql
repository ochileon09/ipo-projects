-- Older email-login migrations granted authenticated direct access to these helpers.
-- Current clients use only the wrappers that verify the school administrator key.
revoke all on function public.get_student_surveys_for_admin() from public,anon,authenticated;
revoke all on function public.seed_test_student_surveys() from public,anon,authenticated;
