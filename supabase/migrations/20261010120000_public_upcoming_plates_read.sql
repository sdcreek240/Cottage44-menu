-- Widen the public read window on daily_plates so the plate carousel can
-- show today plus the next five workdays (Monday–Friday of the current or
-- following week). The previous policy only allowed today and tomorrow.

drop policy if exists daily_plates_public_today_and_tomorrow_read on daily_plates;

create policy daily_plates_public_upcoming_read
  on daily_plates
  for select
  to anon
  using (
    service_date >= (now() at time zone 'Africa/Johannesburg')::date
    and service_date <= ((now() at time zone 'Africa/Johannesburg')::date + 8)
  );