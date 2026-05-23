// lib/bot/engine.ts
import { createClient } from "@supabase/supabase-js";
import {
  BotEdge,
  BotNode,
  EngineDeps,
  EventPayload,
  StepResult,
  Workflow,
} from "./types";
import {
  cond_contains_any,
  cond_regex,
  cond_time_window,
  matches_trigger_message_received,
} from "./conditions";
import {
  act_add_tag,
  act_call_webhook,
  act_create_note,
  act_delay_ms,
  act_send_message,
} from "./actions";

/** Supabase Admin (Service Role) */
const sbAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service Role برای نوشتن لاگ‌ها
  { auth: { persistSession: false } }
);

/* ---------------------------------- Log ---------------------------------- */
async function log(
  run_id: string,
  level: "info" | "warn" | "error",
  message: string,
  data?: any,
  node_id?: string
) {
  try {
    await sbAdmin
      .from("bot_run_logs")
      .insert({ run_id, level, message, data: data ?? null, node_id: node_id ?? null });
  } catch {}
}

/* ---------------------- Loader (Legacy: bot_* tables) --------------------- */
async function loadLegacyWorkflows(): Promise<Workflow[]> {
  const { data: wfs, error: e1 } = await sbAdmin
    .from("bot_workflows")
    .select("*")
    .eq("is_active", true);

  if (e1 || !wfs || !wfs.length) return [];

  const wfIds = wfs.map((w) => w.id);
  const { data: nodes } = await sbAdmin
    .from("bot_nodes")
    .select("*")
    .in("workflow_id", wfIds);
  const { data: edges } = await sbAdmin
    .from("bot_edges")
    .select("*")
    .in("workflow_id", wfIds);

  const byWfNodes: Record<string, BotNode[]> = {};
  const byWfEdges: Record<string, BotEdge[]> = {};
  nodes?.forEach((n: any) => {
    (byWfNodes[n.workflow_id] ||= []).push(n as BotNode);
  });
  edges?.forEach((e: any) => {
    (byWfEdges[e.workflow_id] ||= []).push(e as BotEdge);
  });

  return wfs.map(
    (w: any) =>
      ({
        id: w.id,
        name: w.name,
        description: w.description,
        is_active: w.is_active,
        nodes: byWfNodes[w.id] || [],
        edges: byWfEdges[w.id] || [],
      } as Workflow)
  );
}

/* ------------------------ Loader (Studio: workflow_*) --------------------- */
/** شکل نودهای استودیو */
type StudioNode = {
  id: string;
  type: "simple";
  position: { x: number; y: number };
  data: {
    label?: string;
    kind?: string; // "trigger:channel" | "filter:regex" | ...
    channel?: string;
    pattern?: string;
    intents?: string[];
    textTemplate?: string;
    tags?: string[];
    ms?: number;
    key?: string;
    value?: string;
    kb_id?: string | null;
    top_k?: number;
    threshold?: number;
    // Branch:
    cases?: Array<{ expr: string; target?: string | null }>;
    default?: string | null;
  };
};

type StudioEdge = { id: string; source: string; target: string };

async function loadStudioWorkflows(): Promise<{
  id: string;
  name: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
}[]> {
  const { data: wfs, error: eW } = await sbAdmin
    .from("workflows")
    .select("id,name,status")
    .order("created_at", { ascending: false });

  if (eW || !wfs || !wfs.length) return [];

  const studioList: {
    id: string;
    name: string;
    nodes: StudioNode[];
    edges: StudioEdge[];
  }[] = [];

  for (const wf of wfs) {
    const { data: ver, error: eV } = await sbAdmin
      .from("workflow_versions")
      .select("*")
      .eq("workflow_id", wf.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eV || !ver) continue;
    if (typeof wf.status === "string" && wf.status !== "active") continue;

    studioList.push({
      id: wf.id,
      name: wf.name || `wf_${wf.id}`,
      nodes: (ver.nodes || []) as StudioNode[],
      edges: (ver.edges || []) as StudioEdge[],
    });
  }

  return studioList;
}

