import SidaiView from "@/components/SidaiView";

export default async function SidaiViewPage({
  params,
}: {
  params: Promise<{ sidaiId: string }>;
}) {
  const { sidaiId } = await params;
  return <SidaiView sidaiId={sidaiId} />;
}
