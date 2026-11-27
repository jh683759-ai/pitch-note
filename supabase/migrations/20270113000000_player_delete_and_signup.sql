-- =====================================================================
-- 선수 완전 삭제(기록까지) + 선수 가입 신청을 새 선수로 바로 등록
--
-- 1) delete_player_with_records: 테스트로 만든 선수처럼, 경기 기록이 있어도
--    감독이 지우고 싶은 경우. 보관과 달리 되돌릴 수 없다.
--    - 감독만 (is_coach). 화면 확인과 별개로 선수 이름을 정확히 받아야 실행된다.
--    - 지우는 것: 출석, 코트 위 4명, 감독의 선수 코멘트, 선수 노트·연습·참석 응답(cascade)
--    - 남기는 것: 골·실점 이벤트와 스코어. 득점자·도움·GK 칸만 비운다
--      (팀 기록은 그대로, 그 선수 이름만 빠진다). MVP였던 경기는 MVP를 비운다.
--    - 선수 계정이 연결돼 있으면 계정은 지우지 않고 '승인 대기'로 되돌린다.
-- 2) approve_player_as_new: 선수 신청이 명단에 없는 사람이면 신청 정보로
--    새 선수를 만들고 연결·승인까지 한 번에 (중간에 실패하면 둘 다 취소).
-- 추가형: 기존 데이터는 바꾸지 않는다.
-- =====================================================================

create or replace function public.delete_player_with_records(p_player_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_coach() then
    raise exception '감독만 할 수 있어요' using errcode = '42501';
  end if;

  select p.name into v_name from public.players p where p.id = p_player_id for update;
  if v_name is null then
    raise exception '선수를 찾을 수 없어요' using errcode = 'no_data_found';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> trim(v_name) then
    raise exception '선수 이름이 맞지 않아요' using errcode = 'check_violation';
  end if;

  update public.matches set mvp_player_id = null where mvp_player_id = p_player_id;

  update public.goal_events
  set scorer_id     = nullif(scorer_id, p_player_id),
      assist_id     = nullif(assist_id, p_player_id),
      goalkeeper_id = nullif(goalkeeper_id, p_player_id)
  where p_player_id in (scorer_id, assist_id, goalkeeper_id);

  delete from public.goal_event_on_court where player_id = p_player_id;
  delete from public.match_notes where player_id = p_player_id;
  delete from public.match_attendance where player_id = p_player_id;

  update public.members
  set status = 'pending', player_id = null, approved_at = null, approved_by = null
  where player_id = p_player_id;

  delete from public.players where id = p_player_id;
end;
$$;

comment on function public.delete_player_with_records(uuid, text) is
  '감독 전용. 선수와 그 선수의 기록을 지운다. 골·스코어는 남기고 이름 칸만 비운다. 되돌릴 수 없음.';

create or replace function public.approve_player_as_new(p_user_id uuid, p_name text, p_membership text default 'regular')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_player uuid;
begin
  if not public.is_coach() then
    raise exception '감독만 할 수 있어요' using errcode = '42501';
  end if;

  select * into v_member from public.members m where m.user_id = p_user_id for update;
  if v_member.user_id is null or v_member.status <> 'pending' then
    raise exception '승인 대기 중인 신청이 아니에요' using errcode = 'check_violation';
  end if;

  insert into public.players (name, membership, joined_on)
  values (
    left(trim(coalesce(nullif(trim(p_name), ''), v_member.display_name)), 30),
    case when p_membership = 'guest' then 'guest' else 'regular' end,
    (now() at time zone 'Asia/Seoul')::date
  )
  returning id into v_player;

  update public.members
  set status = 'player', player_id = v_player, approved_at = now(), approved_by = (select auth.uid())
  where user_id = p_user_id;

  return v_player;
end;
$$;

comment on function public.approve_player_as_new(uuid, text, text) is
  '감독 전용. 선수 가입 신청으로 새 선수를 만들고 그 계정과 연결해 승인한다.';

revoke all on function public.delete_player_with_records(uuid, text) from public, anon;
revoke all on function public.approve_player_as_new(uuid, text, text) from public, anon;
grant execute on function public.delete_player_with_records(uuid, text) to authenticated;
grant execute on function public.approve_player_as_new(uuid, text, text) to authenticated;
