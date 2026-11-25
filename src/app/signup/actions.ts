"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { MIN_PASSWORD } from "./rules";

export type SignupState = { error: string | null; sentTo?: string };

/** 기록원 신청 = 가입. 가입하면 '승인 대기'가 되고, 감독이 승인해야 기록할 수 있다. */
export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const name = String(form.get("display_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!name || name.length > 20) return { error: "이름을 1~20자로 입력하세요." };
  if (!email) return { error: "이메일을 입력하세요." };
  if (password.length < MIN_PASSWORD) return { error: `비밀번호는 ${MIN_PASSWORD}자 이상으로 정하세요.` };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // DB 트리거가 이 표시를 보고 '승인 대기' 목록에 올린다
      data: { signup: "pitch-note", display_name: name },
      emailRedirectTo: `${await siteUrl()}/auth/callback`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already")) return { error: "이미 가입된 이메일이에요. 로그인하세요." };
    if (msg.includes("rate limit")) return { error: "지금은 인증 메일을 더 보낼 수 없어요. 한 시간쯤 뒤에 다시 해 주세요." };
    if (msg.includes("password")) return { error: "비밀번호가 너무 쉬워요. 다른 비밀번호로 해 주세요." };
    if (msg.includes("signups not allowed") || msg.includes("disabled")) return { error: "지금은 가입을 받지 않고 있어요. 감독에게 물어보세요." };
    return { error: "가입하지 못했어요. 잠시 뒤 다시 해 주세요." };
  }

  // 메일 인증을 켜 둔 상태에서 이미 있는 이메일이면 Supabase는 성공처럼 답하고 identities가 비어 있다
  if (data.user && data.user.identities?.length === 0) return { error: "이미 가입된 이메일이에요. 로그인하세요." };

  // 메일 인증이 꺼져 있으면 바로 로그인된다 → 승인 대기 화면
  if (data.session) redirect("/coach");
  return { error: null, sentTo: email };
}
