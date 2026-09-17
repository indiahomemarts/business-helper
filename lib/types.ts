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

export interface NdrLog {
  id: number;
  awb_number: string;
  attempt_count_at_call: number | null;
  call_status: NdrCallStatus;
  notes: string | null;
  audio_file_path: string | null;
  called_at: string;
}

export type AlertType =
  | "fake_attempt"
  | "missing_parcel"
  | "unresolved_ticket"
  | "session_expired"
  | "ticket_resolved"
  | "new_agent_message"
  | "ticket_closed_by_shopdeck"
  | "intransit_dropped";

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

export interface NdrOrder extends OrderRow {
  attempt_history: number[];
  latest_attempt_number: number | null;
  is_fake_attempt: boolean;
  already_called: boolean;
  logged_today: boolean;
  call_history: NdrLog[];
}

export interface RtoInwardEntry {
  id: number;
  awb_number: string;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  notes: string | null;
  created_at: string;
}

export interface RtoSummary {
  totalRto: number;
  initialBaseline: number;
  newRtoCount: number;
  intransitCount: number;
  deliveredTodayCount: number;
  inwardedTodayCount: number;
  isAfter7Pm: boolean;
  currentTimeIst: string;
  reconciliationMismatch: boolean;
  missingDeliveredAwbs: string[];
  intransitDroppedAwbs: string[];
}

export interface TicketRow {
  ticket_id: string;
  status: "open" | "closed";
  subject: string | null;
  opened_at: string | null;
  closed_at: string | null;
  user_status: "open" | "solved";
  user_solved_at: string | null;
  is_closed_by_shopdeck: boolean;
  shopdeck_closed_at: string | null;
  has_chat_messages: boolean;
  no_chat_warning: boolean;
  ai_resolution_flag: "resolved" | "needs_review" | "unreviewed";
  ai_resolution_reasoning: string | null;
  last_synced_at: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  chat_count?: number;
}

export interface ChatMessageRow {
  id: number;
  ticket_id: string;
  sender: "agent" | "seller";
  message: string;
  sent_at: string;
  subject?: string | null;
}

