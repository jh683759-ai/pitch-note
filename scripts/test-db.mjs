// DB 마이그레이션 테스트 (PGlite: 브라우저/Node에서 도는 진짜 PostgreSQL)
// Supabase의 auth 스키마와 역할을 흉내 낸 뒤 마이그레이션을 적용하고
// RLS·무결성 트리거·집계 뷰를 검증한다. Docker 없이 CI에서 돈다.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const MIG_DIR = new URL("../supabase/migrations/", import.meta.url);

// --- Supabase 환경 흉내 ---------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- 기본 권한(default privileges)은 주지 않는다: 마이그레이션이 직접 GRANT 하는지 검증
`);

for (const f of (await readdir(MIG_DIR)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(new URL(f, MIG_DIR), "utf8"));
  console.log(`applied ${f}`);
}

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const STRANGER = "00000000-0000-0000-0000-0000000057a1";
await db.exec(`
  insert into auth.users values ('${COACH}', 'coach@example.com'), ('${STRANGER}', 'x@example.com');
  insert into public.coaches values ('${COACH}', '감독');
`);

async function as(role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);
async function rejects(promise, pattern, name) {
  await assert.rejects(promise, (e) => pattern.test(e.message), name);
  console.log(`  ok  ${name}`);
}
function ok(name) {
  console.log(`  ok  ${name}`);
}

// --- 1. RLS ----------------------------------------------------------------
console.log("RLS");
await as("anon", null, () => rejects(q("select * from players"), /permission denied/, "anon은 선수 테이블을 못 읽는다"));
await as("anon", null, () => rejects(q("select * from player_season_stats"), /permission denied/, "anon은 집계 뷰도 못 읽는다"));
await as("anon", null, () => rejects(q("select * from match_notes"), /permission denied/, "anon은 경기 메모를 직접 못 읽는다"));
await as("authenticated", STRANGER, async () => {
  await rejects(q("insert into players (name) values ('침입자')"), /row-level security/, "감독이 아닌 로그인 사용자는 쓸 수 없다");
  assert.equal((await q("select * from event_tags")).length, 0);
  ok("감독이 아닌 로그인 사용자는 태그도 안 보인다");
});

// --- 2. 감독 시나리오 --------------------------------------------------------
console.log("감독 입력 시나리오");
const ids = await as("authenticated", COACH, async () => {
  const [season] = await q(`insert into seasons (name, starts_on, ends_on) values ('2026', '2026-01-01', '2026-12-31') returning id`);
  const players = {};
  for (const [name, no, pos, mem] of [
    ["GK", 1, "GK", "regular"], ["A", 4, "FIXO", "regular"], ["B", 7, "ALA", "regular"],
    ["C", 11, "ALA", "regular"], ["D", 9, "PIVO", "regular"], ["E", 10, "ALA", "regular"],
    ["G", 99, "PIVO", "guest"],
  ]) {
    const [p] = await q(`insert into players (name, jersey_number, main_position, membership) values ($1,$2,$3,$4) returning id`, [name, no, pos, mem]);
    players[name] = p.id;
  }
  ok("감독은 선수를 추가할 수 있다");

  await rejects(q(`insert into players (name, jersey_number) values ('중복', 4)`), /duplicate key/, "활동 중인 고정 멤버끼리 등번호 중복 불가");
  await q(`insert into players (name, jersey_number, membership) values ('용병중복', 4, 'guest')`);
  ok("용병은 등번호가 겹쳐도 된다");

  await rejects(q(`insert into matches (season_id, played_on, opponent, status) values ($1, '2026-11-22', '스코어없음', 'finished')`, [season.id]), /check constraint/, "끝난 경기는 스코어가 필수");

  const [m] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score)
    values ($1, '2026-11-22', '청년부B', 3, 2) returning id`, [season.id]);

  for (const n of ["GK", "A", "B", "C", "D", "G"]) {
    await q(`insert into match_attendance (match_id, player_id) values ($1, $2)`, [m.id, players[n]]);
  }
  await q(`insert into match_attendance (match_id, player_id, status) values ($1, $2, 'absent')`, [m.id, players.E]);
  const [g] = await q(`select membership from match_attendance where player_id = $1`, [players.G]);
  assert.equal(g.membership, "guest");
  ok("출석 당일 신분(고정/용병)이 자동으로 채워진다");

  const tag = async (kind, code) => (await q(`select id from event_tags where kind=$1 and code=$2`, [kind, code]))[0].id;
  const addEvent = async (side, seq, scorer, assist, court) => {
    const [e] = await q(`insert into goal_events (match_id, side, seq, scorer_id, assist_id, goalkeeper_id) values ($1,$2,$3,$4,$5,$6) returning id`,
      [m.id, side, seq, scorer && players[scorer], assist && players[assist], players.GK]);
    for (const n of court) await q(`insert into goal_event_on_court values ($1, $2)`, [e.id, players[n]]);
    return e.id;
  };
  const line = ["A", "B", "C", "D"];
  const e1 = await addEvent("for", 1, "D", "B", line);
  await q(`insert into goal_event_tags values ($1, $2)`, [e1, await tag("goal_type", "counter")]);
  await q(`insert into goal_event_tags values ($1, $2)`, [e1, await tag("goal_type", "solo")]);
  ok("한 골에 태그 여러 개 (역습 + 개인 돌파)");
  await addEvent("for", 2, "B", null, line);
  await addEvent("for", 3, "G", "D", ["A", "G", "C", "D"]);
  const c1 = await addEvent("against", 4, null, null, line);
  await q(`insert into goal_event_tags values ($1, $2)`, [c1, await tag("concede_cause", "transition")]);

  await rejects(q(`insert into goal_event_tags values ($1, $2)`, [c1, await tag("goal_type", "counter")]), /태그 종류/, "실점에 득점 유형 태그는 못 붙인다");
  await rejects(q(`insert into goal_event_on_court values ($1, $2)`, [c1, players.G]), /최대 4명/, "코트 위 필드 플레이어는 최대 4명");
  await rejects(q(`insert into goal_events (match_id, side, seq, scorer_id) values ($1, 'for', 9, $2)`, [m.id, players.E]), /출전 명단/, "불참한 선수는 득점자가 될 수 없다");
  await rejects(q(`insert into goal_events (match_id, side, seq, scorer_id) values ($1, 'against', 9, $2)`, [m.id, players.A]), /check constraint/, "실점 이벤트에는 우리 득점자가 없다");

  // 경기 메모: 공개 범위
  await q(`insert into match_notes (match_id, kind, body, visibility) values
    ($1, 'good', '전방 압박으로 2골', 'team'),
    ($1, 'improve', '전환 수비 늦음', 'team'),
    ($1, 'next_focus', '공 뺏기면 3초 안에 압박', 'team'),
    ($1, 'next_focus', '킥인 약속 2개', 'team'),
    ($1, 'plan', '상대 7번 마크', 'coach')`, [m.id]);
  const [n] = await q(`insert into match_notes (match_id, kind, body) values ($1, 'improve', '감독만 볼 메모') returning visibility`, [m.id]);
  assert.equal(n.visibility, "coach");
  ok("메모 공개 범위 기본값은 감독만(coach)");
  await q(`insert into match_notes (match_id, kind, body, visibility) values ($1, 'next_focus', '세 번째 포인트', 'team')`, [m.id]);
  await rejects(q(`insert into match_notes (match_id, kind, body, visibility) values ($1, 'next_focus', '네 번째', 'team')`, [m.id]), /3개까지/, "다음 경기 포인트는 3개까지");
  await rejects(q(`insert into match_notes (match_id, kind, player_id, body, visibility) values ($1, 'player', $2, '수비 위치 좋아짐', 'team')`, [m.id, players.A]), /check constraint/, "선수 개인 코멘트는 공개할 수 없다");
  await q(`insert into match_notes (match_id, kind, player_id, body) values ($1, 'player', $2, '수비 위치 좋아짐')`, [m.id, players.A]);
  await rejects(q(`insert into match_notes (match_id, kind, body) values ($1, 'player', '선수 없음')`, [m.id]), /check constraint/, "선수 코멘트에는 선수가 있어야 한다");
  ok("선수 개인 코멘트는 감독만 보는 메모로 저장");

  await rejects(q(`delete from players where id = $1`, [players.D]), /foreign key/, "기록이 있는 선수는 삭제되지 않는다 (보관만)");
  return { season: season.id, players, match: m.id };
});

