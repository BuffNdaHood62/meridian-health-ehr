select 'migration ' || version as k, coalesce(name,'-') as v
  from supabase_migrations.schema_migrations
union all
select 'profile ' || email,
       role || ' verified=' || verified::text
         || ' disabled=' || coalesce(disabled_at::text,'null')
         || ' requested=' || coalesce(requested_role,'null')
  from public.profiles
union all
select 'org ' || slug, 'require_step_up_for_orders=' || require_step_up_for_orders::text
  from public.organizations
union all
select 'rows', 'patients=' || (select count(*) from public.patients)
union all
select 'rows', 'www_clients=' || (select count(*) from public.www_clients)
union all
select 'rows', 'auth_events=' || (select count(*) from public.auth_events)
union all
select 'rows', 'invitations=' || (select count(*) from public.invitations)
union all
select 'rows', 'audit_log=' || (select count(*) from public.audit_log)
union all
select 'function', proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('has_recent_mfa','approve_profile','set_profile_access',
        'register_www_client','role_allows','accept_invitation','guard_profile_mutation','is_active_member')
union all
select 'trigger', c.relname || '.' || t.tgname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal
order by 1, 2;
