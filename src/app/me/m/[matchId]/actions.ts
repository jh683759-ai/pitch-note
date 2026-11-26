"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_MY_FOCUS, type PlayerNote } from "@/lib/player-notes";

export async function saveMyNotes(matchId: string, notes: PlayerNote[]): Promise<{ error: string | null }> {
  const cleaned = notes
    .filter((n) => ["good", "improve", "next_focus"].includes(n.kind))
    .map((n) => ({ kind: n.kind, body: String(n.body ?? "").trim().slice(0, 500) }))
    .filter((n) => n.body);
  if (cleaned.filter((n) => n.kind === "next_focus").length > MAX_MY_FOCUS) {
    return { error: `다음 경기 내 포인트는 ${MAX_MY_FOCUS}개까지예요.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_notes", { p_match_id: matchId, p_notes: cleaned });
  if (error) {
    if (error.message.includes("내가 온 경기")) return { error: "내가 온 경기에만 노트를 쓸 수 있어요." };
    return { error: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
  }
  revalidatePath("/me");
  revalidatePath(`/me/m/${matchId}`);
  return { error: null };
}