// --- 3. 집계 뷰 ---------------------------------------------------------------
console.log("집계 뷰");
await as("authenticated", COACH, async () => {
  const [ms] = await q(`select * from match_summary where match_id = $1`, [ids.match]);
  assert.equal(ms.result, "W");
  assert.equal(Number(ms.players_played), 6);
  assert.equal(Number(ms.guests_played), 1);
  assert.equal(Number(ms.events_missing), 1); // 3-2인데 실점은 1개만 적음
  ok("경기 요약: 결과 W, 출전 6명(용병 1), 덜 적힌 이벤트 1개");

  const stats = Object.fromEntries((await q(`select * from player_season_stats`)).map((r) => [r.name, r]));
  assert.equal(Number(stats.D.goals), 1);
  assert.equal(Number(stats.D.assists), 1);
  assert.equal(Number(stats.D.attack_points), 2);
  assert.equal(Number(stats.E.appearances), 0);
  assert.equal(Number(stats.E.attendance_rate), 0);
  assert.equal(Number(stats.D.attendance_rate), 1);
  assert.equal(stats.G.attendance_rate, null);
  ok("선수 통계: 골·어시스트·공격포인트·출석률(용병은 출석률 없음)");

  const lines = await q(`select * from lineup_goal_diff order by events desc`);
  assert.equal(lines.length, 2);
  assert.equal(Number(lines[0].goals_for), 2);
  assert.equal(Number(lines[0].goals_against), 1);
  ok("라인 조합 득실: A·B·C·D 조합 +2 / -1");

  const tags = await q(`select code, events from tag_counts order by code`);
  assert.deepEqual(tags.map((t) => t.code), ["counter", "solo", "transition"]);
  ok("태그 집계");
});