/** تبدیل Studio → Runtime (Workflow) برای موتور فعلی */
function studioToRuntime(st: {
  id: string;
  name: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
}): Workflow {
  const rNodes: BotNode[] = st.nodes.map((n) => {
    const kind = n.data?.kind || "";
    const [k0, k1] = kind.split(":"); // "action:send-message" => ["action","send-message"]
    const rt: BotNode = {
      id: n.id,
      workflow_id: st.id,
      kind:
        k0 === "trigger" || k0 === "condition" || k0 === "action" || k0 === "control"
          ? (k0 as any)
          : "action",
      type: (k1 || "noop") as any,
      config: {
        // send-message
        textTemplate: n.data?.textTemplate,
        // regex
        pattern: n.data?.pattern,
        // ai-intent ~ contains_any
        intents: n.data?.intents,
        // delay
        ms: n.data?.ms,
        // set-var
        key: n.data?.key,
        value: n.data?.value,
        // tag
        tags: n.data?.tags,
        // kb
        kb_id: n.data?.kb_id,
        top_k: n.data?.top_k,
        threshold: n.data?.threshold,
        // trigger
        channel: n.data?.channel,
        // branch
        cases: n.data?.cases,
        default: n.data?.default,
      },
      label: null,
      priority: 0,
    } as any;

    // نگاشت نام‌ها
    const studioType = String(rt.type);
    if (rt.kind === "trigger" && studioType === "channel") rt.type = "message_received";
    if (rt.kind === "action" && studioType === "send-message") rt.type = "send_message";
    if (rt.kind === "action" && studioType === "tag-customer") rt.type = "add_tag";
    if (rt.kind === "action" && studioType === "set-var") rt.type = "set_var";
    if (rt.kind === "control" && studioType === "branch") rt.type = "branch";

    if (rt.kind === "condition" && studioType === "ai-intent") rt.type = "contains_any";
    if (rt.kind === "condition" && studioType === "regex") rt.type = "regex";

    if (rt.kind === "action" && studioType === "delay") rt.type = "delay_ms";
    if (rt.kind === "action" && studioType === "kb-answer") rt.type = "kb_answer";

    return rt;
  });

  const rEdges: BotEdge[] = st.edges.map((e) => ({
    id: e.id,
    workflow_id: st.id,
    from_node_id: e.source,
    to_node_id: e.target,
    label: "next",
    priority: 0,
  }));

  return {
    id: st.id,
    name: st.name,
    description: null as any,
    is_active: true,
    nodes: rNodes,
    edges: rEdges,
  };
}

