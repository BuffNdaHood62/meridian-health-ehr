select 'policy' as kind, tablename || '.' || policyname as obj
  from pg_policies where schemaname = 'public'
union all
select 'function', p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
union all
select 'trigger', c.relname || '.' || t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal
union all
select 'table', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
union all
select 'grants', privilege_type
  from information_schema.usage_privileges
 where object_schema = 'public' and grantee in ('anon','authenticated')
order by 1, 2;
