import BudgetView from "@/components/BudgetView";

export default async function BudgetViewPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { budgetId } = await params;
  return <BudgetView budgetId={budgetId} />;
}
