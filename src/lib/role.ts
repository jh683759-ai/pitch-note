import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** coach=감독, recorder=기록원, player=선수 계정(둘 다 감독이 승인), pending=승인 대기, none=권한 없음 */
export type Role = "coach" | "recorder" | "player" | "pending" | "none";

/** 지금 로그인한 사람의 역할. 한 요청 안에서는 한 번만 묻는다. */
export const getRole = cache(async (): Promise<Role> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_role");
  if (error) return "none";
  return (["coach", "recorder", "player", "pending"].includes(data) ? data : "none") as Role;
});

/** 감독만 쓰는 화면. 기록원이 주소로 들어오면 홈으로 보낸다. (DB도 RLS로 막혀 있다) */
export async function requireCoach() {
  if ((await getRole()) !== "coach") redirect("/coach");
}

/** 기록한 사람 id → 이름 (감독·기록원) */
export async function staffNames() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_names");
  return new Map((data ?? []).map((s) => [s.user_id, s.display_name]));
}
