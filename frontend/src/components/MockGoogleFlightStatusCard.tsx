import { Button } from "@/components/ui/button";

/**
 * Plain text for manual paste tests — must stay in sync with
 * backend `extractDelayHoursFromFlightStatusCard` in chat.js.
 */
export const MOCK_GOOGLE_FLIGHT_STATUS_PASTE_TEXT = `Search: aa 1234 flight status

American Airlines AA1234
New York (JFK) to Naples (NAP)

DEPARTING LATE

Original departure: 2026-12-11 16:45
Estimated departure: 2026-12-12 16:45

Original arrival: 2026-12-12 07:05
Estimated arrival: 2026-12-13 07:05

Arrive at gate for originally scheduled departure time and confirm flight status on an airport monitor. Status may change.`;

/** Splits assistant message around backend marker `[[PINDROP_FLIGHT_STATUS_DEMO:24]]`. */
export function splitFlightStatusDemoMessage(content: string): { before: string; after: string } | null {
  if (!content || !/\[\[PINDROP_FLIGHT_STATUS_DEMO:\d+\]\]/.test(content)) return null;
  const segments = content.split(/\n*\[\[PINDROP_FLIGHT_STATUS_DEMO:\d+\]\]\n*/);
  if (segments.length < 2) return null;
  return {
    before: segments[0].trimEnd(),
    after: segments.slice(1).join("").trimStart(),
  };
}

type Props = {
  onSendToAssistant?: () => void;
  disabled?: boolean;
  /** `embedded` = inside assistant bubble after simulated search (no action button). */
  variant?: "standalone" | "embedded";
};

/**
 * Google-style flight status card (demo). Times match simulated AA1234 / JFK→NAP 24h delay.
 */
export function MockGoogleFlightStatusCard({
  onSendToAssistant,
  disabled,
  variant = "standalone",
}: Props) {
  const embedded = variant === "embedded";

  return (
    <div className="rounded-xl border border-slate-600/80 bg-[#303134] text-[#e8eaed] shadow-md overflow-hidden text-left">
      <div className="px-3 pt-3 pb-2 border-b border-slate-600/60">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">
          {embedded ? "Simulated lookup (not live data)" : "Demo — Google-style result"}
        </p>
        <h3 className="text-sm font-medium leading-tight mt-0.5">American Airlines AA1234</h3>
        <p className="text-xs text-slate-400 mt-0.5">New York (JFK) to Naples (NAP)</p>
        <div className="flex gap-2 mt-2 text-[11px]">
          <span className="border-b-2 border-blue-400 pb-0.5 text-slate-200">Thu, Dec 11</span>
          <span className="text-slate-500 pb-0.5">Fri, Dec 12</span>
        </div>
      </div>

      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-300 line-through decoration-slate-500">4:45 PM</p>
          <p className="text-[11px] text-slate-500 truncate">AA1234 · JFK</p>
        </div>
        <div className="shrink-0">
          <span className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold bg-[#8b2e2e] text-white">
            DEPARTING LATE
          </span>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[11px] text-slate-400">to Naples NAP</p>
        </div>
      </div>

      <div className="mx-3 mb-2 rounded-md border border-slate-600/50 bg-[#3c4043] px-2 py-1.5 text-[10px] text-slate-300 leading-snug">
        Arrive at gate for originally scheduled departure time and confirm flight status on an airport
        monitor. Status may change.
      </div>

      <div className="px-3 pb-2 flex items-center justify-between gap-2">
        <div className="text-center flex-1">
          <p className="text-lg font-semibold tracking-tight">JFK</p>
          <span className="text-[10px] text-blue-400">Airport info</span>
        </div>
        <div className="flex-1 flex flex-col items-center px-1">
          <span className="text-[10px] text-slate-400">~12h (incl. connection)</span>
          <div className="w-full h-px bg-slate-500 relative my-1">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs">✈</span>
          </div>
        </div>
        <div className="text-center flex-1">
          <p className="text-lg font-semibold tracking-tight">NAP</p>
          <span className="text-[10px] text-blue-400">Airport info</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pb-3 text-[11px]">
        <div className="rounded-lg bg-[#3c4043] p-2">
          <p className="text-slate-400 mb-1">Departure · New York</p>
          <p className="text-base font-medium text-[#f28b82]">Fri, Dec 12 · 4:45 PM</p>
          <p className="text-slate-500 line-through mt-0.5">Thu, Dec 11 · 4:45 PM</p>
          <p className="text-slate-500 mt-1 text-[10px]">Terminal 8 · Gate 14 (example)</p>
        </div>
        <div className="rounded-lg bg-[#3c4043] p-2">
          <p className="text-slate-400 mb-1">Arrival · Naples</p>
          <p className="text-base font-medium text-[#e8eaed]">Sun, Dec 13 · 7:05 AM</p>
          <p className="text-slate-500 line-through mt-0.5">Sat, Dec 12 · 7:05 AM</p>
          <p className="text-slate-500 mt-1 text-[10px]">Terminal 1 (example)</p>
        </div>
      </div>

      <p className="px-3 pb-2 text-[10px] text-slate-500">
        Updated just now · {embedded ? "Simulated for this demo" : "Demo only (not live data)"}
      </p>

      {!embedded && onSendToAssistant && (
        <div className="px-3 pb-3">
          <Button
            type="button"
            size="sm"
            className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            disabled={disabled}
            onClick={onSendToAssistant}
          >
            Send this status to assistant
          </Button>
          <p className="text-[10px] text-slate-500 mt-1.5 text-center">
            Sends structured text so Pindrop can read original vs estimated times.
          </p>
        </div>
      )}
    </div>
  );
}

export default MockGoogleFlightStatusCard;
