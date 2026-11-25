import React, { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import {
  parseMarkdownBlocks,
  type InlineNode,
  type MarkdownBlock,
} from "@/lib/markdown";

interface MarkdownNotesProps {
  content: string;
  compact?: boolean;
  className?: string;
}

function handleExternalLink(href: string) {
  openUrl(href).catch(() => {
    window.open(href, "_blank", "noopener,noreferrer");
  });
}

function renderInlineNodes(nodes: InlineNode[], compact: boolean): React.ReactNode {
  return nodes.map((node, idx) => {
    switch (node.type) {
      case "text": {
        if (!node.value.includes("\n")) {
          return <React.Fragment key={idx}>{node.value}</React.Fragment>;
        }
        const parts = node.value.split("\n");
        return (
          <React.Fragment key={idx}>
            {parts.map((part, pIdx) => (
              <React.Fragment key={pIdx}>
                {part}
                {pIdx < parts.length - 1 && <br />}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      }
      case "code":
        return (
          <code
            key={idx}
            className={
              compact
                ? "px-1 py-0.5 mx-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.09] text-zinc-800 dark:text-zinc-200 font-mono text-[10.5px] break-all"
                : "px-1.5 py-0.5 mx-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-800 dark:text-zinc-200 font-mono text-[11px] break-all"
            }
          >
            {node.value}
          </code>
        );
      case "strong":
        return (
          <strong key={idx} className="font-semibold text-zinc-900 dark:text-zinc-100">
            {renderInlineNodes(node.children, compact)}
          </strong>
        );
      case "em":
        return (
          <em key={idx} className="italic text-zinc-700 dark:text-zinc-300">
            {renderInlineNodes(node.children, compact)}
          </em>
        );
      case "del":
        return (
          <del key={idx} className="line-through text-zinc-400 dark:text-zinc-500">
            {renderInlineNodes(node.children, compact)}
          </del>
        );
      case "link":
        return (
          <button
            key={idx}
            type="button"
            onClick={() => handleExternalLink(node.href)}
            title={node.href}
            className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 underline decoration-sky-500/35 underline-offset-2 transition break-all text-left"
          >
            <span>{renderInlineNodes(node.label, compact)}</span>
            {!compact && <ExternalLink className="h-2.5 w-2.5 inline shrink-0 opacity-75" />}
          </button>
        );
    }
  });
}

function renderBlocks(
  blocks: MarkdownBlock[],
  compact: boolean,
  nested = false
): React.ReactNode {
  return blocks.map((block, idx) => {
    switch (block.type) {
      case "heading": {
        const headingCls = compact
          ? "text-[11.5px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight pt-1 first:pt-0"
          : block.level === 1
            ? "text-[14px] font-semibold text-zinc-950 dark:text-white tracking-tight pt-2 first:pt-0 pb-1 border-b border-zinc-200/70 dark:border-white/[0.07]"
            : block.level === 2
              ? "text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight pt-2 first:pt-0 flex items-center gap-1.5"
              : "text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight pt-1.5 first:pt-0";
        return (
          <div key={idx} className={headingCls}>
            {!compact && block.level === 2 && (
              <span className="h-3 w-[3px] rounded-full bg-zinc-400/70 dark:bg-zinc-500/80 shrink-0" />
            )}
            <span>{renderInlineNodes(block.children, compact)}</span>
          </div>
        );
      }

      case "paragraph":
        return (
          <p
            key={idx}
            className={
              compact
                ? "text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300"
                : "text-xs leading-[1.7] text-zinc-600 dark:text-zinc-300"
            }
          >
            {renderInlineNodes(block.children, compact)}
          </p>
        );

      case "blockquote":
        return (
          <blockquote
            key={idx}
            className={
              compact
                ? "border-l-2 border-zinc-300 dark:border-zinc-600 pl-2.5 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1"
                : "border-l-2 border-zinc-300 dark:border-zinc-600 bg-zinc-100/60 dark:bg-white/[0.03] rounded-r-lg pl-3 pr-3 py-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 space-y-1.5"
            }
          >
            {renderBlocks(block.blocks, compact, true)}
          </blockquote>
        );

      case "code":
        return (
          <pre
            key={idx}
            className={
              compact
                ? "rounded-lg bg-zinc-900/95 dark:bg-black/50 text-zinc-100 px-2.5 py-1.5 font-mono text-[10.5px] overflow-x-auto"
                : "rounded-lg bg-zinc-900 dark:bg-black/45 border border-zinc-800/80 dark:border-white/[0.08] text-zinc-100 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed overflow-x-auto"
            }
          >
            <code>{block.value}</code>
          </pre>
        );

      case "hr":
        return (
          <hr
            key={idx}
            className="border-0 border-t border-zinc-200/80 dark:border-white/[0.08] my-2"
          />
        );

      case "list": {
        const ListTag = block.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={idx}
            className={
              block.ordered
                ? compact
                  ? "list-decimal pl-4 space-y-1 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300"
                  : "list-decimal pl-4 space-y-1.5 text-xs leading-[1.65] text-zinc-600 dark:text-zinc-300"
                : compact
                  ? "space-y-1 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300"
                  : "space-y-1.5 text-xs leading-[1.65] text-zinc-600 dark:text-zinc-300"
            }
          >
            {block.items.map((item, itemIdx) => (
              <li
                key={itemIdx}
                className={
                  block.ordered
                    ? "space-y-1.5 pl-0.5"
                    : "relative pl-3.5 space-y-1.5"
                }
              >
                {!block.ordered && (
                  <span
                    className={`absolute left-0 rounded-full bg-zinc-400 dark:bg-zinc-500 ${
                      compact
                        ? "top-[7px] h-1 w-1"
                        : nested
                          ? "top-[8px] h-1 w-1"
                          : "top-[7.5px] h-1.5 w-1.5"
                    }`}
                  />
                )}
                <div>{renderInlineNodes(item.content, compact)}</div>
                {item.children.length > 0 && (
                  <div className="space-y-1.5 pt-0.5">
                    {renderBlocks(item.children, compact, true)}
                  </div>
                )}
              </li>
            ))}
          </ListTag>
        );
      }

      case "table":
        return (
          <div
            key={idx}
            className="overflow-x-auto rounded-lg border border-zinc-200/80 dark:border-white/[0.08]"
          >
            <table className="w-full text-left border-collapse text-[11.5px]">
              <thead className="bg-zinc-100/80 dark:bg-white/[0.04] border-b border-zinc-200/80 dark:border-white/[0.08]">
                <tr>
                  {block.headers.map((cell, cIdx) => (
                    <th
                      key={cIdx}
                      className="px-2.5 py-1.5 font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      {renderInlineNodes(cell, compact)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                {block.rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-2.5 py-1.5 text-zinc-600 dark:text-zinc-300"
                      >
                        {renderInlineNodes(cell, compact)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

export const MarkdownNotes: React.FC<MarkdownNotesProps> = ({
  content,
  compact = false,
  className = "",
}) => {
  const blocks = useMemo(() => parseMarkdownBlocks(content.trim()), [content]);

  if (blocks.length === 0) return null;

  return (
    <div
      className={`${compact ? "space-y-1.5" : "space-y-2.5"} ${className}`.trim()}
    >
      {renderBlocks(blocks, compact)}
    </div>
  );
};
