type Tone = "urgent" | "pending" | "good" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  urgent: "bg-urgent-bg text-urgent",
  pending: "bg-pending-bg text-pending",
  good: "bg-good-bg text-good",
  neutral: "bg-border text-ink-muted",
};

export default function StatusBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
