create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  seed_key text unique,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  price_cents integer not null check (price_cents between 0 and 100000000),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  category_order integer not null check (category_order between 0 and 1000),
  item_order integer not null check (item_order between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_items_public_order_idx
on public.menu_items (category_order, item_order, id)
where active;

create trigger menu_items_set_updated_at
before update on public.menu_items
for each row
execute function public.set_updated_at();

alter table public.menu_items enable row level security;
revoke all on table public.menu_items from anon, authenticated;
grant select on table public.menu_items to anon, authenticated;
grant insert, update, delete on table public.menu_items to authenticated;

create policy menu_items_public_read
on public.menu_items
for select
to anon
using (active);

create policy menu_items_owner_read
on public.menu_items
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy menu_items_owner_insert
on public.menu_items
for insert
to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy menu_items_owner_update
on public.menu_items
for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy menu_items_owner_delete
on public.menu_items
for delete
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

insert into public.menu_items (
  id, seed_key, name, description, price_cents, category, category_order, item_order
) values
  ('10000000-0000-4000-8000-000000000001', 'toasties-bacon-egg-and-cheese', 'Bacon, Egg and Cheese', '', 2700, 'Toasties', 0, 0),
  ('10000000-0000-4000-8000-000000000002', 'toasties-ham-and-cheese', 'Ham and Cheese', '', 2300, 'Toasties', 0, 1),
  ('10000000-0000-4000-8000-000000000003', 'toasties-ham-cheese-and-tomato', 'Ham, Cheese and Tomato', '', 2500, 'Toasties', 0, 2),
  ('10000000-0000-4000-8000-000000000004', 'toasties-chicken-mayo', 'Chicken Mayo', '', 2500, 'Toasties', 0, 3),
  ('10000000-0000-4000-8000-000000000005', 'toasties-cheese-and-tomato', 'Cheese and Tomato', '', 2000, 'Toasties', 0, 4),
  ('10000000-0000-4000-8000-000000000006', 'toasties-bacon-and-cheese', 'Bacon and Cheese', '', 2500, 'Toasties', 0, 5),
  ('10000000-0000-4000-8000-000000000007', 'toasties-egg-mayonnaise', 'Egg Mayonnaise', '', 2000, 'Toasties', 0, 6),
  ('10000000-0000-4000-8000-000000000008', 'healthy-chicken-salad', 'Chicken salad', '', 3800, 'Healthy', 1, 0),
  ('10000000-0000-4000-8000-000000000009', 'healthy-bacon-salad', 'Bacon salad', '', 3800, 'Healthy', 1, 1),
  ('10000000-0000-4000-8000-000000000010', 'healthy-chicken-wrap-with-salad-filling', 'Chicken wrap with salad filling', '', 3800, 'Healthy', 1, 2),
  ('10000000-0000-4000-8000-000000000011', 'healthy-tramazinni', 'Tramazinni', '', 4800, 'Healthy', 1, 3),
  ('10000000-0000-4000-8000-000000000012', 'healthy-tea-or-coffee', 'Tea or coffee', '', 1000, 'Healthy', 1, 4),
  ('10000000-0000-4000-8000-000000000013', 'healthy-cuppachino', 'Cuppachino', '', 1500, 'Healthy', 1, 5),
  ('10000000-0000-4000-8000-000000000014', 'lunch-hotdog-roll', 'Hotdog roll', '', 1500, 'Lunch', 2, 0),
  ('10000000-0000-4000-8000-000000000015', 'lunch-chip-roll-with-white-sauce', 'Chip roll with white sauce', '', 2500, 'Lunch', 2, 1),
  ('10000000-0000-4000-8000-000000000016', 'lunch-russian-roll-with-125g-chips', 'Russian roll with 125g chips', '', 3000, 'Lunch', 2, 2),
  ('10000000-0000-4000-8000-000000000017', 'lunch-300g-chips', '300g chips', '', 2000, 'Lunch', 2, 3),
  ('10000000-0000-4000-8000-000000000018', 'lunch-loaded-fries', 'Loaded fries', 'Chips, cheese sauce, cheese and bacon', 3800, 'Lunch', 2, 4),
  ('10000000-0000-4000-8000-000000000019', 'lunch-russian-and-300g-chips', 'Russian and 300g chips', '', 3000, 'Lunch', 2, 5),
  ('10000000-0000-4000-8000-000000000020', 'lunch-nuggets-and-300g-chips', 'Nuggets and 300g chips', '', 3600, 'Lunch', 2, 6),
  ('10000000-0000-4000-8000-000000000021', 'lunch-skambane', 'Skambane', 'Russian, chips, cheese and ¼ bread', 3500, 'Lunch', 2, 7),
  ('10000000-0000-4000-8000-000000000022', 'lunch-strips-and-300g-chips', 'Strips and 300g chips', '', 4000, 'Lunch', 2, 8),
  ('10000000-0000-4000-8000-000000000023', 'burgers-dagwood-with-300g-chips', 'Dagwood with 300g chips', '', 5000, 'Burgers', 3, 0),
  ('10000000-0000-4000-8000-000000000024', 'burgers-beef-burger-with-125g-chips', 'Beef burger with 125g chips', '', 4000, 'Burgers', 3, 1),
  ('10000000-0000-4000-8000-000000000025', 'burgers-crumbed-chicken-burger-with-125g-chips', 'Crumbed chicken burger with 125g chips', '', 4000, 'Burgers', 3, 2),
  ('10000000-0000-4000-8000-000000000026', 'singles-russian', 'Russian', '', 1200, 'Singles', 4, 0),
  ('10000000-0000-4000-8000-000000000027', 'singles-vienna', 'Vienna', '', 800, 'Singles', 4, 1),
  ('10000000-0000-4000-8000-000000000028', 'singles-6-nuggets', '6 Nuggets', '', 1600, 'Singles', 4, 2),
  ('10000000-0000-4000-8000-000000000029', 'singles-3-strips', '3 Strips', '', 2500, 'Singles', 4, 3),
  ('10000000-0000-4000-8000-000000000030', 'singles-fried-egg', 'Fried egg', '', 500, 'Singles', 4, 4),
  ('10000000-0000-4000-8000-000000000031', 'singles-rolls', 'Rolls', '', 500, 'Singles', 4, 5),
  ('10000000-0000-4000-8000-000000000032', 'singles-one-third-bread', '⅓ bread', '', 800, 'Singles', 4, 6),
  ('10000000-0000-4000-8000-000000000033', 'singles-one-third-bread-with-butter', '⅓ bread with butter', '', 1000, 'Singles', 4, 7),
  ('10000000-0000-4000-8000-000000000034', 'singles-butter', 'Butter', '', 400, 'Singles', 4, 8),
  ('10000000-0000-4000-8000-000000000035', 'breakfast-all-day-breakfast', 'All day breakfast', '2 eggs, 125g chips, bread, 2 bacon', 3500, 'Breakfast', 5, 0),
  ('10000000-0000-4000-8000-000000000036', 'breakfast-starter-pack', 'Starter pack', '2 eggs, 125g chips, 2 bread, vienna', 3000, 'Breakfast', 5, 1),
  ('10000000-0000-4000-8000-000000000037', 'breakfast-special-breakfast', 'Special breakfast', '2 eggs, 125g chips, 2 bread, 2 bacon, russian, salad', 5000, 'Breakfast', 5, 2)
on conflict (seed_key) do nothing;
