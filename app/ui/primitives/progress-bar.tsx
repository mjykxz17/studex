import { cn } from "@/app/ui/primitives/cn";

type Tone = "success" | "warn" | "tertiary" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-[var(--color-success)]",
  warn: "bg-[var(--color-warn)]",
  tertiary: "bg-[var(--color-fg-tertiary)]",
  accent: "bg-[var(--color-accent)]",
};

export function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]",
        className,
      )}
    >
      <div
        data-testid="progress-fill"
        className={cn("h-full", TONE_CLASSES[tone])}
        style={{ width: `${pct}%`, transition: "width 600ms var(--ease-out)" }}
      />
    </div>
  );
}
