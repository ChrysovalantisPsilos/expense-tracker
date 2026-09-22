-- Pin search_path on fmt_minor (the only public function left without one;
-- flagged by the Supabase linter). Its body only uses pg_catalog built-ins, so
-- an empty search_path is safe. db_tests.sql now asserts every public function
-- pins search_path, so a new one can't slip through.
alter function public.fmt_minor(bigint, text) set search_path = '';
