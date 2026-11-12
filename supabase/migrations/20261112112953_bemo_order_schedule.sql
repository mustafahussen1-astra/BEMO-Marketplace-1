-- Supabase pg_cron is unavailable in the embedded SQL test engine.
-- The job itself must be verified on hosted PostgreSQL after application.
begin;
do $job$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  revoke all on schema cron from public,anon,authenticated,service_role;
  perform cron.schedule('bemo-order-deadlines','*/5 * * * *','select bemo_private.process_order_deadlines();');
 end if;
end;
$job$;
commit;
