import BudgetEditor from "@/components/BudgetEditor";

export default async function BudgetEditorPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { budgetId } = await params;
  return <BudgetEditor budgetId={budgetId} />;
}
