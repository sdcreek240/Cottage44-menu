begin;

drop policy if exists plates_public_today_and_tomorrow_read on plates;

create policy plates_public_upcoming_read
  on plates
  for select
  to anon
  using (
    exists (
      select 1
      from daily_plates
      where daily_plates.plate_id = plates.id
        and daily_plates.service_date >= (now() at time zone 'Africa/Johannesburg')::date
        and daily_plates.service_date <= (now() at time zone 'Africa/Johannesburg')::date + 8
    )
  );

commit;