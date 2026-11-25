import { redirect } from "next/navigation";

export default function CoachHome() {
  // 2~3주차에 "지금 상황 + 다음 할 일" 홈이 들어올 자리. 지금은 선수 관리로.
  redirect("/coach/players");
}
