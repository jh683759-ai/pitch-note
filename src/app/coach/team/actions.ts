"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";

export type MemberState = { error: string | null };

function cleanName(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .slice(0, 20);
}

/** 선수·기록원 신청 (본인). DB 정책이 '승인 대기'로만 넣게 한다. */
export async function requestAccess(_prev: MemberState, form: FormData): Promise<MemberState> {
  const name = cleanName(form.get("display_name"));
  const wants = form.get("wants") === "recorder" ? "recorder" : "player";
  if (!name) return { error: "이름을 입력하세요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "다시 로그인하세요." };
  const { error } = await supabase.from("members").insert({ user_id: user.id, display_name: name, email: user.email ?? null, wants });
  if (error) return { error: "신청하지 못했어요. 잠시 뒤 다시 해 보세요." };
  revalidatePath("/coach", "layout");
  return { error: null };
}

async function coachOnly() {
  return (await getRole()) === "coach" ? null : { error: "감독만 할 수 있어요." };
}

/** 승인: playerId가 있으면 그 선수의 계정, 없으면 기록원이 된다 */
export async function approveMember(userId: string, playerId?: string): Promise<MemberState> {
  const denied = await coachOnly();
  if (denied) return denied;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("members")
    .update({
      status: playerId ? "player" : "recorder",
      player_id: playerId ?? null,
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .eq("user_id", userId);
  if (error) {
    if (error.code === "23505") return { error: "그 선수는 이미 다른 계정과 연결돼 있어요." };
    return { error: "승인하지 못했어요." };
  }
  revalidatePath("/coach/team");
  revalidatePath("/coach");
  return { error: null };
}

/** 명단에 없는 사람의 선수 신청: 신청 정보로 새 선수를 만들고 연결·승인까지 한 번에 */
export async function approveAsNewPlayer(userId: string, name: string, membership: "regular" | "guest"): Promise<MemberState> {
  const denied = await coachOnly();
  if (denied) return denied;
  const clean = name.trim().slice(0, 30);
  if (!clean) return { error: "선수 이름을 입력하세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_player_as_new", { p_user_id: userId, p_name: clean, p_membership: membership });
  if (error) {
    if (error.code === "23514") return { error: "이미 처리된 신청이에요. 새로고침해 보세요." };
    return { error: "등록하지 못했어요." };
  }
  revalidatePath("/coach", "layout");
  return { error: null };
}

/** 거절 또는 권한 빼기. 그 사람이 넣은 경기 기록은 그대로 남는다. */
export async function removeMember(userId: string): Promise<MemberState> {
  const denied = await coachOnly();
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("user_id", userId);
  if (error) return { error: "처리하지 못했어요." };
  revalidatePath("/coach/team");
  revalidatePath("/coach");
  return { error: null };
}
