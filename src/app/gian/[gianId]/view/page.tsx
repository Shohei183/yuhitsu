import GianView from "@/components/GianView";
import ReviewLayer from "@/components/ReviewLayer";

export default async function GianViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ gianId: string }>;
  searchParams: Promise<{ snap?: string; dist?: string }>;
}) {
  const { gianId } = await params;
  const { snap, dist } = await searchParams;
  // 配信データから辿ってきた場合（次第→議案→基本方針など）は、その配信データの
  // メモとしてコメントを付けられるようにする
  if (dist) {
    return (
      <ReviewLayer distId={dist} gianId={gianId}>
        <GianView gianId={gianId} snapshotId={snap} distId={dist} />
      </ReviewLayer>
    );
  }
  return <GianView gianId={gianId} snapshotId={snap} />;
}
