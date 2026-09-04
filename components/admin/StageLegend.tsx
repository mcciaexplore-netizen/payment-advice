import { PIPELINE_STAGE_ORDER, STAGE_STYLE } from "@/lib/advice/stage-style";

/** Compact, collapsed-by-default legend (native <details>, no client JS
 * needed) mapping every stage's color dot to its full name and short badge
 * label — e.g. "Paid" alone doesn't say whether that's Cash or NEFT, so
 * the legend spells out both. Shared by the Finance Admin and Authority
 * dashboards so the same 9 colors always mean the same thing in both. */
export function StageLegend() {
  return (
    <details className="group w-fit rounded-md border border-gray-200 bg-white text-sm open:shadow-sm">
      <summary className="cursor-pointer list-none px-3 py-1.5 font-medium text-gray-600 marker:content-none hover:text-[#0b1f3a]">
        <span className="inline-flex items-center gap-1.5">
          Stage colors
          <span className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-gray-100 px-3 py-2.5 sm:grid-cols-2">
        {PIPELINE_STAGE_ORDER.map((stage) => {
          const style = STAGE_STYLE[stage];
          return (
            <div key={stage} className="flex items-center gap-2 whitespace-nowrap text-xs text-gray-600">
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${style.dot}`} />
              <span className="font-medium text-gray-700">{style.shortLabel}</span>
              <span className="text-gray-400">— {stage}</span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
