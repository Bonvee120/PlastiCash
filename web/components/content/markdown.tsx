import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

// Blog Markdown, styled to the brand. Raw HTML in a post is not rendered (react-markdown's default), so an admin
// can't put scripts or iframes on the public site by accident or otherwise. External links open in a new tab.
const components: Components = {
  h2: ({ children }) => <h2 className="mt-10 mb-3 text-2xl font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 mb-2 text-xl font-bold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-6 mb-2 text-lg font-bold">{children}</h4>,
  p: ({ children }) => <p className="my-4 leading-relaxed">{children}</p>,
  a: ({ href, children }) => {
    const external = href ? /^https?:\/\//.test(href) : false;
    return (
      <a href={href} className="font-semibold text-primary underline underline-offset-2" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },
  ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-6 border-l-4 border-primary bg-mist px-5 py-3 text-primary-ink">{children}</blockquote>,
  code: ({ children }) => <code className="tabular rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>,
  hr: () => <hr className="my-8 border-border" />,
  img: ({ src, alt }) =>
    // eslint-disable-next-line @next/next/no-img-element -- remote images in posts; sized by CSS
    typeof src === "string" ? <img src={src} alt={alt ?? ""} className="my-6 w-full rounded-2xl" loading="lazy" /> : null,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-subtle px-3 py-2">{children}</td>,
};

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("text-[17px] text-ink", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
