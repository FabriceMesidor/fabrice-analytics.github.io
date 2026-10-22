import { useEffect, useRef, useState } from "react";
import type { Project } from "../engine/project";
import { resolveNode } from "../engine/project";
import { answerOffline } from "../engine/offline";
import { askApi, ApiError } from "./api";
import { renderMarkdown } from "./md";

interface Msg {
  role: "user" | "assistant";
  content: string;
  mode?: "ai" | "offline";
  trace?: { tool: string; input: Record<string, unknown>; ok?: boolean }[];
  note?: string;
  model?: string;
}

const DEMO_QUESTIONS = [
  "What feeds the delinquency mart?",
  "What breaks if I change stg_harbor__payments?",
  "Can I trust the executive dashboard?",
  "What are the biggest health issues?",
  "Explain how payment_status is calculated",
  "Which models have no tests?",
];
const UPLOAD_QUESTIONS = ["What are the biggest health issues?", "Which models have no tests?", "Which models have no description?", "list the marts"];

export default function Chat({ project, aiMode, isDemo, onFocus, onSelect }: {
  project: Project; aiMode: boolean; isDemo: boolean; onFocus: (ids: string[]) => void; onSelect: (id: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  const isNode = (name: string) => resolveNodeExact(project, name);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = [...msgs, { role: "user" as const, content: q }];
    setMsgs(history);
    setBusy(true);
    try {
      if (aiMode) {
        ctl.current = new AbortController();
        try {
          const a = await askApi(history.map(({ role, content }) => ({ role, content })), ctl.current.signal);
          setMsgs([...history, { role: "assistant", content: a.text, mode: "ai", trace: a.trace, model: a.model }]);
          onFocus(a.focus);
          return;
        } catch (e) {
          if (e instanceof ApiError && e.code === "cancelled") { setMsgs([...history, { role: "assistant", content: "Stopped.", mode: "ai" }]); return; }
          const off = answerOffline(project, q);
          setMsgs([...history, { role: "assistant", content: off.text, mode: "offline", trace: off.trace,
            note: `${e instanceof ApiError ? e.message : "The AI service failed."} Answered by the offline engine instead.` }]);
          onFocus(off.focus);
          return;
        }
      }
      const off = answerOffline(project, q);
      await new Promise((r) => setTimeout(r, 250));
      setMsgs([...history, { role: "assistant", content: off.text, mode: "offline", trace: off.trace }]);
      onFocus(off.focus);
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  }

  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-node]") as HTMLElement | null;
    if (el?.dataset.node) onSelect(el.dataset.node);
  };

  const questions = isDemo ? DEMO_QUESTIONS : UPLOAD_QUESTIONS;

  return (
    <div className="chat" onClick={onClick}>
      <div className="msgs">
        {!msgs.length && (
          <div className="welcome">
            <p className="eyebrow mono">Ask your dbt project</p>
            <h1>Lineage, logic and health, in plain English.</h1>
            <p className="muted">
              {isDemo
                ? <>This demo runs on <b>Harbor Lease</b>, a fictional property-management dbt project with 20 models, 37 tests and a few planted problems. {aiMode ? "Claude answers by calling read-only tools over the real dbt artifacts." : "Answers come from the built-in engine reading the real dbt artifacts."}</>
                : <>Your manifest is loaded in this browser only. Nothing is uploaded; answers come from the offline engine.</>}
            </p>
            <div className="suggest">
              {questions.map((q) => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "user" ? <p>{m.content}</p> : (
              <>
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content, isNode) }} />
                {m.note && <p className="note">{m.note}</p>}
                {!!m.trace?.length && (
                  <details className="trace">
                    <summary className="mono">{m.mode === "ai" ? `Claude${m.model ? ` (${m.model})` : ""}` : "Offline engine"} · {m.trace.length} lookup{m.trace.length > 1 ? "s" : ""}</summary>
                    <ol>{m.trace.map((t, j) => <li key={j} className="mono">{t.ok === false ? "✕ " : ""}{t.tool}({fmtInput(t.input)})</li>)}</ol>
                  </details>
                )}
              </>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant thinking"><span className="dot" /><span className="dot" /><span className="dot" /> <span className="muted small">{aiMode ? "Claude is reading the project…" : "Looking it up…"}</span></div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <label htmlFor="q" className="sr">Question</label>
        <input id="q" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a model, its lineage or its health" autoComplete="off" maxLength={1000} />
        {busy && aiMode ? <button type="button" className="btn ghost" onClick={() => ctl.current?.abort()}>Stop</button>
          : <button type="submit" className="btn" disabled={!input.trim() || busy}>Ask</button>}
      </form>
    </div>
  );
}

const fmtInput = (o: Record<string, unknown>) => Object.values(o).map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");

function resolveNodeExact(p: Project, name: string): string | undefined {
  const n = p.byName.get(name.toLowerCase());
  if (n) return n.id;
  const r = /^[a-z0-9_.]+$/i.test(name) ? resolveNode(p, name) : undefined;
  return r && r.name.toLowerCase().endsWith(name.toLowerCase()) ? r.id : undefined;
}
