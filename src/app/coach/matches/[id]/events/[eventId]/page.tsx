import { EventPage } from "../../../event-page";

export const metadata = { title: "골·실점 고치기 · pitch-note" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  return <EventPage matchId={id} eventId={eventId} side="for" />;
}
