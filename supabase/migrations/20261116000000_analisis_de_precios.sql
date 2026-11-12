-- Finanzas de obra · Sprint 5: análisis de precios (APU)
-- Cuánto cuesta una unidad de cada tarea (el m² de mampostería), separado en materiales, mano de
-- obra y equipos. Componente = insumo × rendimiento por unidad × (1 + desperdicio). El costo sale
-- de una vista: cambia solo cuando cambia el precio de un insumo. Un catálogo de la plataforma
-- sirve de punto de partida: al importarlo, la copia es de la organización y no depende de él.

-- ---------------------------------------------------------------------------
-- Insumos sin precio
-- ---------------------------------------------------------------------------
-- Al importar del catálogo, los insumos que la organización no tiene se crean sin precio.
alter table public.supplies
  alter column price drop not null,
  alter column price_date drop not null,
  add constraint supplies_price_pair check ((price is null) = (price_date is null));

-- upsert_supply: igual que antes, pero un insumo sin precio no suma historial.
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

  if v_new.price is not null and (v_old.id is null or v_old.price is distinct from v_new.price
     or v_old.currency <> v_new.currency or v_old.price_date is distinct from v_new.price_date) then
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
-- Análisis de precios
-- ---------------------------------------------------------------------------
create table public.unit_analyses (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  code               text not null check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  name               text not null check (length(btrim(name)) between 2 and 200),
  unit               text not null check (length(btrim(unit)) between 1 and 20),
  chapter            text not null check (length(btrim(chapter)) between 2 and 80),  -- rubro
  -- Desperdicio que se propone al sumar un material (cada componente guarda el suyo).
  default_waste_pct  numeric(5, 2) not null default 0 check (default_waste_pct >= 0 and default_waste_pct <= 100),
  origin             text not null default 'own' check (origin in ('own', 'catalog')),
  catalog_code       text,
  notes              text check (length(notes) <= 2000),
  created_by         uuid not null references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, code)
);
create index unit_analyses_org_chapter_idx on public.unit_analyses (org_id, chapter, code);

create table public.unit_analysis_components (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  analysis_id  uuid not null references public.unit_analyses (id) on delete cascade,
  supply_id    uuid not null references public.supplies (id) on delete restrict,
  yield        numeric(14, 6) not null check (yield > 0),  -- rendimiento: cantidad de insumo por unidad
  waste_pct    numeric(5, 2) not null default 0 check (waste_pct >= 0 and waste_pct <= 100),
  position     integer not null default 0,
  unique (analysis_id, supply_id)
);
create index unit_analysis_components_supply_idx on public.unit_analysis_components (supply_id);
create index unit_analysis_components_org_idx on public.unit_analysis_components (org_id);

create or replace function private.unit_analysis_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.unit := btrim(new.unit);
  new.chapter := btrim(new.chapter);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger unit_analyses_before_write before insert or update on public.unit_analyses
for each row execute function private.unit_analysis_before_write();

create trigger unit_analyses_audit after insert or update or delete on public.unit_analyses
for each row execute function private.audit_row('unit_analysis');

-- El insumo tiene que ser de la misma organización que el análisis. El personal no va acá:
-- es un costo indirecto.
create or replace function private.unit_analysis_component_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select a.org_id into new.org_id from public.unit_analyses a where a.id = new.analysis_id;
  select s.kind into v_kind from public.supplies s where s.id = new.supply_id and s.org_id = new.org_id;
  if v_kind is null then
    raise exception 'El insumo no es de esta organización' using errcode = '23514';
  end if;
  if v_kind = 'staff' then
    raise exception 'El personal va en los costos indirectos, no en un análisis de precios' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger unit_analysis_components_check before insert or update on public.unit_analysis_components
for each row execute function private.unit_analysis_component_check();

