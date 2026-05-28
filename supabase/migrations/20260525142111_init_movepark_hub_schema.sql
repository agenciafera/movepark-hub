
-- extensions
create extension if not exists pgcrypto;

-- enums
create type booking_status as enum ('pending','confirmed','checked_in','completed','cancelled','no_show');
create type booking_item_type as enum ('parking','add_on');
create type discount_type as enum ('percent','fixed');
create type payment_status as enum ('pending','authorized','paid','refunded','failed','cancelled');
create type entity_status as enum ('active','inactive','suspended');

-- updated_at trigger fn
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- TENANCY & CATALOG
-- =========================================================
create table public.company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  tax_id text,
  status entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger company_set_updated_at before update on public.company
  for each row execute function public.set_updated_at();

create table public.location (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete restrict,
  name text not null,
  slug text not null,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  timezone text not null default 'America/Sao_Paulo',
  status entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);
create index on public.location (company_id);
create trigger location_set_updated_at before update on public.location
  for each row execute function public.set_updated_at();

create table public.parking_type (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger parking_type_set_updated_at before update on public.parking_type
  for each row execute function public.set_updated_at();

create table public.company_parking_type (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  parking_type_id uuid not null references public.parking_type(id) on delete restrict,
  base_price numeric(12,2) not null check (base_price >= 0),
  default_capacity integer not null check (default_capacity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, parking_type_id)
);
create index on public.company_parking_type (company_id);
create trigger company_parking_type_set_updated_at before update on public.company_parking_type
  for each row execute function public.set_updated_at();

create table public.location_parking_type (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.location(id) on delete cascade,
  company_parking_type_id uuid not null references public.company_parking_type(id) on delete cascade,
  capacity integer not null check (capacity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, company_parking_type_id)
);
create index on public.location_parking_type (location_id);
create trigger location_parking_type_set_updated_at before update on public.location_parking_type
  for each row execute function public.set_updated_at();

create table public.add_on_service (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  base_price numeric(12,2) not null check (base_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create index on public.add_on_service (company_id);
create trigger add_on_service_set_updated_at before update on public.add_on_service
  for each row execute function public.set_updated_at();

create table public.location_add_on_service (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.location(id) on delete cascade,
  add_on_service_id uuid not null references public.add_on_service(id) on delete cascade,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, add_on_service_id)
);
create index on public.location_add_on_service (location_id);
create trigger location_add_on_service_set_updated_at before update on public.location_add_on_service
  for each row execute function public.set_updated_at();

-- =========================================================
-- USERS (profiles) & VEHICLES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  tax_id text,
  phone text,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.vehicle (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  license_plate text not null,
  model text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.vehicle (profile_id);
create trigger vehicle_set_updated_at before update on public.vehicle
  for each row execute function public.set_updated_at();

-- =========================================================
-- BOOKING
-- =========================================================
create table public.booking (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  location_id uuid not null references public.location(id) on delete restrict,
  vehicle_id uuid references public.vehicle(id) on delete set null,
  check_in_at timestamptz not null,
  check_out_at timestamptz not null,
  status booking_status not null default 'pending',
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'BRL',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (check_out_at > check_in_at)
);
create index on public.booking (profile_id);
create index on public.booking (location_id);
create index on public.booking (status);
create index on public.booking (check_in_at);
create trigger booking_set_updated_at before update on public.booking
  for each row execute function public.set_updated_at();

create table public.booking_item (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking(id) on delete cascade,
  item_type booking_item_type not null,
  parking_type_id uuid references public.parking_type(id) on delete restrict,
  add_on_service_id uuid references public.add_on_service(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (item_type = 'parking' and parking_type_id is not null and add_on_service_id is null)
    or
    (item_type = 'add_on' and add_on_service_id is not null and parking_type_id is null)
  )
);
create index on public.booking_item (booking_id);
create trigger booking_item_set_updated_at before update on public.booking_item
  for each row execute function public.set_updated_at();

-- =========================================================
-- PAYMENTS & COUPONS
-- =========================================================
create table public.payment (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking(id) on delete restrict,
  provider text not null,
  provider_payment_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'BRL',
  status payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payment (booking_id);
create index on public.payment (status);
create trigger payment_set_updated_at before update on public.payment
  for each row execute function public.set_updated_at();

create table public.coupon (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  code text not null,
  discount_type discount_type not null,
  discount_value numeric(12,2) not null check (discount_value >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  times_used integer not null default 0 check (times_used >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create index on public.coupon (company_id);
create trigger coupon_set_updated_at before update on public.coupon
  for each row execute function public.set_updated_at();

create table public.booking_coupon (
  booking_id uuid not null references public.booking(id) on delete cascade,
  coupon_id uuid not null references public.coupon(id) on delete restrict,
  discount_applied numeric(12,2) not null check (discount_applied >= 0),
  created_at timestamptz not null default now(),
  primary key (booking_id, coupon_id)
);

-- =========================================================
-- RLS
-- =========================================================
alter table public.company enable row level security;
alter table public.location enable row level security;
alter table public.parking_type enable row level security;
alter table public.company_parking_type enable row level security;
alter table public.location_parking_type enable row level security;
alter table public.add_on_service enable row level security;
alter table public.location_add_on_service enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicle enable row level security;
alter table public.booking enable row level security;
alter table public.booking_item enable row level security;
alter table public.payment enable row level security;
alter table public.coupon enable row level security;
alter table public.booking_coupon enable row level security;

-- public catalog reads
create policy catalog_read_company on public.company
  for select to anon, authenticated using (deleted_at is null and status = 'active');
create policy catalog_read_location on public.location
  for select to anon, authenticated using (deleted_at is null and status = 'active');
create policy catalog_read_parking_type on public.parking_type
  for select to anon, authenticated using (true);
create policy catalog_read_company_parking_type on public.company_parking_type
  for select to anon, authenticated using (is_active);
create policy catalog_read_location_parking_type on public.location_parking_type
  for select to anon, authenticated using (is_active);
create policy catalog_read_add_on_service on public.add_on_service
  for select to anon, authenticated using (is_active);
create policy catalog_read_location_add_on_service on public.location_add_on_service
  for select to anon, authenticated using (is_active);
create policy catalog_read_coupon on public.coupon
  for select to anon, authenticated using (is_active);

-- owner-only profiles
create policy profile_owner_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profile_owner_update on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- owner-only vehicle
create policy vehicle_owner_all on public.vehicle
  for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- owner-only booking
create policy booking_owner_select on public.booking
  for select to authenticated using (profile_id = (select auth.uid()));
create policy booking_owner_insert on public.booking
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy booking_owner_update on public.booking
  for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- booking_item via booking ownership
create policy booking_item_owner_select on public.booking_item
  for select to authenticated using (
    exists (select 1 from public.booking b where b.id = booking_item.booking_id and b.profile_id = (select auth.uid()))
  );
create policy booking_item_owner_write on public.booking_item
  for all to authenticated using (
    exists (select 1 from public.booking b where b.id = booking_item.booking_id and b.profile_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.booking b where b.id = booking_item.booking_id and b.profile_id = (select auth.uid()))
  );

-- payment via booking ownership
create policy payment_owner_select on public.payment
  for select to authenticated using (
    exists (select 1 from public.booking b where b.id = payment.booking_id and b.profile_id = (select auth.uid()))
  );

-- booking_coupon via booking ownership
create policy booking_coupon_owner_select on public.booking_coupon
  for select to authenticated using (
    exists (select 1 from public.booking b where b.id = booking_coupon.booking_id and b.profile_id = (select auth.uid()))
  );
