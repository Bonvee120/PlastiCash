"use client";

import { Bold, Eye, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Pencil, Quote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Markdown } from "@/components/content/markdown";
import { Field } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { createPost, deletePost, updatePost } from "@/lib/admin-actions";
import type { Post } from "@/lib/content-format";
import { photo, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

// Toolbar: Markdown to put around the selection (before, after, placeholder, start on a new line).
const TOOLS: { icon: typeof Bold; label: string; args: [string, string, string, boolean] }[] = [
  { icon: Heading2, label: "Heading", args: ["## ", "", "Heading", true] },
  { icon: Heading3, label: "Small heading", args: ["### ", "", "Heading", true] },
  { icon: Bold, label: "Bold", args: ["**", "**", "text", false] },
  { icon: Italic, label: "Italic", args: ["_", "_", "text", false] },
  { icon: Link2, label: "Link", args: ["[", "](https://)", "link text", false] },
  { icon: List, label: "Bulleted list", args: ["- ", "", "item", true] },
  { icon: ListOrdered, label: "Numbered list", args: ["1. ", "", "item", true] },
  { icon: Quote, label: "Quote", args: ["> ", "", "quote", true] },
];

// Blog editor: Markdown with a small toolbar (headings, bold, italic, link, lists, quote, image) and a live preview.
// The cover and in-text images upload straight to Cloudinary, like every other photo.
export function PostEditor({ post }: { post: Post | null }) {
  const router = useRouter();
  const body = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [byline, setByline] = useState(post?.byline ?? "");
  const [text, setText] = useState(post?.body_md ?? "");
  const [cover, setCover] = useState<string | null>(post?.cover_url ?? null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState<"cover" | "inline" | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const published = !!post?.published_at;
  const valid = title.trim().length >= 3 && excerpt.trim().length >= 10 && text.trim().length > 0;

  // Wrap the selection (or insert a placeholder) with Markdown, keeping the cursor where you'd expect.
  function wrap(before: string, after = "", placeholder = "text", lineStart = false) {
    const area = body.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const selected = value.slice(start, end) || placeholder;
    const prefix = lineStart && start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const next = value.slice(0, start) + prefix + before + selected + after + value.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      area.focus();
      const from = start + prefix.length + before.length;
      area.setSelectionRange(from, from + selected.length);
    });
  }

  async function upload(file: File | undefined, target: "cover" | "inline") {
    if (!file) return;
    setUploading(target);
    try {
      const url = await uploadPhoto(file, "blog");
      if (target === "cover") setCover(url);
      else wrap("![", `](${photo(url, 1400)})`, "Describe the photo");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function save(publish: boolean) {
    if (!valid) return toast.error("Add a title (3+ characters), a short summary (10+) and the text.");
    setSaving(true);
    const input = { title: title.trim(), excerpt: excerpt.trim(), byline: byline.trim() || null, body_md: text, cover_url: cover, publish };
    const result = post ? await updatePost(post.id, input) : await createPost(input);
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success(publish ? "Published. It's on the blog now." : post && published ? "Unpublished; it's a draft again." : "Draft saved.");
    if (!post) router.replace(`/ops-portal/blog/${result.data.id}`);
    else router.refresh();
  }

  async function remove() {
    if (!post) return;
    const result = await deletePost(post.id);
    if (!result.ok) return toast.error(result.error.message);
    toast.success("Post deleted.");
    router.replace("/ops-portal/blog");
  }


  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <Field id="title" label="Title">
          <Input id="title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className="text-lg font-bold" />
        </Field>
        <Field id="byline" label="Author name" hint="The writer readers see on the post. Leave empty to use your account name.">
          <Input id="byline" value={byline} maxLength={80} placeholder="e.g. Ngozi Eze" onChange={(e) => setByline(e.target.value)} />
        </Field>
        <Field id="excerpt" label="Summary" hint="One or two sentences, shown on the cards and in search results.">
          <textarea
            id="excerpt"
            value={excerpt}
            maxLength={300}
            rows={2}
            onChange={(e) => setExcerpt(e.target.value)}
            className="rounded-input border border-input bg-card px-3.5 py-2.5 text-base outline-none focus-visible:border-2 focus-visible:border-primary"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
              {TOOLS.map(({ icon: Icon, label, args }) => (
                <ToolButton key={label} label={label} onClick={() => wrap(...args)} disabled={tab !== "write"}>
                  <Icon className="size-4" aria-hidden />
                </ToolButton>
              ))}
              <label className={cn("grid size-9 cursor-pointer place-items-center rounded-lg text-ink hover:bg-mist", tab !== "write" && "pointer-events-none opacity-40")} title="Add a photo">
                {uploading === "inline" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
                <span className="sr-only">Add a photo</span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0], "inline")} />
              </label>
            </div>
            <div className="flex rounded-lg bg-muted p-0.5 text-sm font-semibold" role="tablist">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5", tab === t ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}
                >
                  {t === "write" ? <Pencil className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                  {t === "write" ? "Write" : "Preview"}
                </button>
              ))}
            </div>
          </div>
          {tab === "write" ? (
            <textarea
              ref={body}
              aria-label="Post text (Markdown)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={22}
              placeholder={"Write here. Use the buttons above, or Markdown:\n\n## A heading\n\nA paragraph with **bold** and a [link](https://example.com).\n\n- a list item"}
              className="tabular min-h-[420px] rounded-input border border-input bg-card px-4 py-3 text-[15px] leading-relaxed outline-none focus-visible:border-2 focus-visible:border-primary"
            />
          ) : (
            <div className="min-h-[420px] rounded-input border border-border px-5 py-2">
              {text.trim() ? <Markdown source={text} /> : <p className="py-4 text-muted-foreground">Nothing to preview yet.</p>}
            </div>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 xl:sticky xl:top-6">
        <div>
          <span className="eyebrow text-muted-foreground">Status</span>
          <p className={cn("mt-1 font-bold", published ? "text-primary" : "text-warn")}>{published ? "Published" : "Draft"}</p>
          {post && published && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline underline-offset-2">
              View on the site
            </a>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Cover photo</span>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized WebP
            <img src={photo(cover, 640)} alt="" className="aspect-[16/9] w-full rounded-xl object-cover" />
          )}
          <div className="flex gap-2">
            <label className="d-btn d-btn-outline d-btn-sm flex-1 cursor-pointer">
              {uploading === "cover" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              {cover ? "Change" : "Upload"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0], "cover")} />
            </label>
            {cover && (
              <Btn variant="ghost" size="sm" onClick={() => setCover(null)}>
                Remove
              </Btn>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-subtle pt-4">
          <Btn variant="primary" block disabled={saving || !!uploading} onClick={() => save(true)}>
            {saving ? "Saving…" : published ? "Update" : "Publish"}
          </Btn>
          <Btn variant="outline" block disabled={saving || !!uploading} onClick={() => save(false)}>
            {published ? "Unpublish (back to draft)" : "Save draft"}
          </Btn>
          {post && (
            <Btn variant="ghost" block onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </Btn>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this post?"
        description="It disappears from the blog and can't be brought back."
        confirmLabel="Delete post"
        tone="danger"
        onConfirm={remove}
      />
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg text-ink hover:bg-mist disabled:opacity-40"
    >
      {children}
    </button>
  );
}
