import FrozenReportView from "@/components/FrozenReportView";

export default async function FrozenReportPage({
  params,
}: {
  params: Promise<{ distId: string; reportId: string }>;
}) {
  const { distId, reportId } = await params;
  return <FrozenReportView distId={distId} reportId={reportId} />;
}
