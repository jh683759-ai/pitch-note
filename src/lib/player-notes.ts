// 선수 기록 노트 타입·규칙 (서버·클라이언트 공용)
export type PlayerNoteKind = "good" | "improve" | "next_focus";
export type PlayerNote = { kind: PlayerNoteKind; body: string };

export const MAX_MY_FOCUS = 3;
