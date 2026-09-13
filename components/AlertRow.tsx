import Link from "next/link";
import StatusBadge from "./StatusBadge";
import type { Alert } from "@/lib/types";

const TYPE_META: Record<
  Alert["type"],
  { label: string; tone: "urgent" | "pending" | "good" | "neutral"; href: (a: Alert) => string }
> = {
  fake_attempt: {
    label: "Fake attempt",
    tone: "urgent",
    href: (a) => (a.awb_number ? `/ndr?awb=${a.awb_number}` : "/ndr"),
  },
  missing_parcel: {
    label: "Missing parcel",
    tone: "urgent",
    href: (a) => (a.awb_number ? `/rto?awb=${a.awb_number}` : "/rto"),
  },
  unresolved_ticket: {
    label: "Needs your review",
    tone: "pending",
    href: (a) => (a.ticket_id ? `/tickets?ticket=${a.ticket_id}` : "/tickets"),
  },
  ticket_resolved: {
    label: "Resolved",
    tone: "good",
    href: (a) => (a.ticket_id ? `/tickets?ticket=${a.ticket_id}` : "/tickets"),
  },
  session_expired: {
    label: "Action needed",
    tone: "urgent",
    href: () => "/settings",
  },
  new_agent_message: {
    label: "New message",
    tone: "pending",
    href: (a) => (a.ticket_id ? `/tickets?ticket=${a.ticket_id}` : "/tickets"),
  },
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function AlertRow({ alert }: { alert: Alert }) {
  const meta = TYPE_META[alert.type];
  return (
    <Link
      href={meta.href(alert)}
      className={`flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0 ${
        alert.is_read ? "" : "bg-cocoa/[0.03]"
      }`}
    >
      {!alert.is_read && (
        <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-cocoa" aria-hidden />
      )}
      {alert.is_read && <span className="mt-1.5 h-1.5 w-1.5 flex-none" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          <span className="text-xs text-ink-faint">{timeAgo(alert.created_at)}</span>
        </div>
        <p className="mt-1 truncate text-[15px] font-medium text-ink">{alert.title}</p>
        {alert.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{alert.body}</p>}
      </div>
    </Link>
  );
}
