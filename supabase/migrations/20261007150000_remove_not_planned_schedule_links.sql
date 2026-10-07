delete from public.daily_plates
where plate_id = 'f3397e49-055c-4ebf-9a21-f28b0ac8da50'::uuid
  and service_date in (date '2026-10-07', date '2026-10-08');
