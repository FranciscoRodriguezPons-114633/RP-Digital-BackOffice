-- Entorno en la nube (N1) · Límites de pedidos.
--
-- Cuántas veces se puede pedir algo por ventana de tiempo, por clave (una IP o un correo).
-- La app lo consulta antes de mandar el enlace mágico y antes de mostrar o decidir una
-- aprobación por link. La clave se guarda como hash, nunca en claro.
--
-- Como la clave la manda quien llama, en la nube la función pide un secreto que solo
-- conoce el servidor de la app (RATE_LIMIT_SECRET): sin él, cualquiera con la clave
-- publicable podría agotar el cupo de la IP o del correo de otra persona. Se configura
-- guardando su hash en private.settings (ver docs/operacion.md). Mientras no esté
-- cargado (local y CI), la función no lo pide.

create table private.settings (
  name  text primary key,
  value text not null
);
alter table private.settings enable row level security;
revoke all on private.settings from public, anon, authenticated;

create table private.rate_limits (
  bucket       text        not null,
  key_hash     text        not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer     not null default 1 check (hits > 0),
  primary key (bucket, key_hash, window_start)
);
create index rate_limits_window_start_idx on private.rate_limits (window_start);
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Suma un pedido y devuelve true si todavía está dentro del límite.
-- Los límites son fijos por tipo para que nadie pueda pedir otros desde el navegador.
create or replace function public.hit_rate_limit(p_bucket text, p_key text, p_secret text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit    integer;
  v_window   interval;
  v_expected text;
  v_start    timestamptz;
  v_hits     integer;
begin
  select s.value into v_expected from private.settings s where s.name = 'rate_limit_secret_sha256';
  if v_expected is not null and (
       p_secret is null
       or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8')), 'hex') <> v_expected) then
    raise exception 'Falta el secreto del servidor' using errcode = '42501';
  end if;

  case p_bucket
    when 'login_ip'        then v_limit := 10; v_window := interval '15 minutes';
    when 'login_email'     then v_limit := 5;  v_window := interval '1 hour';
    when 'approval_view'   then v_limit := 60; v_window := interval '10 minutes';
    when 'approval_decide' then v_limit := 10; v_window := interval '10 minutes';
    else raise exception 'Tipo de límite desconocido' using errcode = '22023';
  end case;

  if p_key is null or pg_catalog.length(pg_catalog.btrim(p_key)) = 0 or pg_catalog.length(p_key) > 320 then
    raise exception 'Clave inválida' using errcode = '22023';
  end if;

  v_start := pg_catalog.date_bin(v_window, pg_catalog.now(), timestamptz '2000-01-01 00:00:00+00');

  insert into private.rate_limits as r (bucket, key_hash, window_start, hits)
  values (
    p_bucket,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(p_key)), 'UTF8')), 'hex'),
    v_start,
    1)
  on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Limpieza al pasar: una ventana de más de un día ya no cuenta para ningún límite.
  delete from private.rate_limits where window_start < pg_catalog.now() - interval '1 day';

  return v_hits <= v_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, text, text) from public;
grant execute on function public.hit_rate_limit(text, text, text) to anon, authenticated;
