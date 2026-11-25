-- =====================================================================
-- 2주차: 경기 입력 (출석, 명단 복사, 골·실점 이벤트, 경기 메모) + 집계 뷰 추가
--
-- 입력은 여러 테이블을 한 번에 바꾼다(이벤트 + 태그 + 코트 위 4명).
-- 화면에서 여러 번 나눠 쓰면 중간에 실패했을 때 반쪽 기록이 남으므로,
-- 한 번의 함수 호출 = 한 트랜잭션으로 묶는다.
-- 모든 함수는 security invoker: 호출한 사람의 RLS가 그대로 적용된다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 날짜가 속한 시즌. 없으면 그 해 시즌(1/1~12/31)을 만든다.
-- 감독이 시즌 관리를 따로 하지 않아도 경기를 바로 기록할 수 있게.
-- ---------------------------------------------------------------------
create or replace function public.ensure_season_for(p_date date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sid   uuid;
  yr    int := extract(year from p_date)::int;
  sname text := yr || ' 시즌';
begin
  select id into sid from public.seasons
  where p_date between starts_on and ends_on
  order by starts_on desc
  limit 1;

  if sid is null then
    insert into public.seasons (name, starts_on, ends_on)
    values (sname, make_date(yr, 1, 1), make_date(yr, 12, 31))
    on conflict (name) do nothing
    returning id into sid;
  end if;

  if sid is null then
    raise exception '% 날짜에 맞는 시즌이 없고, "%" 이름의 시즌이 다른 기간으로 이미 있습니다', p_date, sname
      using errcode = 'check_violation';
  end if;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------
-- 지난 경기 명단: 이 경기보다 앞선 경기 중 명단이 있는 가장 최근 경기의 출석.
-- 보관한 선수는 뺀다. 화면이 이 결과로 미리 채운 뒤 감독이 고쳐서 저장한다.
-- ---------------------------------------------------------------------
create or replace function public.previous_attendance(p_match_id uuid)
returns table (player_id uuid, status text, source_match_id uuid, source_played_on date, source_opponent text)
language sql
stable
security invoker
set search_path = ''
as $$
  with cur as (
    select played_on, created_at from public.matches where id = p_match_id
  ),
  src as (
    select m.id, m.played_on, m.opponent
    from public.matches m, cur
    where m.id <> p_match_id
      and m.status = 'finished'
      and (m.played_on, m.created_at) < (cur.played_on, cur.created_at)
      and exists (select 1 from public.match_attendance a where a.match_id = m.id)
    order by m.played_on desc, m.created_at desc
    limit 1
  )
  select a.player_id, a.status, src.id, src.played_on, src.opponent
  from src
  join public.match_attendance a on a.match_id = src.id
  join public.players p on p.id = a.player_id
  where p.is_active;
$$;

-- ---------------------------------------------------------------------
-- 출석 저장 (전체 교체). p_rows = [{"player_id": "...", "status": "played|bench|absent"}]
-- 목록에 없는 선수는 그 경기 명단에서 빠진다.
-- 골·실점 기록에 이름이 있는 선수는 '출전'에서 뺄 수 없다(기록이 틀어지므로).
-- ---------------------------------------------------------------------
create or replace function public.set_attendance(p_match_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  blocked text;
  n       integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '출석 데이터 형식이 잘못됐습니다' using errcode = 'invalid_parameter_value';
  end if;

  select string_agg(distinct p.name, ', ' order by p.name) into blocked
  from (
    select e.scorer_id as pid from public.goal_events e where e.match_id = p_match_id
    union select e.assist_id from public.goal_events e where e.match_id = p_match_id
    union select e.goalkeeper_id from public.goal_events e where e.match_id = p_match_id
    union select o.player_id from public.goal_event_on_court o
            join public.goal_events e on e.id = o.event_id
          where e.match_id = p_match_id
  ) used
  join public.players p on p.id = used.pid
  where not exists (
    select 1 from jsonb_to_recordset(p_rows) as a (player_id uuid, status text)
    where a.player_id = used.pid and a.status = 'played'
  );

  if blocked is not null then
    raise exception '골·실점 기록에 있는 선수는 출전에서 뺄 수 없어요: %', blocked
      using errcode = 'check_violation';
  end if;

  delete from public.match_attendance m
  where m.match_id = p_match_id
    and not exists (
      select 1 from jsonb_to_recordset(p_rows) as a (player_id uuid, status text)
      where a.player_id = m.player_id
    );

  insert into public.match_attendance (match_id, player_id, status)
  select p_match_id, a.player_id, a.status
  from jsonb_to_recordset(p_rows) as a (player_id uuid, status text)
  on conflict (match_id, player_id) do update set status = excluded.status;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 골/실점 이벤트 저장 (새로 만들기 또는 고치기). 이벤트 + 태그 + 코트 위 4명을 한 번에.
-- 순서(seq)는 자동으로 다음 번호. 기록된 골이 스코어보다 많아지면 스코어를 올린다
-- (경기 후 "+ 우리 골"만 눌러도 스코어가 맞게). 스코어를 내리는 건 감독이 직접.
-- ---------------------------------------------------------------------
create or replace function public.save_goal_event(
  p_match_id      uuid,
  p_side          text,
  p_scorer_id     uuid default null,
  p_assist_id     uuid default null,
  p_is_own_goal   boolean default false,
  p_goalkeeper_id uuid default null,
  p_tag_ids       smallint[] default '{}',
  p_on_court      uuid[] default '{}',
  p_note          text default null,
  p_event_id      uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  eid uuid;
begin
  if p_event_id is null then
    insert into public.goal_events
      (match_id, side, seq, scorer_id, assist_id, is_own_goal, goalkeeper_id, note)
    values (
      p_match_id, p_side,
      coalesce((select max(seq) from public.goal_events where match_id = p_match_id), 0) + 1,
      p_scorer_id, p_assist_id, coalesce(p_is_own_goal, false), p_goalkeeper_id, nullif(trim(p_note), '')
    )
    returning id into eid;
  else
    update public.goal_events
    set side = p_side, scorer_id = p_scorer_id, assist_id = p_assist_id,
        is_own_goal = coalesce(p_is_own_goal, false), goalkeeper_id = p_goalkeeper_id,
        note = nullif(trim(p_note), '')
    where id = p_event_id and match_id = p_match_id
    returning id into eid;

    if eid is null then
      raise exception '고칠 기록을 찾을 수 없어요' using errcode = 'no_data_found';
    end if;
    delete from public.goal_event_tags where event_id = eid;
    delete from public.goal_event_on_court where event_id = eid;
  end if;

  insert into public.goal_event_tags (event_id, tag_id)
  select distinct eid, t from unnest(coalesce(p_tag_ids, '{}')) t;

  insert into public.goal_event_on_court (event_id, player_id)
  select distinct eid, p from unnest(coalesce(p_on_court, '{}')) p;

  update public.matches m
  set our_score   = greatest(coalesce(m.our_score, 0),
                      (select count(*) from public.goal_events e where e.match_id = m.id and e.side = 'for')),
      their_score = greatest(coalesce(m.their_score, 0),
                      (select count(*) from public.goal_events e where e.match_id = m.id and e.side = 'against'))
  where m.id = p_match_id;

  return eid;
end;
$$;

-- ---------------------------------------------------------------------
-- 경기 메모 저장 (잘된 점 / 개선점 / 다음 경기 포인트 전체 교체).
-- p_notes = [{"kind": "good|improve|next_focus", "body": "...", "visibility": "team|coach"}]
-- 계획(plan)·선수 개인 코멘트(player)는 건드리지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.save_match_review(p_match_id uuid, p_notes jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_notes) <> 'array' then
    raise exception '메모 데이터 형식이 잘못됐습니다' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.match_notes
  where match_id = p_match_id and kind in ('good', 'improve', 'next_focus');

  insert into public.match_notes (match_id, kind, body, visibility, sort_order)
  select p_match_id, r.kind, trim(r.body), coalesce(r.visibility, 'coach'), (r.ord - 1)::smallint
  from rows from (jsonb_to_recordset(p_notes) as (kind text, body text, visibility text))
       with ordinality as r (kind, body, visibility, ord)
  where r.kind in ('good', 'improve', 'next_focus')
    and length(trim(coalesce(r.body, ''))) > 0
  order by r.ord;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- =====================================================================
-- 집계 뷰 추가 (security_invoker → RLS 그대로)
-- =====================================================================

-- 선수가 코트 위에 있을 때 득실 (필드 플레이어 기준). 골은 안 넣어도
-- 수비·연결로 팀에 기여하는 선수가 보인다.
create view public.player_on_court_stats
with (security_invoker = true)
as
select
  m.season_id,
  o.player_id,
  p.name,
  count(*) filter (where e.side = 'for')     as on_court_for,
  count(*) filter (where e.side = 'against') as on_court_against,
  count(*) filter (where e.side = 'for') - count(*) filter (where e.side = 'against') as on_court_diff,
  count(*) as events
from public.goal_event_on_court o
join public.goal_events e on e.id = o.event_id
join public.matches m on m.id = e.match_id and m.status = 'finished'
join public.players p on p.id = o.player_id
group by m.season_id, o.player_id, p.name;

-- 두 명 조합 득실. 7명 팀에서 4명 조합은 표본이 금방 쪼개지므로,
-- "누구와 누가 같이 있을 때"를 보는 데는 두 명 조합이 더 빨리 의미가 생긴다.
create view public.pair_goal_diff
with (security_invoker = true)
as
select
  m.season_id,
  a.player_id as player_a,
  b.player_id as player_b,
  count(*) filter (where e.side = 'for')     as goals_for,
  count(*) filter (where e.side = 'against') as goals_against,
  count(*) filter (where e.side = 'for') - count(*) filter (where e.side = 'against') as goal_diff,
  count(*) as events
from public.goal_event_on_court a
join public.goal_event_on_court b on b.event_id = a.event_id and a.player_id < b.player_id
join public.goal_events e on e.id = a.event_id
join public.matches m on m.id = e.match_id and m.status = 'finished'
group by m.season_id, a.player_id, b.player_id;

-- 선수 × 경기 기록. 3주차 선수 페이지의 "본인 성장 추이"가 이 뷰를 경기 순서대로 읽는다.
create view public.player_match_log
with (security_invoker = true)
as
select
  m.season_id,
  m.id as match_id,
  m.played_on,
  m.opponent,
  a.player_id,
  a.status,
  a.membership,
  (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'for' and e.scorer_id = a.player_id)  as goals,
  (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'for' and e.assist_id = a.player_id)  as assists,
  (select count(*) from public.goal_event_on_court o join public.goal_events e on e.id = o.event_id
    where e.match_id = m.id and o.player_id = a.player_id and e.side = 'for')     as on_court_for,
  (select count(*) from public.goal_event_on_court o join public.goal_events e on e.id = o.event_id
    where e.match_id = m.id and o.player_id = a.player_id and e.side = 'against') as on_court_against,
  (select count(*) from public.goal_events e
    where e.match_id = m.id and e.side = 'against' and e.goalkeeper_id = a.player_id) as conceded_as_gk
from public.match_attendance a
join public.matches m on m.id = a.match_id and m.status = 'finished';

-- =====================================================================
-- 권한: 새 뷰는 authenticated만 읽고, 함수는 authenticated만 호출한다.
-- (1차 마이그레이션의 grant는 그때 있던 테이블에만 적용됐다)
-- =====================================================================
revoke all on public.player_on_court_stats, public.pair_goal_diff, public.player_match_log from anon;
grant select on public.player_on_court_stats, public.pair_goal_diff, public.player_match_log to authenticated;

revoke all on function public.ensure_season_for(date) from public, anon;
revoke all on function public.previous_attendance(uuid) from public, anon;
revoke all on function public.set_attendance(uuid, jsonb) from public, anon;
revoke all on function public.save_goal_event(uuid, text, uuid, uuid, boolean, uuid, smallint[], uuid[], text, uuid) from public, anon;
revoke all on function public.save_match_review(uuid, jsonb) from public, anon;

grant execute on function public.ensure_season_for(date) to authenticated;
grant execute on function public.previous_attendance(uuid) to authenticated;
grant execute on function public.set_attendance(uuid, jsonb) to authenticated;
grant execute on function public.save_goal_event(uuid, text, uuid, uuid, boolean, uuid, smallint[], uuid[], text, uuid) to authenticated;
grant execute on function public.save_match_review(uuid, jsonb) to authenticated;
