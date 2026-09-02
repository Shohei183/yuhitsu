import JoteiCommitteeList from "@/components/JoteiCommitteeList";

export default async function CommitteeJoteiPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = await params;
  return <JoteiCommitteeList committeeId={committeeId} />;
}
