"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ShareResult = { error: string | null };

/** 팀 공유 링크는 하나만 살아 있게: 새로 만들면 이전 링크는 끊는다. */
export async function createShareLink(): Promise<ShareResult> {
  const supabase = await createClient();
  const { error: revokeError } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null);
  if (revokeError) return { error: `이전 링크를 끊지 못했어요: ${revokeError.message}` };
  const { error } = await supabase.from("share_links").insert({ label: "팀 공유" });
  if (error) return { error: `링크를 만들지 못했어요: ${error.message}` };
  revalidatePath("/coach", "layout");
  return { error: null };
}

export async function revokeShareLinks(): Promise<ShareResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null);
  if (error) return { error: `링크를 끊지 못했어요: ${error.message}` };
  revalidatePath("/coach", "layout");
  return { error: null };
}
