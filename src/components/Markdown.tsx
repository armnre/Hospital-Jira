import { marked } from "marked";

/** Renders trusted repository Markdown (docs/*.md) to HTML. */
export function Markdown({ source }: { source: string }) {
  const html = marked.parse(source, { async: false, gfm: true }) as string;
  return <article className="prose-hwdt" dangerouslySetInnerHTML={{ __html: html }} />;
}
