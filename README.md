# pitch-note

아마추어 풋살팀 감독을 위한 경기 기록 사이트. **많이 모으고, 지금 필요한 것만 본다.**

경기 후 5분 입력으로 출석, 득점 유형, 실점 원인, 골·실점 순간 코트 위 4명까지 남기고, 화면에는 "지금 상황과 다음 할 일"만 보여줍니다. 선수 페이지는 순위보다 본인의 성장 추이를 먼저 보여줍니다.

- 프론트: Next.js 15 (App Router, TypeScript, Tailwind) — 모바일 웹
- 백엔드: Supabase (PostgreSQL, Auth, RLS)
- CI: GitHub Actions (lint · typecheck · build · DB 테스트)

## 진행 상황 (4주 MVP)

| 주차 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 전체 데이터 모델, 감독 로그인, 선수 관리 | ✅ |
| 2 | 경기 입력(출석·명단 복사·골/실점 태그·코트 위 4명·메모), 집계 뷰 추가 | ✅ |
| 3 | 감독 홈(다음 할 일·신호·시즌), 선수 성장 페이지, 경기 MVP, 선수용 공유 링크, 카톡 미리보기 | ✅ |
| 4 | 실경기 입력, 다음 훈련 메모, 배포, README 정리 | |

## 데이터 모델

```
coaches ── auth.users          (감독만 쓰기)
players                         (고정/용병, 보관)
seasons ─< matches              (날짜, 상대, 스코어, 영상 링크)
matches ─< match_notes          (경기 전 계획 / 잘된 점 / 개선점 / 다음 경기 포인트 ≤3 / 선수 개인 코멘트, 메모마다 공개 범위)
matches ─< match_attendance >─ players     (출전/벤치/불참 + 당일 고정/용병)
matches ─< goal_events                     (우리 골 / 실점, 득점자·어시스트·GK)
goal_events ─< goal_event_tags >─ event_tags   (득점 유형 / 실점 원인, 바꿀 수 있는 태그)
goal_events ─< goal_event_on_court >─ players  (그 순간 코트 위 필드 4명)
share_links                     (선수용 읽기 전용 링크 토큰)
```

집계 뷰 (`security_invoker`, RLS 그대로 적용)

| 뷰 | 답하는 질문 |
| --- | --- |
| `match_summary` | 경기 결과, 출전 인원, 스코어보다 덜 적힌 골 수 |
| `player_season_stats` | 선수별 출전·골·어시스트·출석률(고정 멤버 기준) |
| `player_on_court_stats` | 이 선수가 코트에 있을 때 득실(+/-). 골은 없어도 팀에 기여하는 선수 |
| `lineup_goal_diff` | 필드 4명 조합별 득실 |
| `pair_goal_diff` | 두 명 조합별 득실. 7명 팀에서는 4명 조합보다 빨리 의미가 생긴다 |
| `player_match_log` | 선수 × 경기 기록. 3주차 "본인 성장 추이"의 원천 |
| `tag_counts` | 득점 유형·실점 원인 분포 |

입력 함수 (한 번 호출 = 한 트랜잭션, `security invoker`)

| 함수 | 하는 일 |
| --- | --- |
| `ensure_season_for(date)` | 경기 날짜의 시즌을 찾고, 없으면 그 해 시즌을 만든다 |
| `previous_attendance(match)` | 지난 경기 명단 (보관 선수 제외) |
| `set_attendance(match, rows)` | 출석 전체 교체. 골·실점 기록에 있는 선수는 출전에서 못 뺀다 |
| `save_goal_event(...)` | 골/실점 + 태그 + 코트 위 4명을 한 번에 저장·수정. 기록이 스코어보다 많아지면 스코어를 올린다 |
| `save_match_review(match, notes, mvp)` | 잘된 점·개선점·다음 경기 포인트 전체 교체 + MVP (선수 개인 코멘트는 유지) |

### 설계 선택

