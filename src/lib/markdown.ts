export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "del"; children: InlineNode[] }
  | { type: "link"; label: InlineNode[]; href: string };

export interface ListItemNode {
  content: InlineNode[];
  children: MarkdownBlock[];
}

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "blockquote"; blocks: MarkdownBlock[] }
  | { type: "code"; lang: string; value: string }
  | { type: "list"; ordered: boolean; items: ListItemNode[] }
  | { type: "table"; headers: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "hr" };

function isSafeHttpUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https?:\/\/[^\s<>]+$/i.test(trimmed);
}

/**
 * Parse inline Markdown syntax into an AST without dangerouslySetInnerHTML.
 * Handles inline code (highest precedence so * / _ inside backticks stay intact),
 * links, autolinks, bold, strikethrough, and italic.
 */
export function parseInlineMarkdown(input: string, depth = 0): InlineNode[] {
  if (!input) return [];
  if (depth > 6) return [{ type: "text", value: input }];

  const nodes: InlineNode[] = [];
  let i = 0;
  let textBuf = "";

  const flushText = () => {
    if (textBuf) {
      nodes.push({ type: "text", value: textBuf });
      textBuf = "";
    }
  };

  while (i < input.length) {
    // Escaped markdown punctuation: \* \_ \` \[ \] \\
    if (input[i] === "\\" && i + 1 < input.length && /[\\`*_{}[\]()#+\-.!~|>]/.test(input[i + 1])) {
      textBuf += input[i + 1];
      i += 2;
      continue;
    }

    // Inline code: `...` or ``...``
    if (input[i] === "`") {
      let tickCount = 1;
      while (input[i + tickCount] === "`") tickCount++;
      const fence = "`".repeat(tickCount);
      const closeIdx = input.indexOf(fence, i + tickCount);
      if (closeIdx !== -1) {
        flushText();
        const rawCode = input.slice(i + tickCount, closeIdx);
        // CommonMark trims one leading & trailing space if both exist and content isn't all spaces
        const trimmedCode =
          rawCode.length >= 2 &&
          rawCode.startsWith(" ") &&
          rawCode.endsWith(" ") &&
          rawCode.trim().length > 0
            ? rawCode.slice(1, -1)
            : rawCode;
        nodes.push({ type: "code", value: trimmedCode });
        i = closeIdx + tickCount;
        continue;
      }
    }

    // Markdown link: [label](https://...)
    if (input[i] === "[") {
      const closeBracket = findMatchingBracket(input, i);
      if (closeBracket !== -1 && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const labelRaw = input.slice(i + 1, closeBracket);
          const hrefRaw = input.slice(closeBracket + 2, closeParen).trim();
          if (isSafeHttpUrl(hrefRaw)) {
            flushText();
            nodes.push({
              type: "link",
              label: parseInlineMarkdown(labelRaw, depth + 1),
              href: hrefRaw,
            });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Bold: **...** or __...__
    if (
      (input[i] === "*" && input[i + 1] === "*") ||
      (input[i] === "_" && input[i + 1] === "_")
    ) {
      const marker = input.slice(i, i + 2);
      const closeIdx = findClosingDelimiter(input, marker, i + 2);
      if (closeIdx !== -1 && closeIdx > i + 2) {
        flushText();
        const inner = input.slice(i + 2, closeIdx);
        nodes.push({
          type: "strong",
          children: parseInlineMarkdown(inner, depth + 1),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    // Strikethrough: ~~...~~
    if (input[i] === "~" && input[i + 1] === "~") {
      const closeIdx = findClosingDelimiter(input, "~~", i + 2);
      if (closeIdx !== -1 && closeIdx > i + 2) {
        flushText();
        const inner = input.slice(i + 2, closeIdx);
        nodes.push({
          type: "del",
          children: parseInlineMarkdown(inner, depth + 1),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    // Italic: *...* (avoid matching spaces right after opening * or inside words with _)
    if (input[i] === "*" && input[i + 1] !== "*" && input[i + 1] !== " ") {
      const closeIdx = findClosingSingleAsterisk(input, i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        flushText();
        const inner = input.slice(i + 1, closeIdx);
        nodes.push({
          type: "em",
          children: parseInlineMarkdown(inner, depth + 1),
        });
        i = closeIdx + 1;
        continue;
      }
    }

    // Bare autolink: https://... or http://...
    if (
      (input.startsWith("https://", i) || input.startsWith("http://", i)) &&
      (i === 0 || /[\s(（【「“:：]/.test(input[i - 1]))
    ) {
      const slice = input.slice(i);
      const match = slice.match(/^https?:\/\/[^\s<>)）\]】」”]+/);
      if (match) {
        const cleaned = match[0].replace(/[.,;!?，。；！？]+$/, "");
        if (isSafeHttpUrl(cleaned)) {
          flushText();
          nodes.push({
            type: "link",
            label: [{ type: "text", value: cleaned }],
            href: cleaned,
          });
          i += cleaned.length;
          continue;
        }
      }
    }

    textBuf += input[i];
    i++;
  }

  flushText();
  return nodes;
}

function findMatchingBracket(str: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
      continue;
    }
    if (str[i] === "`") {
      const end = str.indexOf("`", i + 1);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    if (str[i] === "[") depth++;
    else if (str[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findClosingDelimiter(str: string, marker: string, startIdx: number): number {
  let i = startIdx;
  while (i < str.length) {
    if (str[i] === "\\") {
      i += 2;
      continue;
    }
    if (str[i] === "`") {
      const end = str.indexOf("`", i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (str.startsWith(marker, i)) {
      return i;
    }
    i++;
  }
  return -1;
}

function findClosingSingleAsterisk(str: string, startIdx: number): number {
  let i = startIdx;
  while (i < str.length) {
    if (str[i] === "\\") {
      i += 2;
      continue;
    }
    if (str[i] === "`") {
      const end = str.indexOf("`", i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (str[i] === "*" && str[i + 1] !== "*" && str[i - 1] !== " ") {
      return i;
    }
    i++;
  }
  return -1;
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:-\s*-\s*-[-\s]*|\*\s*\*\s*\*[\*\s]*|_\s*_\s*_[_\s]*)$/.test(line);
}

function parseHeading(line: string): { level: 1 | 2 | 3 | 4; text: string } | null {
  const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!m) return null;
  const level = Math.min(4, Math.max(1, m[1].length)) as 1 | 2 | 3 | 4;
  return { level, text: m[2] };
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") && !trimmed.includes("-")) return false;
  const stripped = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = stripped.split("|").map((c) => c.trim());
  return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function matchListItem(line: string): {
  indent: number;
  ordered: boolean;
  text: string;
} | null {
  const unordered = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (unordered) {
    return {
      indent: unordered[1].replace(/\t/g, "  ").length,
      ordered: false,
      text: unordered[2],
    };
  }
  const ordered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
  if (ordered) {
    return {
      indent: ordered[1].replace(/\t/g, "  ").length,
      ordered: true,
      text: ordered[2],
    };
  }
  return null;
}

function isBlockBoundary(line: string, nextLine?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\s{0,3}```/.test(line)) return true;
  if (parseHeading(line)) return true;
  if (isHorizontalRule(line)) return true;
  if (/^\s{0,3}>\s?/.test(line)) return true;
  if (matchListItem(line)) return true;
  if (line.includes("|") && nextLine && isTableSeparator(nextLine)) return true;
  return false;
}

/**
 * Parse Markdown text into structured blocks (headings, paragraphs, lists with
 * nested blocks/blockquotes, blockquotes, fenced code blocks, tables, hr).
 */
export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
    if (fenceMatch) {
      const fenceChar = fenceMatch[1][0];
      const fenceLen = fenceMatch[1].length;
      const lang = fenceMatch[2] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const closeRe = new RegExp(`^\\s{0,3}${fenceChar}{${fenceLen},}\\s*$`);
        if (closeRe.test(lines[i])) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang, value: codeLines.join("\n") });
      continue;
    }

    // Heading
    const heading = parseHeading(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading.level,
        children: parseInlineMarkdown(heading.text),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (isHorizontalRule(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote
    if (/^\s{0,3}>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        blocks: parseMarkdownBlocks(quoteLines.join("\n")),
      });
      continue;
    }

    // GFM Table
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableRow(line);
      i += 2;
      const rowData: InlineNode[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitTableRow(lines[i]);
        rowData.push(cells.map((c) => parseInlineMarkdown(c)));
        i++;
      }
      blocks.push({
        type: "table",
        headers: headerCells.map((c) => parseInlineMarkdown(c)),
        rows: rowData,
      });
      continue;
    }

    // Ordered / Unordered List (supports indented nested blockquotes, sublists, code blocks)
    const firstItem = matchListItem(line);
    if (firstItem) {
      const baseIndent = firstItem.indent;
      const ordered = firstItem.ordered;
      const items: ListItemNode[] = [];

      while (i < lines.length) {
        const curItem = matchListItem(lines[i]);
        if (!curItem || curItem.indent !== baseIndent || curItem.ordered !== ordered) {
          break;
        }

        const itemTextLines: string[] = [curItem.text];
        const nestedLines: string[] = [];
        i++;

        while (i < lines.length) {
          const nextLine = lines[i];
          const nextTrimmed = nextLine.trim();

          if (!nextTrimmed) {
            // Look ahead: if next non-empty line is indented nested content, keep going
            let peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length) {
              const peekIndent = lines[peek].match(/^(\s*)/)?.[1].replace(/\t/g, "  ").length ?? 0;
              if (peekIndent > baseIndent) {
                nestedLines.push("");
                i++;
                continue;
              }
            }
            // Also check if another same-level list item immediately follows blank line
            if (peek < lines.length) {
              const peekItem = matchListItem(lines[peek]);
              if (peekItem && peekItem.indent === baseIndent && peekItem.ordered === ordered) {
                i = peek;
              }
            }
            break;
          }

          const nextItem = matchListItem(nextLine);
          if (nextItem && nextItem.indent <= baseIndent) {
            break;
          }

          const lineIndent = nextLine.match(/^(\s*)/)?.[1].replace(/\t/g, "  ").length ?? 0;
          if (lineIndent > baseIndent) {
            const stripped = nextLine.replace(/\t/g, "  ").slice(Math.min(lineIndent, baseIndent + 2));
            // Check if this indented line starts a nested block (blockquote, sublist, code fence)
            if (
              nestedLines.length > 0 ||
              /^\s*>\s?/.test(stripped) ||
              matchListItem(stripped) !== null ||
              /^\s*```/.test(stripped)
            ) {
              nestedLines.push(stripped);
            } else {
              itemTextLines.push(nextTrimmed);
            }
            i++;
            continue;
          }

          // Non-indented boundary ends the list
          if (isBlockBoundary(nextLine, lines[i + 1])) {
            break;
          }

          itemTextLines.push(nextTrimmed);
          i++;
        }

        items.push({
          content: parseInlineMarkdown(itemTextLines.join(" ")),
          children: nestedLines.length > 0 ? parseMarkdownBlocks(nestedLines.join("\n")) : [],
        });
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: collect contiguous non-boundary lines
    const paraLines: string[] = [trimmed];
    i++;
    while (i < lines.length && !isBlockBoundary(lines[i], lines[i + 1])) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({
      type: "paragraph",
      children: parseInlineMarkdown(paraLines.join("\n")),
    });
  }

  return blocks;
}
