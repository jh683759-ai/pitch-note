import type { Database } from "@/lib/database.types";

export type Player = Database["public"]["Tables"]["players"]["Row"];

export const POSITIONS = [
  { value: "GK", label: "GK", hint: "골레이로" },
  { value: "FIXO", label: "픽소", hint: "수비" },
  { value: "ALA", label: "아라", hint: "측면" },
  { value: "PIVO", label: "피보", hint: "최전방" },
] as const;

export type Position = (typeof POSITIONS)[number]["value"];

export const MEMBERSHIPS = [
  { value: "regular", label: "고정" },
  { value: "guest", label: "용병" },
] as const;

export type Membership = (typeof MEMBERSHIPS)[number]["value"];

export function positionLabel(value: string | null) {
  return POSITIONS.find((p) => p.value === value)?.label ?? "포지션 없음";
}

export function membershipLabel(value: string) {
  return MEMBERSHIPS.find((m) => m.value === value)?.label ?? value;
}

export type PlayerInput = {
  name: string;
  jersey_number: number | null;
  main_position: Position | null;
  membership: Membership;
  coach_note: string | null;
};

export type ParseResult = { ok: true; value: PlayerInput } | { ok: false; error: string };

// 폼 입력 검증. DB 제약(check)과 같은 규칙을 화면에서 먼저 알려준다.
export function parsePlayerForm(form: FormData): ParseResult {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "이름을 입력하세요." };
  if (name.length > 30) return { ok: false, error: "이름은 30자 이내로 입력하세요." };

  const rawNumber = String(form.get("jersey_number") ?? "").trim();
  let jersey_number: number | null = null;
  if (rawNumber) {
    if (!/^\d{1,2}$/.test(rawNumber)) return { ok: false, error: "등번호는 0~99 사이 숫자예요." };
    jersey_number = Number(rawNumber);
  }

  const rawPosition = String(form.get("main_position") ?? "");
  const main_position = POSITIONS.some((p) => p.value === rawPosition) ? (rawPosition as Position) : null;

  const rawMembership = String(form.get("membership") ?? "regular");
  if (!MEMBERSHIPS.some((m) => m.value === rawMembership)) {
    return { ok: false, error: "고정/용병을 선택하세요." };
  }

  const note = String(form.get("coach_note") ?? "").trim();
  if (note.length > 500) return { ok: false, error: "메모는 500자 이내로 입력하세요." };

  return {
    ok: true,
    value: {
      name,
      jersey_number,
      main_position,
      membership: rawMembership as Membership,
      coach_note: note || null,
    },
  };
}

// Postgres 오류를 감독이 이해할 수 있는 말로 바꾼다.
export function friendlyDbError(error: { code?: string; message: string }) {
  if (error.code === "23505") return "같은 등번호를 쓰는 고정 멤버가 이미 있어요.";
  if (error.code === "23503") return "경기 기록이 있는 선수라 삭제할 수 없어요. 대신 보관하세요.";
  if (error.code === "42501") return "권한이 없어요. 감독 계정으로 로그인했는지 확인하세요.";
  return `저장하지 못했어요: ${error.message}`;
}
