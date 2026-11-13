begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','a6ccf69e-920e-4a2e-959c-45fcf7110586','role','authenticated','aud','authenticated','aal','aal2',
    'amr', json_build_array(json_build_object('method','totp','timestamp', floor(extract(epoch from now())))))::text, true);
insert into public.orders (patient_id,name,type,detail,priority,status,ordered_at)
 values ((select id from public.patients limit 1),'Runbook probe','Laboratory','aal2 step-up check','Routine','Pending',now())
 returning id, name, status;
rollback;
