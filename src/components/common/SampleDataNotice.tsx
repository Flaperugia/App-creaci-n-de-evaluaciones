import { Info } from 'lucide-react';

interface SampleDataNoticeProps {
  message: string;
}

export function SampleDataNotice({ message }: SampleDataNoticeProps) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-[#F4F7FB] px-3.5 py-2.5 text-xs sm:text-sm text-slate-700 no-print"
    >
      <Info
        className="h-4 w-4 shrink-0 mt-0.5 text-slate-500"
        aria-hidden="true"
      />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}
