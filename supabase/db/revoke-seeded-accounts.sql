-- Go-live hardening: kill the documented shared demo credential on the live
-- project. Chosen option: revoke the four clinical staff accounts, and keep
-- admin@www.clinic as a break-glass account whose password nobody knows.
begin;

update public.profiles
   set disabled_at = now()
 where email in ('doctor@www.clinic','nurse@www.clinic','lab@www.clinic','reception@www.clinic')
   and disabled_at is null;

update auth.users
   set encrypted_password = extensions.crypt(
         encode(extensions.gen_random_bytes(24), 'hex'),
         extensions.gen_salt('bf', 10)),
       updated_at = now()
 where id = (select id from public.profiles where email = 'admin@www.clinic');

insert into public.auth_events (org_id, user_id, event, detail)
select '11111111-1111-1111-1111-111111111111', p.id, 'access_changed',
       case when p.email = 'admin@www.clinic'
            then jsonb_build_object('reason', 'seeded_admin_password_rotated')
            else jsonb_build_object('reason', 'seeded_demo_account_revoked')
       end
  from public.profiles p
 where p.email like '%@www.clinic';

insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
select '11111111-1111-1111-1111-111111111111', null, 'update', 'profiles', p.id::text,
       case when p.email = 'admin@www.clinic'
            then 'seeded password rotated to an unknown value (break-glass retained)'
            else 'seeded demo access revoked (disabled_at set)'
       end
  from public.profiles p
 where p.email like '%@www.clinic';

commit;
