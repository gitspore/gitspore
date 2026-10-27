"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// The text of an issue as GitHub writes it: Markdown with GitHub's additions
// (task lists, tables, strikethrough, bare links). Raw HTML in the text, such
// as the comments of issue templates or <details>, is left out, so nothing
// from GitHub becomes markup on the page.

// Headings start one level below the popover's title (an h2).
const components: Components = {
  h1: ({ children }) => (
    <h3 className="text-ui-row font-semibold">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-ui-row font-semibold">{children}</h3>
  ),
  h3: ({ children }) => <h4 className="font-bold">{children}</h4>,
  h4: ({ children }) => <h5 className="font-bold">{children}</h5>,
  h5: ({ children }) => <h6 className="font-bold">{children}</h6>,
  h6: ({ children }) => <h6 className="font-bold">{children}</h6>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all text-line underline underline-offset-2"
    >
      {children}
    </a>
  ),
  // remark-gfm marks a task list with these classes; its items get a
  // checkbox instead of a bullet
  ul: ({ className, children }) => (
    <ul
      className={cn(
        "flex list-disc flex-col gap-1 pl-5",
        className?.includes("contains-task-list") && "list-none pl-0.5",
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>
  ),
  li: ({ className, children }) => (
    <li
      className={cn(
        "[&>ol]:mt-1 [&>ul]:mt-1",
        className?.includes("task-list-item") && "list-none",
      )}
    >
      {children}
    </li>
  ),
  input: ({ type, checked }) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        checked={checked ?? false}
        disabled
        className="mr-1.5 size-3.5 align-[-2px] accent-plate"
      />
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-2 border-l-4 border-panel-2 pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  // Inline code by default; inside a <pre> the block's own styles win
  code: ({ children }) => (
    <code className="rounded-sm bg-panel-2 px-1 font-mono text-[0.85em] [pre_&]:bg-transparent [pre_&]:p-0">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-panel-2 p-2.5 font-mono text-ui-small leading-snug">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-panel-2 px-2 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-panel-2 px-2 py-1">{children}</td>
  ),
  hr: () => <hr className="border-panel-2" />,
  img: ({ src, alt }) => (
    // Screenshots from GitHub; their size is unknown, so no next/image
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg" />
  ),
};

export function IssueBody({ body }: { body: string }) {
  if (body.trim() === "") {
    return <p className="text-muted-foreground italic">No description.</p>;
  }

  return (
    <div className="flex flex-col gap-2 break-words">
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {body}
      </Markdown>
    </div>
  );
}
