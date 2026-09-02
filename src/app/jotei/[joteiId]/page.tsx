import JoteiEditor from "@/components/JoteiEditor";

export default async function JoteiEditorPage({
  params,
}: {
  params: Promise<{ joteiId: string }>;
}) {
  const { joteiId } = await params;
  return <JoteiEditor joteiId={joteiId} />;
}
