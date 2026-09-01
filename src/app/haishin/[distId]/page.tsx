import DistributionView from "@/components/DistributionView";

export default async function DistributionPage({
  params,
}: {
  params: Promise<{ distId: string }>;
}) {
  const { distId } = await params;
  return <DistributionView distId={distId} />;
}
