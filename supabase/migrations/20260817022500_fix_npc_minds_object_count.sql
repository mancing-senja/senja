create or replace function public.senja_merge_profile(p_token text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_hash text;
  v_patch jsonb := case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end;
  v_row public.senja_profiles%rowtype;
  v_key text;
  v_entry jsonb;
  v_cur jsonb;
  v_item text;
  v_count bigint;
  v_best bigint;
  v_grade bigint;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'invalid profile token' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  insert into public.senja_profiles (token_hash) values (v_hash) on conflict (token_hash) do nothing;
  select * into v_row from public.senja_profiles where token_hash = v_hash for update;

  if jsonb_typeof(v_patch -> 'name') = 'string' then v_row.name := left(v_patch ->> 'name', 24); end if;
  if jsonb_typeof(v_patch -> 'look') = 'number' then v_row.look := least(63, greatest(0, floor((v_patch ->> 'look')::numeric)::integer)); end if;
  if jsonb_typeof(v_patch -> 'coins') = 'number' then v_row.coins := greatest(v_row.coins, greatest(0, floor((v_patch ->> 'coins')::numeric)::bigint)); end if;
  if jsonb_typeof(v_patch -> 'caught') = 'number' then v_row.caught := greatest(v_row.caught, greatest(0, floor((v_patch ->> 'caught')::numeric)::bigint)); end if;
  if jsonb_typeof(v_patch -> 'day') = 'number' then v_row.day := greatest(v_row.day, greatest(0, floor((v_patch ->> 'day')::numeric)::bigint)); end if;

  if jsonb_typeof(v_patch -> 'log') = 'object' then
    for v_key, v_entry in select key, value from jsonb_each(v_patch -> 'log') loop
      if v_key ~ '^[a-z_]{1,32}$' and jsonb_typeof(v_entry) = 'object' then
        v_cur := coalesce(v_row.log -> v_key, '{"count":0,"best":0,"bestGrade":0}'::jsonb);
        v_count := case when jsonb_typeof(v_entry -> 'count') = 'number' then greatest(0, floor((v_entry ->> 'count')::numeric)::bigint) else 0 end;
        v_best := case when jsonb_typeof(v_entry -> 'best') = 'number' then greatest(0, floor((v_entry ->> 'best')::numeric)::bigint) else 0 end;
        v_grade := case when jsonb_typeof(v_entry -> 'bestGrade') = 'number' then greatest(0, floor((v_entry ->> 'bestGrade')::numeric)::bigint) else 0 end;
        v_row.log := jsonb_set(v_row.log, array[v_key], jsonb_build_object(
          'count', greatest(coalesce((v_cur ->> 'count')::bigint, 0), v_count),
          'best', greatest(coalesce((v_cur ->> 'best')::bigint, 0), v_best),
          'bestGrade', greatest(coalesce((v_cur ->> 'bestGrade')::bigint, 0), v_grade)
        ), true);
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_patch -> 'lore') = 'array' then
    for v_item in select value from jsonb_array_elements_text(v_patch -> 'lore') loop
      if v_item ~ '^[a-z0-9_-]{1,32}$' and jsonb_array_length(v_row.lore) < 256 and not (v_row.lore @> jsonb_build_array(v_item)) then
        v_row.lore := v_row.lore || jsonb_build_array(v_item);
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_patch -> 'minds') = 'object' and octet_length((v_patch -> 'minds')::text) <= 65536 then
    for v_key, v_entry in select key, value from jsonb_each(v_patch -> 'minds') loop
      if v_key ~ '^[A-Za-z0-9:_-]{1,64}$' and jsonb_typeof(v_entry) = 'object' and octet_length(v_entry::text) <= 2048
        and ((v_row.minds ? v_key) or (select count(*) from jsonb_object_keys(v_row.minds)) < 256) then
        v_row.minds := jsonb_set(v_row.minds, array[v_key], v_entry, true);
      end if;
    end loop;
  end if;

  update public.senja_profiles set
    name = v_row.name, look = v_row.look, coins = v_row.coins, caught = v_row.caught,
    day = v_row.day, log = v_row.log, lore = v_row.lore, minds = v_row.minds,
    seen = now(), updated_at = now()
  where token_hash = v_hash;

  return jsonb_build_object(
    'name', v_row.name, 'look', v_row.look, 'coins', v_row.coins, 'caught', v_row.caught,
    'day', v_row.day, 'log', v_row.log, 'lore', v_row.lore, 'minds', v_row.minds,
    'seen', (extract(epoch from now()) * 1000)::bigint
  );
end;
$$;

revoke all on function public.senja_merge_profile(text, jsonb) from public;
grant execute on function public.senja_merge_profile(text, jsonb) to anon, authenticated;
