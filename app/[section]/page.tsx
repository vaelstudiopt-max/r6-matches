import { Dashboard } from "../ui";
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <Dashboard section={section} />;
}
