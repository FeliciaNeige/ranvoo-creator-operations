import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the RANVOO operations dashboard", async () => {
  const [page, layout, readme] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);

  assert.match(page, /<strong>RANVOO<\/strong>/);
  assert.match(page, /<span>Creator Ops<\/span>/);
  assert.match(page, /确认/);
  assert.match(page, /UGC/);
  assert.match(page, /牙医合作/);
  assert.match(page, /商业化红人/);
  assert.match(layout, /RANVOO Creator Operations/);
  assert.match(readme, /ranvoo-creator-operations/);
});

test("bundles an installable Codex skill", async () => {
  const [skill, workflow, routing, messages] = await Promise.all([
    readFile(
      new URL("skills/ranvoo-creator-operations/SKILL.md", root),
      "utf8",
    ),
    readFile(
      new URL(
        "skills/ranvoo-creator-operations/references/workflow-and-priorities.md",
        root,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "skills/ranvoo-creator-operations/references/routing-and-data.md",
        root,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "skills/ranvoo-creator-operations/references/message-library.md",
        root,
      ),
      "utf8",
    ),
  ]);

  assert.match(skill, /^---\nname: ranvoo-creator-operations/m);
  assert.match(skill, /explicit confirmation/i);
  assert.match(workflow, /3 full days/);
  assert.match(workflow, /30 days/);
  assert.match(routing, /UGC collaboration/);
  assert.match(messages, /Commercial creator message library/);
});