/* ---------------------------- Exec helpers ---------------------------- */
async function execNode(
  deps: EngineDeps,
  evt: EventPayload,
  node: BotNode
): Promise<StepResult & { nextId?: string }> {
  try {
    // Trigger
    if (node.kind === "trigger") {
      if (node.type === "message_received") {
        const ok = matches_trigger_message_received(evt, node.config || {});
        return { outcome: ok ? "continue" : "halt", nextLabels: ok ? ["on_message", "next"] : [] };
      }
      return { outcome: "halt" };
    }

    // Condition
    if (node.kind === "condition") {
      if (node.type === "contains_any") {
        const arr = Array.isArray(node.config?.intents) ? node.config?.intents : node.config?.keywords;
        const ok = cond_contains_any(evt.text, arr || []);
        return { outcome: "continue", nextLabels: [ok ? "true" : "false", "next"] };
      }
      if (node.type === "regex") {
        const ok = cond_regex(evt.text, node.config?.pattern || "", node.config?.flags || "i");
        return { outcome: "continue", nextLabels: [ok ? "true" : "false", "next"] };
      }
      if (node.type === "time_window") {
        const now = deps.now ? deps.now() : (evt.nowISO ? new Date(evt.nowISO) : new Date());
        const ok = cond_time_window(now, node.config || {});
        return { outcome: "continue", nextLabels: [ok ? "true" : "false", "next"] };
      }
      return { outcome: "halt" };
    }

    // Control (branch)
    if (node.kind === "control") {
      if (node.type === "branch") {
        const next = evalBranch(node.config?.cases || [], node.config?.default || null, evt);
        return { outcome: "continue", nextId: next || undefined, nextLabels: ["next"] };
      }
      return { outcome: "continue" };
    }

    // Actions
    if (node.kind === "action") {
      if (node.type === "send_message") {
        await act_send_message(deps, evt, node.config || {});
        return { outcome: "continue", nextLabels: ["next"] };
      }
      if (node.type === "add_tag") {
        const tags = node.config?.tags || [];
        if (Array.isArray(tags) && tags.length) {
          for (const t of tags) await act_add_tag(deps, evt, { tag: t });
        }
        return { outcome: "continue", nextLabels: ["next"] };
      }
      if (node.type === "create_note") {
        await act_create_note(deps, evt, node.config || {});
        return { outcome: "continue", nextLabels: ["next"] };
      }
      if (node.type === "delay_ms") {
        await act_delay_ms(Number(node.config?.ms || 0));
        return { outcome: "continue", nextLabels: ["next"] };
      }
      if (node.type === "call_webhook") {
        await act_call_webhook(deps, node.config?.url, { evt }, node.config?.headers);
        return { outcome: "continue", nextLabels: ["next"] };
      }
      if (node.type === "set_var") {
        const key = String(node.config?.key || "").trim();
        const value = node.config?.value;
        (evt as any).ctx = (evt as any).ctx || {};
        if (key) (evt as any).ctx[key] = value;
        return { outcome: "continue", nextLabels: ["next"] };
      }
      if (node.type === "kb_answer") {
        (evt as any).ctx = (evt as any).ctx || {};
        if (!(evt as any).ctx.answer) {
          (evt as any).ctx.answer = "🔎 (KB) پاسخی پیدا نشد یا اتصال KB هنوز تنظیم نشده است.";
        }
        return { outcome: "continue", nextLabels: ["next"] };
      }

      return { outcome: "continue" };
    }

    return { outcome: "halt" };
  } catch (e: any) {
    return { outcome: "error", message: e?.message || "node_error" };
  }
}

/** انتخاب یال‌های بعدی با برچسب‌های مجاز (مدل قدیمی) */
function pickNextEdges(
  edges: BotEdge[],
  fromId: string,
  allowedLabels?: string[]
) {
  const candidates = edges.filter(
    (e) =>
      e.from_node_id === fromId &&
      (!allowedLabels || allowedLabels.includes(e.label || "next"))
  );
  return candidates.sort((a, b) => (a.priority || 0) - (b.priority || 0));
}

/** Studio routing:
 * اگر execNode.nextId داشته باشیم، مستقیم همان را می‌گیریم؛
 * وگرنه اولین edge ساده را دنبال می‌کنیم.
 */
function pickNextNodeIdStudio(
  wf: Workflow,
  currentNodeId: string,
  hint?: { nextId?: string; nextLabels?: string[] }
): string | undefined {
  if (hint?.nextId) return hint.nextId;
  const e = wf.edges.find((x) => x.from_node_id === currentNodeId);
  return e?.to_node_id;
}

/** evaluator ساده برای Branch:
 *  - intent == 'faq' (از evt.ctx.intent)
 *  - text.includes('سلام')
 *  - /regex/flags
 */
function evalBranch(
  cases: Array<{ expr: string; target?: string | null }>,
  defTarget: string | null,
  evt: EventPayload
): string | null {
  const text = (evt.text || "").toString();
  const ctx: any = (evt as any).ctx || {};

  for (const c of cases || []) {
    const expr = (c.expr || "").trim();
    if (!expr) continue;

    const intentMatch = expr.match(/^intent\s*==\s*['"]([^'"]+)['"]$/i);
    if (intentMatch) {
      if (String(ctx.intent || "") === intentMatch[1]) return c.target || null;
      continue;
    }

    const incl = expr.match(/^text\.includes\(\s*['"]([^'"]+)['"]\s*\)$/i);
    if (incl) {
      if (text.includes(incl[1])) return c.target || null;
      continue;
    }

    const rx = expr.match(/^\/(.+)\/([a-z]*)$/i);
    if (rx) {
      try {
        const re = new RegExp(rx[1], rx[2] || "i");
        if (re.test(text)) return c.target || null;
      } catch {}
      continue;
    }
  }
  return defTarget || null;
}