// --- 4. 2주차: 경기 입력 함수 -------------------------------------------------
console.log("경기 입력 함수 (2주차)");
const m2 = await as("authenticated", COACH, async () => {
  const P = ids.players;
  const rpc = (fn, args) => q(`select * from ${fn}`, args);

  // 시즌 자동 선택/생성
  const [{ ensure_season_for: s2026 }] = await q(`select ensure_season_for('2026-12-06')`);
  assert.equal(s2026, ids.season);
  const [{ ensure_season_for: s2027 }] = await q(`select ensure_season_for('2027-01-10')`);
  const [s27] = await q(`select name from seasons where id = $1`, [s2027]);
  assert.equal(s27.name, "2027 시즌");
  const [{ ensure_season_for: again }] = await q(`select ensure_season_for('2027-03-01')`);
  assert.equal(again, s2027);
  ok("경기 날짜로 시즌을 찾고, 없으면 그 해 시즌을 만든다");

  const [m] = await q(`insert into matches (season_id, played_on, opponent, our_score, their_score)
    values ($1, '2026-12-06', '장년부', 0, 0) returning id`, [ids.season]);

  // 지난 명단 복사: 직전 경기의 출석 (보관 선수 제외)
  await q(`update players set is_active = false where id = $1`, [P.C]);
  const prev = await rpc(`previous_attendance($1)`, [m.id]);
  const prevMap = Object.fromEntries(prev.map((r) => [r.player_id, r.status]));
  assert.equal(prev.length, 6); // 7명 중 보관한 C 제외
  assert.equal(prevMap[P.E], "absent");
  assert.equal(prevMap[P.C], undefined);
  assert.equal(prev[0].source_opponent, "청년부B");
  ok("지난 경기 명단 복사: 직전 경기 출석, 보관 선수는 빠짐");
  await q(`update players set is_active = true where id = $1`, [P.C]);
  assert.equal((await rpc(`previous_attendance($1)`, [ids.match])).length, 0);
  ok("첫 경기는 복사할 명단이 없다");

  // 출석 저장 (전체 교체)
  const rows = (o) => JSON.stringify(Object.entries(o).map(([n, status]) => ({ player_id: P[n], status })));
  await q(`select set_attendance($1, $2::jsonb)`, [m.id, rows({ GK: "played", A: "played", B: "played", C: "played", D: "played", E: "bench", G: "absent" })]);
  await q(`select set_attendance($1, $2::jsonb)`, [m.id, rows({ GK: "played", A: "played", B: "played", C: "played", D: "played", E: "played" })]);
  const att = await q(`select player_id, status, membership from match_attendance where match_id = $1`, [m.id]);
  assert.equal(att.length, 6);
  assert.ok(att.every((a) => a.status === "played"));
  ok("출석 저장은 전체 교체 (목록에서 빠진 용병은 명단에서 제외)");

  // 골 이벤트: 한 번에 저장 + 스코어 자동 증가
  const tagId = async (kind, code) => (await q(`select id from event_tags where kind=$1 and code=$2`, [kind, code]))[0].id;
  const save = (o) => q(`select save_goal_event(
      p_match_id => $1, p_side => $2, p_scorer_id => $3, p_assist_id => $4, p_is_own_goal => $5,
      p_goalkeeper_id => $6, p_tag_ids => $7::smallint[], p_on_court => $8::uuid[], p_note => $9, p_event_id => $10) as id`,
    [m.id, o.side, o.scorer ?? null, o.assist ?? null, o.own ?? false, o.gk ?? P.GK, o.tags ?? [], o.court ?? [], o.note ?? null, o.id ?? null])
    .then((r) => r[0].id);
  const court = [P.A, P.B, P.C, P.D];
  const g1 = await save({ side: "for", scorer: P.D, assist: P.B, tags: [await tagId("goal_type", "build_up")], court });
  const g2 = await save({ side: "for", scorer: P.B, tags: [await tagId("goal_type", "counter")], court: [P.A, P.B, P.E, P.D] });
  const c1 = await save({ side: "against", tags: [await tagId("concede_cause", "lost_marking")], court });
  const evs = await q(`select id, seq from goal_events where match_id = $1 order by seq`, [m.id]);
  assert.deepEqual(evs.map((e) => e.seq), [1, 2, 3]);
  let [score] = await q(`select our_score, their_score from matches where id = $1`, [m.id]);
  assert.deepEqual([score.our_score, score.their_score], [2, 1]);
  ok("골·실점 저장: 순서 자동, 태그·코트 위 4명 한 번에, 스코어 자동 증가");

  // 고치기: 태그·코트 위 명단 교체
  await save({ id: g1, side: "for", scorer: P.D, assist: P.A, tags: [await tagId("goal_type", "counter"), await tagId("goal_type", "solo")], court });
  const g1tags = await q(`select t.code from goal_event_tags gt join event_tags t on t.id = gt.tag_id where event_id = $1 order by code`, [g1]);
  assert.deepEqual(g1tags.map((t) => t.code), ["counter", "solo"]);
  const [g1row] = await q(`select assist_id, seq from goal_events where id = $1`, [g1]);
  assert.equal(g1row.assist_id, P.A);
  assert.equal(g1row.seq, 1);
  ok("기록 고치기: 순서는 유지, 태그는 교체");

  // 실패하면 반쪽 기록이 남지 않는다 (트랜잭션)
  const before = (await q(`select count(*)::int as n from goal_events where match_id = $1`, [m.id]))[0].n;
  await rejects(save({ side: "for", scorer: P.D, court: [P.A, P.B, P.C, P.D, P.E] }), /최대 4명/, "코트 위 5명이면 저장 거부");
  await rejects(save({ side: "against", tags: [await tagId("goal_type", "solo")], court }), /태그 종류/, "실점에 득점 유형 태그면 저장 거부");
  const after = (await q(`select count(*)::int as n from goal_events where match_id = $1`, [m.id]))[0].n;
  assert.equal(after, before);
  ok("저장이 실패하면 이벤트도 남지 않는다 (한 트랜잭션)");
  await rejects(save({ id: ids.match, side: "for" }), /찾을 수 없어요/, "다른 경기의 기록 id로는 고칠 수 없다");

  // 기록에 있는 선수는 출전에서 못 뺀다
  await rejects(q(`select set_attendance($1, $2::jsonb)`, [m.id, rows({ GK: "played", A: "played", B: "played", C: "played", D: "bench", E: "played" })]),
    /출전에서 뺄 수 없어요: D/, "골 기록에 있는 선수는 출전에서 뺄 수 없다");

  // 스코어는 기록보다 크게 직접 둘 수 있다 (다 못 적은 골)
  await q(`update matches set our_score = 4 where id = $1`, [m.id]);
  await save({ side: "for", scorer: P.E, court: [P.A, P.E, P.C, P.D] });
  [score] = await q(`select our_score from matches where id = $1`, [m.id]);
  assert.equal(score.our_score, 4);
  ok("감독이 적은 스코어가 기록 수보다 크면 그대로 둔다");

  // 경기 메모 (전체 교체, 다음 경기 포인트 3개 제한 유지)
  const notes = (arr) => JSON.stringify(arr.map(([kind, body, visibility]) => ({ kind, body, visibility })));
  await q(`select save_match_review($1, $2::jsonb)`, [m.id, notes([["good", "빌드업 2골", "team"], ["improve", "세컨볼", "coach"], ["next_focus", "킥인 약속", "team"], ["next_focus", "  ", "team"]])]);
  await q(`insert into match_notes (match_id, kind, player_id, body) values ($1, 'player', $2, '개인 코멘트')`, [m.id, P.A]);
  await q(`select save_match_review($1, $2::jsonb)`, [m.id, notes([["good", "빌드업 2골", "team"], ["next_focus", "a", "team"], ["next_focus", "b", "coach"]])]);
  const ns = await q(`select kind, body, visibility from match_notes where match_id = $1 order by kind, sort_order`, [m.id]);
  assert.deepEqual(ns.map((n) => `${n.kind}:${n.body}:${n.visibility}`), ["good:빌드업 2골:team", "next_focus:a:team", "next_focus:b:coach", "player:개인 코멘트:coach"]);
  ok("경기 메모 저장: 전체 교체, 빈 줄 무시, 선수 개인 코멘트는 유지");
  await rejects(q(`select save_match_review($1, $2::jsonb)`, [m.id, notes([["next_focus", "1"], ["next_focus", "2"], ["next_focus", "3"], ["next_focus", "4"]])]), /3개까지/, "메모 저장도 다음 경기 포인트 3개 제한");
  const [{ n: keep }] = await q(`select count(*)::int as n from match_notes where match_id = $1`, [m.id]);
  assert.equal(keep, 4);
  ok("메모 저장이 실패하면 기존 메모가 그대로 남는다");

  return { match: m.id, g1, g2, c1 };
});

