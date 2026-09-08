import { stageAging, type StageAgingAdvice } from "@/lib/advice/stage-aging";

export function StageAgingIndicator({ advice }: { advice: StageAgingAdvice }) {
  const aging = stageAging(advice);
  if (!aging) return null;
  return (
    <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${aging.isStale ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700"}`}>
      {aging.label}
    </span>
  );
}
