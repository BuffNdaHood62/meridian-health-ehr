-- Supabase Auth deletes cascade auth_events.user_id to NULL through the
-- ON DELETE SET NULL foreign key. The original append-only trigger rejected
-- that UPDATE before GoTrue could finish deleting the user. Keep the trail
-- immutable while allowing only this referential cleanup.
-- STATUS: applied to zdtaludwhxnjutosrnvi on 2026-11-27.

create or replace function public.forbid_auth_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.user_id is not null
     and new.user_id is null
     and not exists (select 1 from auth.users where id = old.user_id)
     and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id')
  then
    return new;
  end if;

  raise exception '% is append-only (%; only auth-user referential cleanup may null user_id)',
    tg_table_name, tg_op;
end;
$$;

revoke execute on function public.forbid_auth_event_mutation()
  from public, anon, authenticated;

create or replace trigger auth_events_immutable
before update or delete on public.auth_events
for each row execute function public.forbid_auth_event_mutation();
