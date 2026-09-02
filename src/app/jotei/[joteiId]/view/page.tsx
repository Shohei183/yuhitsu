import JoteiView from "@/components/JoteiView";

export default async function JoteiViewPage({
  params,
}: {
  params: Promise<{ joteiId: string }>;
}) {
  const { joteiId } = await params;
  return <JoteiView joteiId={joteiId} />;
}