-- Costo por unidad, por moneda y sin convertir. Cada parte se redondea a 2 decimales y el total
-- es la suma de las partes: así el desglose siempre cierra al centavo.
create view public.unit_analysis_costs
with (security_invoker = true) as
with parts as (
  select
    c.org_id, c.analysis_id, s.currency,
    round(coalesce(sum(c.yield * (1 + c.waste_pct / 100) * s.price) filter (where s.kind = 'material'), 0), 2) as materials,
    round(coalesce(sum(c.yield * (1 + c.waste_pct / 100) * s.price) filter (where s.kind = 'labor'), 0), 2) as labor,
    round(coalesce(sum(c.yield * (1 + c.waste_pct / 100) * s.price) filter (where s.kind = 'equipment'), 0), 2) as equipment,
    count(*)::integer as components,
    count(*) filter (where s.price is null)::integer as unpriced_components
  from public.unit_analysis_components c
  join public.supplies s on s.id = c.supply_id
  group by c.org_id, c.analysis_id, s.currency
)
select p.org_id, p.analysis_id, p.currency, p.materials, p.labor, p.equipment,
       (p.materials + p.labor + p.equipment)::numeric(14, 2) as total,
       p.components, p.unpriced_components
from parts p;

-- ---------------------------------------------------------------------------
-- Catálogo de la plataforma (sin org_id)
-- ---------------------------------------------------------------------------
create table public.catalog_unit_analyses (
  code               text primary key check (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  name               text not null check (length(btrim(name)) between 2 and 200),
  unit               text not null check (length(btrim(unit)) between 1 and 20),
  chapter            text not null check (length(btrim(chapter)) between 2 and 80),
  default_waste_pct  numeric(5, 2) not null default 0 check (default_waste_pct >= 0 and default_waste_pct <= 100),
  note               text check (length(note) <= 500),
  position           integer not null default 0
);
create table public.catalog_components (
  analysis_code  text not null references public.catalog_unit_analyses (code) on delete cascade,
  supply_code    text not null check (supply_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
  supply_name    text not null check (length(btrim(supply_name)) between 2 and 200),
  supply_kind    text not null check (supply_kind in ('material', 'labor', 'equipment')),
  supply_unit    text not null check (length(btrim(supply_unit)) between 1 and 20),
  yield          numeric(14, 6) not null check (yield > 0),
  waste_pct      numeric(5, 2) not null default 0 check (waste_pct >= 0 and waste_pct <= 100),
  position       integer not null default 0,
  primary key (analysis_code, supply_code)
);

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------
alter table public.unit_analyses enable row level security;
alter table public.unit_analysis_components enable row level security;
alter table public.catalog_unit_analyses enable row level security;
alter table public.catalog_components enable row level security;

create policy unit_analyses_select on public.unit_analyses
for select to authenticated using ((select private.is_org_member(org_id)));
create policy unit_analyses_insert on public.unit_analyses
for insert to authenticated
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works'))
            and created_by = (select auth.uid()) and origin = 'own' and catalog_code is null);
create policy unit_analyses_update on public.unit_analyses
for update to authenticated
using ((select private.is_org_member(org_id)))
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works')));
create policy unit_analyses_delete on public.unit_analyses
for delete to authenticated using ((select private.is_org_owner(org_id)));

create policy unit_analysis_components_select on public.unit_analysis_components
for select to authenticated using ((select private.is_org_member(org_id)));

create policy catalog_unit_analyses_select on public.catalog_unit_analyses for select to authenticated using (true);
create policy catalog_components_select on public.catalog_components for select to authenticated using (true);

revoke all on public.unit_analyses, public.unit_analysis_components, public.unit_analysis_costs,
  public.catalog_unit_analyses, public.catalog_components from anon;
revoke update on public.unit_analyses from authenticated;
grant update (code, name, unit, chapter, default_waste_pct, notes) on public.unit_analyses to authenticated;
-- Componentes y catálogo: los componentes se guardan con la función de abajo; el catálogo lo
-- carga la plataforma por SQL.
revoke insert, update, delete on public.unit_analysis_components, public.catalog_unit_analyses,
  public.catalog_components from authenticated;
grant select on public.unit_analysis_costs to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: guardar los componentes de un análisis (reemplaza la lista completa)
-- ---------------------------------------------------------------------------
-- p_rows: [{"supply_id": "...", "yield": 15.5, "waste_pct": 5}] en el orden en que se muestran.
create or replace function public.set_unit_analysis_components(p_analysis_id uuid, p_rows jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_analysis public.unit_analyses%rowtype;
  v_ids uuid[];
  v_count integer;
begin
  select * into v_analysis from public.unit_analyses where id = p_analysis_id for update;
  if not found or not private.is_org_member(v_analysis.org_id) then
    raise exception 'No tenés acceso a este análisis de precios' using errcode = '42501';
  end if;
  if not private.has_feature(v_analysis.org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Lista de componentes inválida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 100 then
    raise exception 'Hasta 100 componentes por análisis' using errcode = '22023';
  end if;

  select coalesce(array_agg((r ->> 'supply_id')::uuid), '{}') into v_ids from jsonb_array_elements(p_rows) r;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'Hay un insumo repetido' using errcode = '22023';
  end if;

  delete from public.unit_analysis_components c
  where c.analysis_id = p_analysis_id and not (c.supply_id = any (v_ids));

  insert into public.unit_analysis_components (analysis_id, supply_id, yield, waste_pct, position)
  select p_analysis_id, (r.value ->> 'supply_id')::uuid, (r.value ->> 'yield')::numeric,
         coalesce((r.value ->> 'waste_pct')::numeric, 0), r.ordinality::integer
  from jsonb_array_elements(p_rows) with ordinality r
  on conflict (analysis_id, supply_id) do update
    set yield = excluded.yield, waste_pct = excluded.waste_pct, position = excluded.position;
  get diagnostics v_count = row_count;

  update public.unit_analyses set updated_at = now() where id = p_analysis_id;
  perform private.log_event(v_analysis.org_id, 'unit_analysis.components_changed', 'unit_analysis', p_analysis_id,
    jsonb_build_object('code', v_analysis.code, 'components', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: importar análisis del catálogo (dueño)
-- ---------------------------------------------------------------------------
-- La copia es de la organización: después se edita sin tocar el catálogo, y un cambio en el
-- catálogo no la modifica. Los insumos se emparejan por código con los propios; los que faltan
-- se crean sin precio, en pesos.
create or replace function public.import_catalog_analyses(p_org_id uuid, p_codes text[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cat public.catalog_unit_analyses%rowtype;
  v_comp public.catalog_components%rowtype;
  v_analysis uuid;
  v_supply uuid;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_supplies integer := 0;
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño importa del catálogo' using errcode = '42501';
  end if;
  if not private.has_feature(p_org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;
  if p_codes is null or cardinality(p_codes) = 0 then
    raise exception 'Elegí al menos un análisis del catálogo' using errcode = '22023';
  end if;

  for v_cat in
    select * from public.catalog_unit_analyses c where c.code = any (p_codes) order by c.position, c.code
  loop
    if exists (select 1 from public.unit_analyses a where a.org_id = p_org_id and a.code = v_cat.code) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.unit_analyses (org_id, code, name, unit, chapter, default_waste_pct, origin, catalog_code,
                                      created_by)
    values (p_org_id, v_cat.code, v_cat.name, v_cat.unit, v_cat.chapter, v_cat.default_waste_pct, 'catalog',
            v_cat.code, (select auth.uid()))
    returning id into v_analysis;

    for v_comp in
      select * from public.catalog_components cc where cc.analysis_code = v_cat.code order by cc.position
    loop
      select s.id into v_supply from public.supplies s where s.org_id = p_org_id and s.code = v_comp.supply_code;
      if v_supply is null then
        insert into public.supplies (org_id, kind, code, name, unit, currency, created_by)
        values (p_org_id, v_comp.supply_kind, v_comp.supply_code, v_comp.supply_name, v_comp.supply_unit, 'ARS',
                (select auth.uid()))
        returning id into v_supply;
        v_supplies := v_supplies + 1;
      end if;
      insert into public.unit_analysis_components (analysis_id, supply_id, yield, waste_pct, position)
      values (v_analysis, v_supply, v_comp.yield, v_comp.waste_pct, v_comp.position);
    end loop;
    v_imported := v_imported + 1;
  end loop;

  if v_imported > 0 then
    perform private.log_event(p_org_id, 'unit_analyses.imported', 'unit_analysis', null,
      jsonb_build_object('imported', v_imported, 'skipped', v_skipped, 'supplies_created', v_supplies));
  end if;
  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped, 'supplies_created', v_supplies);
end;
$$;

revoke execute on function public.set_unit_analysis_components(uuid, jsonb) from public, anon;
revoke execute on function public.import_catalog_analyses(uuid, text[]) from public, anon;
grant execute on function public.set_unit_analysis_components(uuid, jsonb) to authenticated;
grant execute on function public.import_catalog_analyses(uuid, text[]) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
