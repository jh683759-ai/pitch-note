import { EventPage } from "../../../event-page";

export const metadata = { title: "골·실점 기록 · pitch-note" };

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { side, saved } = await searchParams;
  return <EventPage matchId={id} eventId={null} side={side === "against" ? "against" : "for"} saved={saved === "1"} />;
}
