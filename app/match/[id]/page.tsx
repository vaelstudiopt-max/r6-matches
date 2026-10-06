import { Dashboard } from "../../ui";
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Dashboard section="match" matchId={id} />;
}
