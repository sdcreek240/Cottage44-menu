create policy daily_plates_owner_delete
on public.daily_plates
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date between (now() at time zone 'Africa/Johannesburg')::date
    and ((now() at time zone 'Africa/Johannesburg')::date + 365)
);
