-- Entorno en la nube (N1) · Límites de pedidos en /login y /aprobar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Quien llama sin sesión (el formulario de ingreso, la página de aprobación) puede usarla,
-- pero no ve la tabla ni los ajustes.
select ok(has_function_privilege('anon', 'public.hit_rate_limit(text, text, text)', 'execute'),
  'anon puede sumar un pedido');
select ok(not has_table_privilege('anon', 'private.rate_limits', 'select'), 'anon no lee los pedidos');
select ok(not has_table_privilege('authenticated', 'private.settings', 'select'), 'nadie de la app lee los ajustes');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- Correo: 5 por hora.
select is(
  (select array_agg(public.hit_rate_limit('login_email', 'ana@estudio.com')) from generate_series(1, 5)),
  array[true, true, true, true, true],
  'los primeros 5 pedidos de un correo pasan');
select is(public.hit_rate_limit('login_email', 'ana@estudio.com'), false, 'el sexto pedido de la hora no pasa');
select is(public.hit_rate_limit('login_email', '  ANA@Estudio.com '), false,
  'el mismo correo con mayúsculas o espacios cuenta igual');
select is(public.hit_rate_limit('login_email', 'beto@estudio.com'), true, 'otro correo tiene su propio cupo');
select is(public.hit_rate_limit('login_ip', 'ana@estudio.com'), true, 'cada tipo de límite cuenta por separado');

-- Aprobación: 10 decisiones por IP cada 10 minutos.
select is(
  (select count(*) filter (where ok) from (
     select public.hit_rate_limit('approval_decide', '200.45.1.10') as ok from generate_series(1, 12)) x)::int,
  10,
  'de 12 decisiones seguidas desde una IP pasan 10');

select throws_ok($$ select public.hit_rate_limit('otra_cosa', '1.1.1.1') $$, '22023', null,
  'un tipo de límite desconocido se rechaza');
select throws_ok($$ select public.hit_rate_limit('login_ip', '   ') $$, '22023', null, 'una clave vacía se rechaza');
reset role;

-- La clave nunca queda en claro.
select is((select count(*) from private.rate_limits where key_hash like '%@%' or key_hash like '%.%')::int, 0,
  'las claves se guardan como hash');
select is((select hits from private.rate_limits where bucket = 'login_email'
           and key_hash = encode(sha256(convert_to('ana@estudio.com', 'UTF8')), 'hex')), 7,
  'los pedidos rechazados también cuentan');

-- Las ventanas de más de un día se borran al pasar.
insert into private.rate_limits (bucket, key_hash, window_start, hits)
values ('login_ip', repeat('a', 64), now() - interval '2 days', 3);
select public.hit_rate_limit('login_ip', '10.0.0.1');
select is((select count(*) from private.rate_limits where window_start < now() - interval '1 day')::int, 0,
  'las ventanas viejas se limpian');

-- Con el secreto del servidor cargado, quien no lo manda no puede sumar pedidos.
insert into private.settings (name, value)
values ('rate_limit_secret_sha256', encode(sha256(convert_to('secreto-del-servidor', 'UTF8')), 'hex'));
set local role anon;
select throws_ok($$ select public.hit_rate_limit('login_ip', '10.0.0.2') $$, '42501', null,
  'sin el secreto no se puede agotar el cupo de otro');
select throws_ok($$ select public.hit_rate_limit('login_ip', '10.0.0.2', 'otro') $$, '42501', null,
  'con un secreto equivocado tampoco');
select is(public.hit_rate_limit('login_ip', '10.0.0.2', 'secreto-del-servidor'), true,
  'con el secreto del servidor, el pedido cuenta');
reset role;

select * from finish();
rollback;
