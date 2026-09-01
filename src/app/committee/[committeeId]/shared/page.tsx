import SharedFolder from "@/components/SharedFolder";

export default async function CommitteeSharedPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = await params;
  return <SharedFolder committeeId={committeeId} />;
}
