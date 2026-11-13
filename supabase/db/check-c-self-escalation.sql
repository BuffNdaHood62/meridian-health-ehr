begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6ccf69e-920e-4a2e-959c-45fcf7110586","role":"authenticated","aud":"authenticated","aal":"aal1"}';
update public.profiles set role='admin' where id=auth.uid();
rollback;
