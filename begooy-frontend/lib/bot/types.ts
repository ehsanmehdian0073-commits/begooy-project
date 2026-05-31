// lib/bot/types.ts
export type Channel =
  | "webchat"
  | "telegram"
  | "instagram"
  | "whatsapp"
  | "email"
  | "sms"
  | "voip";

export type EventPayload = {
  event: "message.received";
  channel: Channel;
  text: string;
  session_id: string;    // از جدول sessions
  external_ref?: string; // شماره/هندل بیرونی
  profile_name?: string | null;
  nowISO?: string;       // برای تست/شبیه‌سازی زمان
  ctx?: Record<string, any>; // دادهٔ کمکی در طول اجرای فلو
};

export type NodeKind = "trigger" | "condition" | "action" | "control";

export type NodeType =
  // Triggers
  | "message_received"
  // Conditions
  | "contains_any"
  | "regex"
  | "time_window"
  // Actions
  | "send_message"
  | "add_tag"
  | "create_note"
  | "delay_ms"
  | "call_webhook"
  | "set_var"
  | "kb_answer"
  | "branch";

export type BotNode = {
  id: string;
  workflow_id: string;
  kind: NodeKind;
  type: NodeType;
  config: any;
};

export type BotEdge = {
  id: string;
  workflow_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string;    // 'true' | 'false' | 'next' | 'on_message' | ...
  priority: number; // کوچکتر = اولویت بالاتر
};

export type Workflow = {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  nodes: BotNode[];
  edges: BotEdge[];
};

// نتیجه اجرای یک نود
export type StepResult =
  | { outcome: "continue"; nextLabels?: string[] }   // ادامه به یال‌هایی با label خاص
  | { outcome: "halt" }                              // توقف
  | { outcome: "error"; message: string };

export type EngineDeps = {
  // آداپترهای ارسال پیام روی کانال‌ها
  sendOnChannel: (args: {
    channel: Channel;
    toExternalRef?: string;
    session_id: string;
    text: string;
    attachments?: any;
  }) => Promise<void>;

  // عملیات CRM
  addCustomerTag: (external_ref: string, tag: string) => Promise<void>;
  createCustomerNote: (external_ref: string, body: string, author?: string) => Promise<void>;

  // HTTP call (برای call_webhook)
  httpPostJSON?: (
    url: string,
    body: any,
    headers?: Record<string, string>
  ) => Promise<{ ok: boolean; status: number; json?: any }>;

  // زمان اکنون (برای تست‌ها قابل تزریق است)
  now?: () => Date;
};
