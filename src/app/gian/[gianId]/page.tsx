import { MOCK_GIANS } from "@/lib/mockData";
import GianBuilderPage from "@/components/GianBuilderPage";

export function generateStaticParams() {
  return MOCK_GIANS.map((g) => ({ gianId: g.id }));
}

export default async function GianBuilderRoute({
  params,
}: {
  params: Promise<{ gianId: string }>;
}) {
  const { gianId } = await params;
  return <GianBuilderPage gianId={gianId} />;
}
