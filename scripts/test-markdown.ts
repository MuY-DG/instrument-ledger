import assert from "node:assert/strict";
import { parseInlineMarkdown, parseMarkdownBlocks } from "../src/lib/markdown";

const sampleReleaseNotes = `
## 本次更新内容

- **优化检查更新界面**：支持完整渲染 Markdown 更新日志，移除紫色外边框并统一极简精密视觉风格。
- **精简 Release 说明**：发布内容不再附带冗长的 \`SHA-256\` 校验值。

## 安装包下载说明

- **macOS（Apple Silicon M 系列 & Intel 通用）**：下载 \`*_universal.dmg\`，双击挂载后将应用拖入「应用程序」文件夹。
  > 若首次打开提示「无法验证开发者」或「已损坏」，可在终端执行一次 \`xattr -cr /Applications/InstrumentLedger.app\` 后正常启动。
- **Windows（64 位）**：下载 \`*_x64-setup.exe\` 安装包直接双击安装，详见 [发布页](https://github.com/MuY-DG/instrument-ledger/releases)。

\`\`\`bash
xattr -cr /Applications/InstrumentLedger.app
\`\`\`
`;

const blocks = parseMarkdownBlocks(sampleReleaseNotes);

assert.equal(blocks[0].type, "heading");
if (blocks[0].type === "heading") {
  assert.equal(blocks[0].level, 2);
}

assert.equal(blocks[1].type, "list");
if (blocks[1].type === "list") {
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items.length, 2);
}

assert.equal(blocks[2].type, "heading");
assert.equal(blocks[3].type, "list");
if (blocks[3].type === "list") {
  assert.equal(blocks[3].items.length, 2);
  // First item must keep `*_universal.dmg` as inline code without breaking on * or _
  const hasDmgCode = blocks[3].items[0].content.some(
    (n) => n.type === "code" && n.value === "*_universal.dmg"
  );
  assert.ok(hasDmgCode, "Expected *_universal.dmg to parse as inline code");
  // Nested blockquote inside list item
  assert.equal(blocks[3].items[0].children.length, 1);
  assert.equal(blocks[3].items[0].children[0].type, "blockquote");
  // Link inside second item
  const hasLink = blocks[3].items[1].content.some(
    (n) =>
      n.type === "link" &&
      n.href === "https://github.com/MuY-DG/instrument-ledger/releases"
  );
  assert.ok(hasLink, "Expected markdown link in second list item");
}

assert.equal(blocks[4].type, "code");
if (blocks[4].type === "code") {
  assert.equal(blocks[4].lang, "bash");
  assert.equal(blocks[4].value, "xattr -cr /Applications/InstrumentLedger.app");
}

// Security check: javascript: links must NOT become clickable links
const unsafe = parseInlineMarkdown("[click](javascript:alert(1))");
assert.ok(
  unsafe.every((n) => n.type !== "link"),
  "javascript: URLs must not parse as links"
);

// Inline emphasis + strikethrough + autolink
const rich = parseInlineMarkdown(
  "支持 **粗体**、*斜体*、~~删除线~~ 与 https://github.com/MuY-DG/instrument-ledger"
);
assert.ok(rich.some((n) => n.type === "strong"));
assert.ok(rich.some((n) => n.type === "em"));
assert.ok(rich.some((n) => n.type === "del"));
assert.ok(
  rich.some(
    (n) =>
      n.type === "link" &&
      n.href === "https://github.com/MuY-DG/instrument-ledger"
  )
);

console.log("Markdown parser checks passed!");
