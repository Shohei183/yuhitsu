import CommitteeReport from "@/components/CommitteeReport";

export default async function CommitteeReportPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = await params;
  return <CommitteeReport committeeId={committeeId} />;
}