/* ---------------------------- Workflow Runner ----------------------------- */
const MAX_STEPS = 200; // محافظ برای جلوگیری از حلقه‌های بی‌نهایت

async function runWorkflow(deps: EngineDeps, wf: Workflow, evt: EventPayload) {
  const { data: run } = await sbAdmin
    .from("bot_runs")
    .insert({
      workflow_id: wf.id,
      status: "running",
      input_payload: { evt },
    })
    .select("*")
    .single();

  const nodesById: Record<string, BotNode> = {};
  wf.nodes.forEach((n) => (nodesById[n.id] = n));

  const triggers = wf.nodes.filter(
    (n) => n.kind === "trigger" && n.type === "message_received"
  );

  try {
    for (const t of triggers) {
      await log(run.id, "info", "trigger_check", { node: t.id }, t.id);
      const r = await execNode(deps, evt, t);
      if (r.outcome === "error") {
        await log(run.id, "error", "trigger_error", { message: r.message }, t.id);
        continue;
      }
      if (r.outcome === "halt") continue;

      let steps = 0;
      let queue: { from: string; hint?: { nextId?: string; nextLabels?: string[] } }[] = [
        { from: t.id, hint: r },
      ];
      const visited = new Set<string>();

      while (queue.length && steps < MAX_STEPS) {
        steps++;
        const curr = queue.shift()!;
        const fromId = curr.from;

        let frontier: BotEdge[] = [];
        if (wf.edges.some((e) => e.label && e.label !== "next")) {
          frontier = pickNextEdges(wf.edges, fromId, curr.hint?.nextLabels);
        } else {
          const nid = pickNextNodeIdStudio(wf, fromId, curr.hint);
          if (nid) {
            frontier = [
              {
                id: `${fromId}->${nid}`,
                workflow_id: wf.id,
                from_node_id: fromId,
                to_node_id: nid,
                label: "next",
                priority: 0,
              },
            ];
          }
        }

        for (const edge of frontier) {
          const nextNode = nodesById[edge.to_node_id];
          if (!nextNode) continue;

          const vkey = `${fromId}->${edge.to_node_id}`;
          if (visited.has(vkey)) {
            await log(run.id, "warn", "loop_detected", { edge: edge.id, node: nextNode.id });
            continue;
          }
          visited.add(vkey);

          await log(run.id, "info", "enter_node", { node: nextNode.id, type: nextNode.type }, nextNode.id);
          const res = await execNode(deps, evt, nextNode);
          if (res.outcome === "error") {
            await log(run.id, "error", "node_error", { message: res.message }, nextNode.id);
            break;
          }
          if (res.outcome === "halt") {
            await log(run.id, "info", "halt", { node: nextNode.id }, nextNode.id);
            break;
          }

          queue.unshift({ from: nextNode.id, hint: res });
        }
      }

      if (steps >= MAX_STEPS) {
        await log(run.id, "warn", "max_steps_reached", { max: MAX_STEPS });
      }
    }

    await sbAdmin
      .from("bot_runs")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", run.id);
  } catch (e: any) {
    await log(run.id, "error", "run_error", { message: e?.message || "run_error" });
    await sbAdmin
      .from("bot_runs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", run.id);
  }
}

/* ------------------------------- Entry API -------------------------------- */
export async function processAutomation(evt: EventPayload, deps: EngineDeps) {
  // 1) Studio (workflow_versions)
  const studio = await loadStudioWorkflows();
  if (studio.length) {
    const studioWfs = studio.map(studioToRuntime);
    for (const wf of studioWfs) await runWorkflow(deps, wf, evt);
    return;
  }

  // 2) Legacy (bot_workflows)
  const legacy = await loadLegacyWorkflows();
  if (!legacy.length) return;
  for (const wf of legacy) await runWorkflow(deps, wf, evt);
}
