import CommitteeFolder from "@/components/CommitteeFolder";

export default async function CommitteeFolderPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = await params;
  return <CommitteeFolder committeeId={committeeId} />;
}
