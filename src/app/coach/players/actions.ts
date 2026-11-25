"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError, parsePlayerForm } from "@/lib/players";

export type FormState = { error: string | null };

export async function createPlayer(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parsePlayerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("players").insert(parsed.value);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  // "저장 후 하나 더": 경기 전에 여러 명을 연달아 등록하는 경우
  if (form.get("intent") === "save-and-new") redirect("/coach/players/new?saved=1");
  redirect("/coach/players");
}

export async function updatePlayer(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parsePlayerForm(form);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("players").update(parsed.value).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  redirect("/coach/players");
}

export async function setPlayerActive(id: string, active: boolean, _prev: FormState): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("players").update({ is_active: active }).eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  redirect("/coach/players");
}

export async function deletePlayer(id: string, _prev: FormState): Promise<FormState> {
  const supabase = await createClient();
  // 경기 기록(출석·골·코트 위 4명)이 있으면 FK가 막는다 → 보관을 안내
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/coach/players");
  redirect("/coach/players");
}
