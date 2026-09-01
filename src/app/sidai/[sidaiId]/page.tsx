import SidaiBuilder from "@/components/SidaiBuilder";

export default async function SidaiEditorPage({
  params,
}: {
  params: Promise<{ sidaiId: string }>;
}) {
  const { sidaiId } = await params;
  return <SidaiBuilder sidaiId={sidaiId} />;
}
