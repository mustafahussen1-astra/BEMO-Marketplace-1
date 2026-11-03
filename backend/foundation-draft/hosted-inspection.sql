-- BEMO M1 catalog-only verification. Read-only: no business/auth rows returned.
-- Execute after applying the reviewed foundation migration as a database owner.
-- Every returned row must have pass = true. Missing objects fail closed.
-- This checks deployed structure/privileges, not live Google OAuth or concurrency.
with
expected_tables(name) as (
  values ('app_users'), ('user_roles'), ('stores'), ('reserved_store_slugs'), ('audit_events')
),
private_tables as (
  select e.name, c.oid, c.relrowsecurity
  from expected_tables e
  left join pg_catalog.pg_namespace n on n.nspname = 'bemo_private'
  left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.name and c.relkind = 'r'
),
expected_functions(signature, is_definer, anon_execute, user_execute) as (
  values
    ('public.bemo_onboard(text,text)', false, false, true),
    ('public.bemo_get_profile()', false, false, true),
    ('public.bemo_update_profile(text,text)', false, false, true),
    ('public.bemo_create_store(text,text,text)', false, false, true),
    ('public.bemo_get_my_store()', false, false, true),
    ('public.bemo_list_stores(text,integer,integer)', false, true, true),
    ('bemo_private.trusted_identity()', true, false, false),
    ('bemo_private.require_actor(boolean)', true, false, false),
    ('bemo_private.profile_json(bemo_private.app_users)', false, false, false),
    ('bemo_private.onboard(text,text)', true, false, true),
    ('bemo_private.get_profile()', true, false, true),
    ('bemo_private.update_profile(text,text)', true, false, true),
    ('bemo_private.create_store(text,text,text)', true, false, true),
    ('bemo_private.get_my_store()', true, false, true),
    ('bemo_private.list_stores(text,integer,integer)', true, true, true)
),
function_state as (
  select e.*, p.oid, p.prosecdef, p.proconfig,
    case when p.oid is not null then pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_actual,
    case when p.oid is not null then pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') end as user_actual,
    case when p.oid is not null then pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') end as service_actual,
    exists (
      select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) as public_execute
  from expected_functions e
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(e.signature)
),
expected_unique(table_name, column_name) as (
  values ('app_users', 'auth_subject'), ('app_users', 'email_normalized'),
    ('stores', 'owner_user_id'), ('stores', 'slug')
),
unique_state as (
  select e.*, exists (
    select 1 from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = e.column_name
    where n.nspname = 'bemo_private' and c.relname = e.table_name
      and con.contype = 'u' and con.convalidated and not con.condeferrable
      and con.conkey = array[a.attnum]::smallint[]
  ) as valid
  from expected_unique e
),
checks(name, pass) as (
  select 'private_schema_exists_no_client_create',
    exists (select 1 from pg_catalog.pg_namespace where nspname = 'bemo_private')
    and not pg_catalog.has_schema_privilege('anon', 'bemo_private', 'CREATE')
    and not pg_catalog.has_schema_privilege('authenticated', 'bemo_private', 'CREATE')
  union all
  select 'exact_five_private_tables', count(*) = 5
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'bemo_private' and c.relkind in ('r', 'p')
  union all
  select 'all_expected_tables_exist_and_have_rls', bool_and(oid is not null and relrowsecurity) from private_tables
  union all
  select 'private_tables_default_deny_no_policies', not exists (
    select 1 from pg_catalog.pg_policy p join private_tables t on t.oid = p.polrelid
  )
  union all
  select 'no_client_table_or_column_privileges', bool_and(
    t.oid is not null
    and not pg_catalog.has_table_privilege(r.role_name, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not pg_catalog.has_any_column_privilege(r.role_name, t.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
  ) from private_tables t cross join (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
  union all
  select 'all_five_tables_have_primary_key', count(*) = 5
    from private_tables t join pg_catalog.pg_constraint c on c.conrelid = t.oid and c.contype = 'p' and c.convalidated
  union all
  select 'exact_six_public_bemo_rpcs', count(*) = 6
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and left(p.proname, 5) = 'bemo_'
  union all
  select 'exact_nine_private_functions', count(*) = 9
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'bemo_private'
  union all
  select 'all_expected_function_signatures_exist', bool_and(oid is not null) from function_state
  union all
  select 'correct_invoker_and_definer_flags', bool_and(oid is not null and prosecdef = is_definer) from function_state
  union all
  select 'all_functions_pin_empty_search_path', bool_and(
    oid is not null and coalesce('search_path=""' = any(proconfig) or 'search_path=' = any(proconfig), false)
  ) from function_state
  union all
  select 'no_function_execute_for_public', bool_and(oid is not null and not public_execute) from function_state
  union all
  select 'exact_browser_function_execute_grants', bool_and(
    oid is not null and anon_actual = anon_execute and user_actual = user_execute
  ) from function_state
  union all
  select 'no_service_role_rpc_execute', bool_and(oid is not null and not service_actual) from function_state
  union all
  select 'unique_' || table_name || '_' || column_name, valid from unique_state
  union all
  select 'store_title_normalized_unique_valid', exists (
    select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid
    where i.indrelid = pg_catalog.to_regclass('bemo_private.stores')
      and c.relname = 'stores_title_normalized_key' and i.indisunique and i.indisvalid and i.indisready
      and i.indnkeyatts = 1 and i.indpred is null
      and pg_catalog.pg_get_expr(i.indexprs, i.indrelid) = 'lower(btrim(title))'
  )
  union all
  select 'store_public_index_valid', exists (
    select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid
    where i.indrelid = pg_catalog.to_regclass('bemo_private.stores')
      and c.relname = 'stores_public_created_idx' and i.indisvalid and i.indisready
      and i.indnkeyatts = 2 and i.indpred is not null
  )
  union all
  select 'audit_actor_index_valid', exists (
    select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid
    where i.indrelid = pg_catalog.to_regclass('bemo_private.audit_events')
      and c.relname = 'audit_events_actor_created_idx' and i.indisvalid and i.indisready and i.indnkeyatts = 2
  )
  union all
  select 'auth_subject_fk_preserves_history', exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = 'auth_subject'
    where c.conrelid = pg_catalog.to_regclass('bemo_private.app_users')
      and c.confrelid = pg_catalog.to_regclass('auth.users') and c.contype = 'f'
      and c.confdeltype = 'r' and c.convalidated and c.conkey = array[a.attnum]::smallint[]
  )
  union all
  select 'directory_returns_only_safe_columns', exists (
    select 1 from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.bemo_list_stores(text,integer,integer)')
      and p.proargnames = array['search_text','limit_count','offset_count','id','slug','title','description','created_at']::text[]
      and p.proargmodes = array['i','i','i','t','t','t','t','t']::"char"[]
  )
)
select name, coalesce(pass, false) as pass from checks order by name;

-- Remaining separate acceptance gates:
-- 1. Google-only provider configuration, genuine Gmail sign-in and refresh.
-- 2. Hosted signed requests: revoked session / suspended account / isolation.
-- 3. Two real connections racing onboarding and store creation.
-- 4. Anon REST allow for bounded directory; deny for all five protected RPCs.
-- 5. Data API exposed schemas exclude bemo_private; security advisors checked.
-- Local fixtures or catalog checks do not prove any of these end-to-end gates.
