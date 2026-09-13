export type NdrCallStatus =
  | "no_answer"
  | "call_disconnected"
  | "refused_delivery"
  | "language_barrier_wrong_number";

export const NDR_CALL_STATUS_LABELS: Record<NdrCallStatus, string> = {
  no_answer: "No Answer",
  call_disconnected: "Call Disconnected",
  refused_delivery: "Refused Delivery",
  language_barrier_wrong_number: "Language Barrier / Wrong Number",
};

export type AlertType =
  | "fake_attempt"
  | "missing_parcel"
  | "unresolved_ticket"
  | "session_expired"
  | "ticket_resolved"
  | "new_agent_message";

export interface Alert {
  id: number;
  type: AlertType;
  awb_number: string | null;
  ticket_id: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface OrderRow {
  awb_number: string;
  order_id: string | null;
  customer_name: string | null;
  order_status: string | null;
  rto_status: string | null;
  delivered_at: string | null;
  last_seen_at: string;
  latest_attempt_number?: number | null;
  already_called?: boolean;
}

export interface TicketRow {
  ticket_id: string;
  status: "open" | "closed";
  subject: string | null;
  opened_at: string | null;
  closed_at: string | null;
  ai_resolution_flag: "resolved" | "needs_review" | "unreviewed";
  ai_resolution_reasoning: string | null;
  last_synced_at: string;
}

export interface ChatMessageRow {
  id: number;
  ticket_id: string;
  sender: "agent" | "seller";
  message: string;
  sent_at: string;
}
