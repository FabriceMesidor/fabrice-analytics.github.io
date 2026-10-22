import { useRef, useState } from "react";
import { loadProject, type Project } from "../engine/project";

/** Reads manifest.json (and optionally run_results.json) locally. Nothing is uploaded anywhere. */
export default function Upload({ onLoad }: { onLoad: (p: Project) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");

  async function handle(files: FileList | null) {
    setErr("");
    if (!files?.length) return;
    try {
      let manifest: any = null, runResults: any = null;
      for (const f of Array.from(files)) {
        const j = JSON.parse(await f.text());
        if (j.nodes && j.metadata) manifest = j;
        else if (Array.isArray(j.results)) runResults = j;
        else if (j.manifest?.nodes) { manifest = j.manifest; runResults = j.run_results ?? runResults; }
      }
      if (!manifest) throw new Error("Pick your target/manifest.json (and optionally run_results.json).");
      onLoad(loadProject(manifest, runResults));
    } catch (e) {
      setErr(e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message);
    } finally {
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <button type="button" className="linkbtn" onClick={() => ref.current?.click()} title="Reads target/manifest.json and run_results.json in your browser only">
        Load your manifest
      </button>
      <input ref={ref} id="manifest-file" type="file" accept=".json,application/json" multiple hidden onChange={(e) => handle(e.target.files)} />
      {err && <span className="uploaderr small" role="alert">{err}</span>}
    </>
  );
}
