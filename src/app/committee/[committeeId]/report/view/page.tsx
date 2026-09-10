import CommitteeReportView from "@/components/CommitteeReportView";

export default async function CommitteeReportViewPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = await params;
  return <CommitteeReportView committeeId={committeeId} />;
}
