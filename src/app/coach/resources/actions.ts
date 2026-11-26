"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { POSITIONS } from "@/lib/players";
import { cleanUrl } from "@/lib/prep";

export type ResourceState = { error: string | null; ok?: boolean };

export async function createResource(_prev: ResourceState, form: FormData): Promise<ResourceState> {
  if ((await getRole()) !== "coach") return { error: "감독만 할 수 있어요." };
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const url = cleanUrl(form.get("url"));
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  const target = String(form.get("target") ?? "team");
  if (!title) return { error: "제목을 입력하세요." };
  if (!url) return { error: "링크를 확인하세요. (https://로 시작하는 주소)" };

  let audience: "team" | "position" | "player" = "team";
  let position: string | null = null;
  let player_id: string | null = null;
  if (target.startsWith("pos:")) {
    position = target.slice(4);
    if (!POSITIONS.some((p) => p.value === position)) return { error: "포지션을 다시 고르세요." };
    audience = "position";
  } else if (target.startsWith("player:")) {
    player_id = target.slice(7);
    audience = "player";
  }

  const supabase = await createClient();
  const { error } = await supabase.from("resources").insert({ title, url, note, audience, position, player_id });
  if (error) return { error: "저장하지 못했어요. 잠시 뒤 다시 해 보세요." };
  revalidatePath("/coach/resources");
  revalidatePath("/coach/players");
  return { error: null, ok: true };
}

/** 내리기: 선수 화면에서 빠지고, 누가 봤는지 기록은 남는다 */
export async function archiveResource(id: string) {
  if ((await getRole()) !== "coach") return;
  const supabase = await createClient();
  await supabase.from("resources").update({ is_archived: true }).eq("id", id);
  revalidatePath("/coach/resources");
  revalidatePath("/coach/players");
}