// --- 5. 2주차: 집계 뷰 --------------------------------------------------------
console.log("집계 뷰 (2주차)");
await as("authenticated", COACH, async () => {
  const P = ids.players;
  const name = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]));

  // 1경기: A·B·C·D 코트 위 for 2, against 1 / A·G·C·D for 1
  // 2경기: A·B·C·D for 1(g1), against 1(c1) / A·B·E·D for 1(g2) / A·E·C·D for 1 (스코어만 4로 올린 골은 기록 없음)
  const oc = Object.fromEntries((await q(`select * from player_on_court_stats where season_id = $1`, [ids.season])).map((r) => [name[r.player_id], r]));
  assert.equal(Number(oc.A.on_court_for), 6);
  assert.equal(Number(oc.A.on_court_against), 2);
  assert.equal(Number(oc.A.on_court_diff), 4);
  assert.equal(Number(oc.B.on_court_for), 4);
  assert.equal(Number(oc.E.on_court_for), 2);
  assert.equal(oc.GK, undefined); // GK는 필드 4명에 없다
  ok("선수별 코트 위 득실 (+/-): A +6/-2, GK는 필드 집계에서 빠짐");

  const pairs = await q(`select * from pair_goal_diff where season_id = $1`, [ids.season]);
  const pair = (x, y) => pairs.find((p) => [p.player_a, p.player_b].sort().join() === [P[x], P[y]].sort().join());
  assert.equal(Number(pair("A", "D").goals_for), 6);
  assert.equal(Number(pair("A", "D").goals_against), 2);
  assert.equal(Number(pair("B", "E").events), 1);
  assert.ok(pairs.every((p) => p.player_a < p.player_b));
  ok("두 명 조합 득실: 같은 쌍은 한 줄로 (A·D +6/-2)");

  const log = await q(`select * from player_match_log where player_id = $1 order by played_on`, [P.D]);
  assert.equal(log.length, 2);
  assert.deepEqual(log.map((l) => [Number(l.goals), Number(l.assists)]), [[1, 1], [1, 0]]);
  assert.deepEqual(log.map((l) => [Number(l.on_court_for), Number(l.on_court_against)]), [[3, 1], [3, 1]]);
  const [gk] = await q(`select conceded_as_gk from player_match_log where player_id = $1 and match_id = $2`, [P.GK, m2.match]);
  assert.equal(Number(gk.conceded_as_gk), 1);
  ok("선수 × 경기 기록 (성장 추이용): 경기별 골·어시스트·코트 위 득실·GK 실점");

  const stats = Object.fromEntries((await q(`select * from player_season_stats where season_id = $1`, [ids.season])).map((r) => [r.name, r]));
  assert.equal(Number(stats.D.goals), 2);
  assert.equal(Number(stats.E.attendance_rate), 0.5);
  ok("시즌 통계가 2경기를 합친다 (E 출석률 1/2)");
});

await as("anon", null, async () => {
  await rejects(q("select * from player_match_log"), /permission denied/, "anon은 새 집계 뷰도 못 읽는다");
  await rejects(q(`select save_goal_event($1, 'for')`, [m2.match]), /permission denied/, "anon은 입력 함수를 호출할 수 없다");
});
await as("authenticated", STRANGER, async () => {
  await rejects(q(`select save_goal_event($1, 'for')`, [m2.match]), /row-level security|찾을 수|violates/, "감독이 아니면 입력 함수로도 쓸 수 없다");
  assert.equal((await q(`select * from previous_attendance($1)`, [m2.match])).length, 0);
  ok("감독이 아니면 지난 명단도 안 보인다");
});

console.log("\nall DB tests passed");