- **집계값을 저장하지 않는다.** 통계는 원천 테이블에서 뷰로 계산한다. 경기 기록을 고쳐도 숫자가 어긋나지 않는다.
- **태그는 테이블.** 실경기 몇 번 뒤 태그를 바꿀 수 있고, 숨긴 태그의 과거 기록도 남는다.
- **DB가 무결성을 지킨다.** 불참한 선수는 득점자가 될 수 없고, 코트 위 필드 플레이어는 4명까지, 실점에는 득점 유형 태그를 붙일 수 없다(트리거).
- **메모마다 공개 범위.** 경기 리뷰와 다음 경기 포인트는 선수에게 공개(team)할 수 있고, 기본값은 감독만(coach). 선수 개인 코멘트는 항상 감독만.
- **기록은 지우지 않는다.** 기록 있는 선수는 FK가 삭제를 막고, 대신 보관한다.
- **출석의 당일 신분.** 용병이 나중에 고정 멤버가 돼도 그날 기록은 용병으로 남아 출석률이 왜곡되지 않는다.
- **입력은 함수 한 번으로.** 골 하나에 이벤트·태그·코트 위 4명 세 테이블이 바뀐다. 화면에서 나눠 쓰다 중간에 실패하면 반쪽 기록이 남으므로 DB 함수 한 번(트랜잭션)으로 묶었다.
- **스코어는 감독이, 기록은 아는 만큼.** 골을 적으면 스코어가 따라 올라가지만, 기억 안 나는 골이 있으면 스코어만 직접 맞추면 된다. 덜 적힌 수는 화면이 알려준다.
- **RLS.** 로그인 안 한 사용자(anon)는 테이블을 직접 읽지 못한다. 공유 페이지는 토큰을 검사하는 함수로만 연다(3주차).

## 경기 입력 흐름 (경기 후 5분)

1. **경기 정보**: 날짜(오늘), 상대(최근 상대 한 번 탭), 종류
2. **출석**: "지난 경기 명단 복사" 한 번 → 바뀐 사람만 출전/벤치/불참 탭. 처음 온 용병은 이름만 적고 추가
3. **골·실점**: 득점자 → 어시스트 → 태그 → 코트 위 4명. 4명과 GK는 직전 기록에서 미리 채워지고, 득점자·어시스트는 코트 위에 자동으로 들어간다
4. **메모**: 잘된 점, 개선점, 다음 경기 포인트 1~3개. 메모마다 팀 공개/감독만. 지난 경기 포인트를 위에 띄워서 오늘 지켰는지 보며 쓴다

경기 화면은 지금 해야 할 단계 하나만 강조한다.

## 화면 (3주차)

- **감독 홈** `/coach`: 지난 경기에 남은 할 일 하나, 다음 경기 포인트, 켜진 신호만(2경기 연속 불참한 고정 멤버, 최근 3경기 중 2경기 이상 반복된 실점 원인), 시즌 승무패·득실 흐름, 3번 이상 함께 뛴 코트 위 조합의 상위·하위 하나. 신호가 없으면 "특별히 챙길 신호 없음" 한 줄.
- **선수 페이지** `/coach/players/[id]`: 순위 없이 이 선수의 경기별 흐름. 출전 6경기부터 "최근 5경기 vs 그 전 5경기" 경기당 공격포인트.
- **공유 링크** `/s/[token]`: 로그인 없이 읽기 전용. 지난 경기 스코어·MVP, '팀 공개' 메모, 다음 경기 포인트, 선수마다 본인 기록. 팀 링크는 하나만 살아 있고, 새로 만들면 이전 링크는 끊긴다.
- **카톡 미리보기**: 공유 링크의 OG 이미지에 스코어·결과·MVP·다음 경기 포인트 1번. 실제 카톡에서 보려면 배포 후 `NEXT_PUBLIC_SITE_URL` 설정.

공유 화면에 **나가지 않는 것**: '감독만' 메모, 선수 개인 코멘트, 감독의 선수 메모, 실점 원인 태그(누구 탓처럼 읽히지 않게), 불참 기록, 코트 위 실점, 순위. anon은 테이블을 직접 못 읽고 `shared_overview` · `shared_match` · `shared_player` 함수(토큰 검사)만 부를 수 있다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase URL과 anon(publishable) 키 입력
npm run dev
```

## Supabase 처음 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성 (Region: Northeast Asia (Seoul))
2. SQL Editor에서 `supabase/migrations/` 의 SQL을 순서대로 실행 (또는 `npx supabase link` 후 `npx supabase db push`)
3. Authentication → Users → **Add user** 로 감독 계정 생성 (Auto Confirm 체크)
4. Authentication → Sign In / Providers 에서 **Allow new users to sign up 끄기** (감독 외 가입 차단)
5. SQL Editor에서 감독 등록:
   ```sql
   insert into public.coaches (user_id, display_name)
   select id, '감독' from auth.users where email = '감독 이메일';
   ```
6. Project Settings → API 의 URL과 anon(publishable) 키를 `.env.local` 에 입력

## 스크립트

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run lint` / `npm run typecheck` / `npm run build` | 정적 검사와 빌드 |
| `npm run test:db` | PGlite(WASM PostgreSQL)에 마이그레이션 적용 후 RLS·트리거·집계 뷰 테스트 |
| `npm run db:types` | 연결된 Supabase 프로젝트에서 TypeScript 타입 재생성 |
