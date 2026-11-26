import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { LaunchFallback } from "./fallback";

// 홈 화면 아이콘으로 열었을 때 첫 화면: 선수는 내 기록, 감독·기록원은 감독 화면.
export default async function Launch() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect((await getRole()) === "player" ? "/me" : "/coach");
  return <LaunchFallback />;
}
