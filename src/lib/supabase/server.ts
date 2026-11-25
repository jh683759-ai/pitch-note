import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

export async function createClient() {
  // cookies()를 먼저 읽어서 이 요청이 항상 동적 렌더링이 되게 한다(빌드 때 프리렌더 방지).
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) {
    throw new Error("Supabase 환경변수가 없습니다. .env.example 을 보고 .env.local 을 만드세요.");
  }
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 못 쓴다. 세션 갱신은 middleware가 한다.
        }
      },
    },
  });
}
