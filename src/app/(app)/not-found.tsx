// 404 inside the app shell (e.g. a person id that no longer exists): the shell already
// renders the <main> landmark, so the card is a plain <div>.
import { NotFoundCard } from "@/components/not-found-card";

export default function NotFound() {
  return <NotFoundCard as="div" />;
}
