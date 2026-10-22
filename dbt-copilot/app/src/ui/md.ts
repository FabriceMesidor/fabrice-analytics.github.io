// Tiny, safe markdown subset for answers: paragraphs, "- " bullets, **bold**, *italic*, `code`.
// Inline code that names a known node becomes a clickable chip (data-node attribute).
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function inline(s: string, isNode: (name: string) => string | undefined): string {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, (_, code: string) => {
    const id = isNode(code.replace(/&amp;/g, "&"));
    return id ? `<button type="button" class="nodechip" data-node="${esc(id)}">${code}</button>` : `<code>${code}</code>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return out;
}

export function renderMarkdown(text: string, isNode: (name: string) => string | undefined): string {
  const blocks: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => { if (list.length) { blocks.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`); list = []; } };
  const flushPara = () => { if (para.length) { blocks.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  let code: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      if (code) { blocks.push(`<pre class="sql"><code>${esc(code.join("\n"))}</code></pre>`); code = null; }
      else { flushList(); flushPara(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }
    const m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (m) { flushPara(); list.push(inline(m[1], isNode)); continue; }
    if (!line.trim()) { flushList(); flushPara(); continue; }
    flushList();
    para.push(inline(line.replace(/^#+\s*/, ""), isNode));
  }
  if (code) blocks.push(`<pre class="sql"><code>${esc(code.join("\n"))}</code></pre>`);
  flushList(); flushPara();
  return blocks.join("");
}
