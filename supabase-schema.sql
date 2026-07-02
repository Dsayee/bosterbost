create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null,
  password_hash text not null,
  wallet numeric not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.orders (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  platform text not null,
  service text not null,
  package_type text not null,
  quantity integer not null,
  target_link text not null,
  delivery_mode text not null,
  notes text,
  rate numeric not null,
  cost numeric not null,
  status text not null default 'Pending Review',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.wallet_transactions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null,
  amount_rwf numeric not null,
  original_amount numeric,
  original_currency text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_expires_at_idx on public.sessions(expires_at);
create index if not exists wallet_transactions_user_id_idx on public.wallet_transactions(user_id);
create index if not exists wallet_transactions_created_at_idx on public.wallet_transactions(created_at desc);
