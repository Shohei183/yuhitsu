import CommitteeGianList from "@/components/CommitteeGianList";

export default async function CommitteeGianPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = await params;
  return <CommitteeGianList committeeId={committeeId} />;
}
