import FrozenGianView from "@/components/FrozenGianView";

export default async function FrozenGianPage({
  params,
}: {
  params: Promise<{ distId: string; gianId: string }>;
}) {
  const { distId, gianId } = await params;
  return <FrozenGianView distId={distId} gianId={gianId} />;
}
