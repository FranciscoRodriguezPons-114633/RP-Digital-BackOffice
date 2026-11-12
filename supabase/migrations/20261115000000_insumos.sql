-- Finanzas de obra · Sprint 4: biblioteca de insumos
-- Materiales, mano de obra, equipos y personal con precio, moneda y fecha. Cada cambio de precio
-- queda en un historial de solo inserción. La mano de obra puede tomar el valor hora de una serie
-- UOCRA × (1 + cargas): cuando la plataforma carga una paritaria nueva, el precio se actualiza
-- solo y queda en el historial.

-- ---------------------------------------------------------------------------
-- Insumos
-- ---------------------------------------------------------------------------
create table public.supplies (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete cascade,
  kind                   text not null check (kind in ('material', 'labor', 'equipment', 'staff')),
  code                   text not null check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  name                   text not null check (length(btrim(name)) between 2 and 200),
  unit                   text not null check (length(btrim(unit)) between 1 and 20),
  currency               text not null check (currency in ('ARS', 'USD')),
  price                  numeric(14, 4) not null check (price > 0),
  price_date             date not null,
  supplier_party_id      uuid references public.parties (id) on delete set null,
  -- Mano de obra atada a una serie (UOCRA): el precio no se edita, lo calcula la base.
  reference_series_code  text references public.reference_series (code) on delete restrict,
  active                 boolean not null default true,
  created_by             uuid not null references auth.users (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (org_id, code),
  constraint supplies_series_only_labor check (
    reference_series_code is null or (kind = 'labor' and currency = 'ARS'))
);
create index supplies_org_kind_idx on public.supplies (org_id, kind, code);
create index supplies_supplier_idx on public.supplies (supplier_party_id);
create index supplies_series_idx on public.supplies (reference_series_code) where reference_series_code is not null;

-- Historial de precios: una fila por cada precio que tuvo el insumo (el primero incluido).
create table public.supply_prices (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  supply_id   uuid not null references public.supplies (id) on delete cascade,
  price       numeric(14, 4) not null check (price > 0),
  currency    text not null check (currency in ('ARS', 'USD')),
  price_date  date not null,
  source      text not null check (source in ('manual', 'import', 'series')),
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index supply_prices_supply_idx on public.supply_prices (supply_id, created_at desc);
create index supply_prices_org_idx on public.supply_prices (org_id);

-- Coeficiente de cargas sociales y Fondo de Cese sobre el valor hora, con vigencia.
create table public.labor_settings (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  valid_from   date not null,
  charges_pct  numeric(6, 2) not null check (charges_pct >= 0 and charges_pct <= 500),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  primary key (org_id, valid_from)
);

create or replace function private.today_cordoba()
returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Cordoba')::date;
$$;

-- Código en mayúsculas y sin espacios; el proveedor tiene que ser un tercero de la organización.
create or replace function private.supply_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.unit := btrim(new.unit);
  if new.supplier_party_id is not null and not exists (
    select 1 from public.parties p
    where p.id = new.supplier_party_id and p.org_id = new.org_id
      and p.roles && array['supplier', 'subcontractor']::text[]) then
    raise exception 'El proveedor tiene que ser un tercero con el rol de proveedor o subcontratista'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger supplies_before_write before insert or update on public.supplies
for each row execute function private.supply_before_write();

-- La vigencia de las cargas no puede ser futura: el precio se recalcula al guardar, no hay un
-- proceso que lo haga cuando llegue la fecha.
create or replace function private.labor_setting_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.valid_from > private.today_cordoba() then
    raise exception 'La vigencia no puede ser una fecha futura' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger labor_settings_check before insert or update on public.labor_settings
for each row execute function private.labor_setting_check();

create trigger labor_settings_audit after insert or update or delete on public.labor_settings
for each row execute function private.audit_row('labor_setting');

-- ---------------------------------------------------------------------------
-- Mano de obra desde la serie
-- ---------------------------------------------------------------------------
-- Precio = último valor hora de la serie × (1 + cargas vigentes ÷ 100), con la fecha de ese valor.
create or replace function private.series_labor_price(p_org_id uuid, p_series text)
returns table (price numeric, price_date date)
language sql stable security definer
set search_path = ''
as $$
  select round(rv.value * (1 + coalesce((
           select ls.charges_pct from public.labor_settings ls
           where ls.org_id = p_org_id and ls.valid_from <= private.today_cordoba()
           order by ls.valid_from desc limit 1), 0) / 100), 2),
         rv.period
  from public.reference_values rv
  where rv.series_code = p_series
  order by rv.period desc limit 1;
$$;

-- Recalcula los insumos atados a una serie; si el precio cambió, lo guarda en el historial.
create or replace function private.refresh_series_supplies(p_org_id uuid, p_series text)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select s.id, s.org_id, l.price as new_price, l.price_date as new_date
    from public.supplies s
    cross join lateral private.series_labor_price(s.org_id, s.reference_series_code) l
    where s.reference_series_code is not null
      and (p_org_id is null or s.org_id = p_org_id)
      and (p_series is null or s.reference_series_code = p_series)
      and (s.price is distinct from l.price or s.price_date is distinct from l.price_date)
    for update of s
  loop
    update public.supplies set price = r.new_price, price_date = r.new_date where id = r.id;
    insert into public.supply_prices (org_id, supply_id, price, currency, price_date, source, created_by)
    values (r.org_id, r.id, r.new_price, 'ARS', r.new_date, 'series', (select auth.uid()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.reference_value_refresh_supplies()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.refresh_series_supplies(null, new.series_code);
  return null;
end;
$$;

-- Diferido al final de la transacción: una carga de doce meses deja un solo cambio de precio
-- (el del último mes), no doce.
create constraint trigger reference_values_refresh_supplies
after insert or update on public.reference_values
deferrable initially deferred
for each row execute function private.reference_value_refresh_supplies();

create or replace function private.labor_setting_refresh_supplies()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.refresh_series_supplies(case when tg_op = 'DELETE' then old.org_id else new.org_id end, null);
  return null;
end;
$$;
create trigger labor_settings_refresh_supplies after insert or update or delete on public.labor_settings
for each row execute function private.labor_setting_refresh_supplies();

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------
alter table public.supplies enable row level security;
alter table public.supply_prices enable row level security;
alter table public.labor_settings enable row level security;

create policy supplies_select on public.supplies
for select to authenticated using ((select private.is_org_member(org_id)));
create policy supply_prices_select on public.supply_prices
for select to authenticated using ((select private.is_org_member(org_id)));
create policy labor_settings_select on public.labor_settings
for select to authenticated using ((select private.is_org_member(org_id)));
create policy labor_settings_insert on public.labor_settings
for insert to authenticated
with check ((select private.is_org_owner(org_id)) and created_by = (select auth.uid()));
create policy labor_settings_update on public.labor_settings
for update to authenticated
using ((select private.is_org_owner(org_id))) with check ((select private.is_org_owner(org_id)));
create policy labor_settings_delete on public.labor_settings
for delete to authenticated using ((select private.is_org_owner(org_id)));

revoke all on public.supplies, public.supply_prices, public.labor_settings from anon;
-- Insumos e historial: toda escritura pasa por las funciones de abajo.
revoke insert, update, delete on public.supplies, public.supply_prices from authenticated;
revoke update on public.labor_settings from authenticated;
grant update (charges_pct) on public.labor_settings to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: alta y edición de un insumo
-- ---------------------------------------------------------------------------
create or replace function public.upsert_supply(
  p_org_id uuid, p_id uuid, p_kind text, p_code text, p_name text, p_unit text, p_currency text,
  p_price numeric, p_price_date date, p_supplier_party_id uuid default null,
  p_reference_series_code text default null, p_active boolean default true)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old public.supplies%rowtype;
  v_new public.supplies%rowtype;
  v_price numeric := p_price;
  v_date date := p_price_date;
  v_currency text := p_currency;
  v_source text := 'manual';
begin
  if not private.is_org_member(p_org_id) then
    raise exception 'No tenés acceso a esta organización' using errcode = '42501';
  end if;
  if not private.has_feature(p_org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;

  if p_reference_series_code is not null then
    if p_kind <> 'labor' or not exists (
      select 1 from public.reference_series s where s.code = p_reference_series_code and s.unit = 'ARS por hora') then
      raise exception 'Solo la mano de obra puede tomar el precio de una escala salarial' using errcode = '22023';
    end if;
    select l.price, l.price_date into v_price, v_date
    from private.series_labor_price(p_org_id, p_reference_series_code) l;
    if v_price is null then
      raise exception 'La serie todavía no tiene valores cargados' using errcode = '22023';
    end if;
    v_currency := 'ARS';
    v_source := 'series';
  end if;

  if p_id is null then
    insert into public.supplies (org_id, kind, code, name, unit, currency, price, price_date, supplier_party_id,
                                 reference_series_code, active, created_by)
    values (p_org_id, p_kind, p_code, p_name, p_unit, v_currency, v_price, v_date, p_supplier_party_id,
            p_reference_series_code, coalesce(p_active, true), (select auth.uid()))
    returning * into v_new;
  else
    select * into v_old from public.supplies where id = p_id and org_id = p_org_id for update;
    if not found then
      raise exception 'El insumo no existe' using errcode = '22023';
    end if;
    update public.supplies
    set kind = p_kind, code = p_code, name = p_name, unit = p_unit, currency = v_currency, price = v_price,
        price_date = v_date, supplier_party_id = p_supplier_party_id,
        reference_series_code = p_reference_series_code, active = coalesce(p_active, true)
    where id = p_id
    returning * into v_new;
  end if;

  if v_old.id is null or v_old.price <> v_new.price or v_old.currency <> v_new.currency
     or v_old.price_date <> v_new.price_date then
    insert into public.supply_prices (org_id, supply_id, price, currency, price_date, source, created_by)
    values (p_org_id, v_new.id, v_new.price, v_new.currency, v_new.price_date, v_source, (select auth.uid()));
  end if;

  if v_old.id is null then
    perform private.log_event(p_org_id, 'supply.created', 'supply', v_new.id,
      jsonb_build_object('code', v_new.code, 'name', v_new.name, 'kind', v_new.kind,
                         'price', v_new.price, 'currency', v_new.currency));
  else
    perform private.log_event(p_org_id, 'supply.updated', 'supply', v_new.id,
      jsonb_build_object('code', v_new.code, 'before', to_jsonb(v_old), 'after', to_jsonb(v_new)));
  end if;
  return v_new.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: importación de una lista de precios (dueño)
-- ---------------------------------------------------------------------------
-- p_rows: [{"line": 2, "kind": "material", "code": "MAT-001", "name": "...", "unit": "kg",
--           "currency": "ARS", "price": 1234.5, "price_date": "2026-11-01", "supplier_tax_id": "30..."}]
-- Si el código ya existe, actualiza precio, moneda y fecha (y lo guarda en el historial); el
-- nombre y la unidad no se pisan. Las filas inválidas no se importan: vuelven en "errors".
-- Con p_dry_run = true no escribe nada: sirve para la vista previa.
create or replace function public.import_supplies(p_org_id uuid, p_rows jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_line integer;
  v_kind text;
  v_code text;
  v_name text;
  v_unit text;
  v_currency text;
  v_price numeric;
  v_date date;
  v_tax_id text;
  v_supplier uuid;
  v_existing public.supplies%rowtype;
  v_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño importa listas de precios' using errcode = '42501';
  end if;
  if not private.has_feature(p_org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No hay filas para importar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Hasta 2000 filas por importación' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_line := coalesce((v_row ->> 'line')::integer, 0);
    begin
      v_kind := v_row ->> 'kind';
      v_code := upper(btrim(v_row ->> 'code'));
      v_name := btrim(v_row ->> 'name');
      v_unit := btrim(v_row ->> 'unit');
      v_currency := v_row ->> 'currency';
      v_price := (v_row ->> 'price')::numeric;
      v_date := (v_row ->> 'price_date')::date;
      v_tax_id := nullif(regexp_replace(coalesce(v_row ->> 'supplier_tax_id', ''), '[^0-9]', '', 'g'), '');
    exception when others then
      v_errors := v_errors || jsonb_build_object('line', v_line, 'message', 'Precio o fecha inválidos');
      continue;
    end;

    if v_kind is null or v_kind not in ('material', 'labor', 'equipment', 'staff')
       or v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'
       or v_name is null or length(v_name) not between 2 and 200
       or v_unit is null or length(v_unit) not between 1 and 20
       or v_currency is null or v_currency not in ('ARS', 'USD')
       or v_price is null or v_price <= 0 or v_date is null then
      v_errors := v_errors || jsonb_build_object('line', v_line, 'message', 'Datos inválidos');
      continue;
    end if;
    if v_code = any (v_seen) then
      v_errors := v_errors || jsonb_build_object('line', v_line, 'message', 'El código está repetido en la lista');
      continue;
    end if;
    v_seen := v_seen || v_code;

    v_supplier := null;
    if v_tax_id is not null then
      select p.id into v_supplier from public.parties p
      where p.org_id = p_org_id and p.tax_id = v_tax_id
        and p.roles && array['supplier', 'subcontractor']::text[];
      if v_supplier is null then
        v_errors := v_errors || jsonb_build_object('line', v_line,
          'message', 'No hay un proveedor con ese CUIT en Terceros');
        continue;
      end if;
    end if;

    select * into v_existing from public.supplies s where s.org_id = p_org_id and s.code = v_code for update;
    if not found then
      v_inserted := v_inserted + 1;
      if not p_dry_run then
        insert into public.supplies (org_id, kind, code, name, unit, currency, price, price_date,
                                     supplier_party_id, created_by)
        values (p_org_id, v_kind, v_code, v_name, v_unit, v_currency, v_price, v_date, v_supplier,
                (select auth.uid()))
        returning id into v_id;
        insert into public.supply_prices (org_id, supply_id, price, currency, price_date, source, created_by)
        values (p_org_id, v_id, v_price, v_currency, v_date, 'import', (select auth.uid()));
      end if;
    elsif v_existing.reference_series_code is not null then
      v_errors := v_errors || jsonb_build_object('line', v_line,
        'message', 'Ese insumo toma el precio de una escala salarial: no se importa');
    elsif v_existing.price = v_price and v_existing.currency = v_currency and v_existing.price_date = v_date then
      v_unchanged := v_unchanged + 1;
    else
      v_updated := v_updated + 1;
      if not p_dry_run then
        update public.supplies
        set price = v_price, currency = v_currency, price_date = v_date,
            supplier_party_id = coalesce(v_supplier, supplier_party_id)
        where id = v_existing.id;
        insert into public.supply_prices (org_id, supply_id, price, currency, price_date, source, created_by)
        values (p_org_id, v_existing.id, v_price, v_currency, v_date, 'import', (select auth.uid()));
      end if;
    end if;
  end loop;

  if not p_dry_run and v_inserted + v_updated > 0 then
    perform private.log_event(p_org_id, 'supplies.imported', 'supply', null,
      jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged,
                         'errors', jsonb_array_length(v_errors)));
  end if;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged,
                            'errors', v_errors);
end;
$$;

revoke execute on function public.upsert_supply(uuid, uuid, text, text, text, text, text, numeric, date, uuid, text, boolean)
  from public, anon;
revoke execute on function public.import_supplies(uuid, jsonb, boolean) from public, anon;
grant execute on function public.upsert_supply(uuid, uuid, text, text, text, text, text, numeric, date, uuid, text, boolean)
  to authenticated;
grant execute on function public.import_supplies(uuid, jsonb, boolean) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
