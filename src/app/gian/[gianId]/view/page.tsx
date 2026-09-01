import GianView from "@/components/GianView";

export default async function GianViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ gianId: string }>;
  searchParams: Promise<{ snap?: string }>;
}) {
  const { gianId } = await params;
  const { snap } = await searchParams;
  return <GianView gianId={gianId} snapshotId={snap} />;
}
