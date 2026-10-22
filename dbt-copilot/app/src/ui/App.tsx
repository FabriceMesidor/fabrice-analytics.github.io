import { useEffect, useMemo, useState } from "react";
import bundle from "../data/harbor_lease.json";
import { loadProject, type Project } from "../engine/project";
import { healthReport } from "../engine/health";
import { probeApi } from "./api";
import Chat from "./Chat";
import Lineage from "./Lineage";
import ModelView from "./ModelView";
import Health from "./Health";
import Upload from "./Upload";

type Tab = "lineage" | "model" | "health";
const DEMO = loadProject(bundle as any);

export default function App() {
  const [project, setProject] = useState<Project>(DEMO);
  const [isDemo, setIsDemo] = useState(true);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lineage");
  const report = useMemo(() => healthReport(project), [project]);

  useEffect(() => { probeApi().then((r) => setAiAvailable(r.ai)); }, []);

  const select = (id: string) => { setSelected(id); setTab("model"); };
  const onAnswerFocus = (ids: string[]) => {
    setFocus(ids);
    if (ids.length) { setSelected(ids[0]); if (tab === "health") setTab("lineage"); }
  };
  const loadUploaded = (p: Project) => {
    setProject(p); setIsDemo(false); setFocus([]); setSelected(null); setTab("health");
  };
  const backToDemo = () => { setProject(DEMO); setIsDemo(true); setFocus([]); setSelected(null); setTab("lineage"); };

  const aiMode = isDemo && aiAvailable === true;
  const runDate = project.generatedAt ? new Date(project.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <div className="app">
      <header className="top">
        <a className="logo" href="https://fabrice-analytics.com">FM / dbt Copilot</a>
        <div className="projectline">
          <span className="chip mono">{project.name}</span>
          {project.dbtVersion && <span className="muted mono small">dbt {project.dbtVersion}</span>}
          {runDate && <span className="muted mono small">last run {runDate}</span>}
          <span className={`mode ${aiMode ? "ai" : "offline"}`} title={aiMode ? "Answers come from Claude calling read-only tools over the project" : "Answers come from the built-in rule engine; nothing leaves your browser"}>
            {aiAvailable === null ? "Connecting…" : aiMode ? "Claude + tools" : "Offline engine"}
          </span>
        </div>
        <nav className="toplinks">
          {!isDemo && <button className="linkbtn" onClick={backToDemo}>Back to demo project</button>}
          <Upload onLoad={loadUploaded} />
          <a href="https://fabrice-analytics.com/dbt-copilot.html">How it works</a>
        </nav>
      </header>

      <main className="grid">
        <section className="chatcol" aria-label="Chat">
          <Chat key={project.name + isDemo} project={project} aiMode={aiMode} isDemo={isDemo} onFocus={onAnswerFocus} onSelect={select} />
        </section>
        <section className="panel" aria-label="Project">
          <div className="tabs" role="tablist">
            {(["lineage", "model", "health"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === "lineage" ? "Lineage" : t === "model" ? "Model" : <>Health <span className="score mono">{report.score}</span></>}
              </button>
            ))}
          </div>
          <div className="tabbody">
            {tab === "lineage" && <Lineage project={project} focus={focus} selected={selected} report={report} onSelect={select} />}
            {tab === "model" && <ModelView project={project} id={selected} report={report} onSelect={select} />}
            {tab === "health" && <Health project={project} report={report} onSelect={select} />}
          </div>
        </section>
      </main>
    </div>
  );
}
