import { expect, it } from "vitest";
import { renderMarkdown } from "../src/ui/md";
const isNode = (n: string) => (n === "fct_leases" ? "model.x.fct_leases" : undefined);
it("escapes html and renders the subset", () => {
  const h = renderMarkdown("**Hi** <script>x</script>\n- `fct_leases` and `other`\n\n```sql\nselect 1 < 2\n```", isNode);
  expect(h).not.toMatch(/<script>/);
  expect(h).toMatch(/<strong>Hi<\/strong>/);
  expect(h).toMatch(/data-node="model.x.fct_leases"/);
  expect(h).toMatch(/<code>other<\/code>/);
  expect(h).toMatch(/<pre class="sql"><code>select 1 &lt; 2<\/code><\/pre>/);
});
