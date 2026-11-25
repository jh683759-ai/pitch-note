import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 가입 인증 메일의 링크가 돌아오는 곳. 인증 자체는 Supabase가 이미 끝냈고,
// 같은 브라우저면 여기서 바로 로그인까지 이어준다. 다른 기기(휴대폰 메일 앱 등)에서
// 눌렀으면 로그인만 다시 하면 된다.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const dest = url.clone();
  dest.search = "";
  dest.pathname = ok ? "/coach" : "/login";
  if (!ok) dest.searchParams.set("confirmed", "1");
  return NextResponse.redirect(dest);
}
