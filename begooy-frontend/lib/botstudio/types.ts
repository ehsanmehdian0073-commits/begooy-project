export type Channel =
  | "webchat"
  | "telegram"
  | "instagram"
  | "whatsapp"
  | "email"
  | "sms"
  | "voip";

export type NodeType =
  | "trigger:channel"
  | "filter:regex"
  | "filter:ai-intent"
  | "action:kb-answer"
  | "action:send-message"
  | "action:tag-customer"
  | "control:branch"
  | "control:delay"
  | "action:set-var";

export type NodeData = Record<string, any>;

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, any>;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  created_at: string;
}
