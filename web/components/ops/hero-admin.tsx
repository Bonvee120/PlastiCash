"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Field, useAdminAction } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { createSlide, deleteSlide, updateSlide } from "@/lib/admin-actions";
import type { HeroSlide } from "@/lib/content-format";
import { photo, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

// The landing hero carousel: upload a photo, write its headline, order and hide slides. Wide photos work best
// (they are cropped to 5:4 around the most important part). Real Enugu photos only (DESIGN_BRIEF.md §10).
export function HeroAdmin({ slides }: { slides: HeroSlide[] }) {
  const { pending, run } = useAdminAction();
  const [deleting, setDeleting] = useState<HeroSlide | null>(null);
  const del = useAdminAction({ onDone: () => setDeleting(null) });

  function move(i: number, dir: -1 | 1) {
    const a = slides[i]!;
    const b = slides[i + dir]!;
    // Swap positions (and make them distinct if they were equal).
    const pa = b.position === a.position ? a.position + dir : b.position;
    const pb = a.position;
    void run(async () => {
      const first = await updateSlide(a.id, { position: Math.max(pa, 0) });
      if (!first.ok) return first;
      return updateSlide(b.id, { position: pb });
    }, "Order saved.");
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
      <section className="flex flex-col gap-3">
        {slides.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            No photos yet. The landing page shows three brand slides until you add some.
          </p>
        ) : (
          slides.map((s, i) => (
            <article key={s.id} className={cn("flex gap-4 rounded-2xl border border-border bg-card p-3", !s.active && "opacity-60")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized WebP */}
              <img src={photo(s.image_url, 320)} alt="" className="aspect-[5/4] w-32 shrink-0 rounded-xl object-cover" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <b className="truncate">{s.headline}</b>
                {s.subline && <span className="truncate text-sm text-muted-foreground">{s.subline}</span>}
                <span className="text-xs text-muted-foreground">
                  {s.active ? `Slide ${slides.filter((x) => x.active).indexOf(s) + 1}` : "Hidden"}
                </span>
                <div className="mt-auto flex flex-wrap gap-1">
                  <Btn variant="ghost" size="sm" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="size-4" aria-hidden />
                  </Btn>
                  <Btn variant="ghost" size="sm" disabled={pending || i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="size-4" aria-hidden />
                  </Btn>
                  <Btn
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => updateSlide(s.id, { active: !s.active }), s.active ? "Slide hidden." : "Slide shown.")}
                  >
                    {s.active ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    {s.active ? "Hide" : "Show"}
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setDeleting(s)} aria-label="Delete slide">
                    <Trash2 className="size-4" aria-hidden />
                  </Btn>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
      <NewSlide nextPosition={(slides.at(-1)?.position ?? -1) + 1} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this slide?"
        description="It disappears from the landing page."
        confirmLabel="Delete slide"
        tone="danger"
        pending={del.pending}
        onConfirm={() => deleting && del.run(() => deleteSlide(deleting.id), "Slide deleted.")}
      />
    </div>
  );
}

function NewSlide({ nextPosition }: { nextPosition: number }) {
  const [image, setImage] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [uploading, setUploading] = useState(false);
  const { pending, run } = useAdminAction({
    onDone: () => {
      setImage(null);
      setHeadline("");
      setSubline("");
    },
  });

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setImage(await uploadPhoto(file, "hero"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 xl:sticky xl:top-6">
      <h2 className="text-lg font-bold">Add a slide</h2>
      <label
        className={cn(
          "grid aspect-[5/4] cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed",
          image ? "border-primary" : "border-input",
        )}
      >
        {uploading ? (
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized WebP
          <img src={photo(image, 760)} alt="New slide" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground">
            <ImagePlus className="size-8 text-primary" aria-hidden />
            Choose a photo
            <small>Wide photos work best (at least 1200 px)</small>
          </span>
        )}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <Field id="hero-headline" label="Headline" hint="Short, e.g. “We weigh it in front of you.”">
        <Input id="hero-headline" value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field id="hero-subline" label="Line under it (optional)">
        <Input id="hero-subline" value={subline} maxLength={160} onChange={(e) => setSubline(e.target.value)} />
      </Field>
      <Btn
        variant="primary"
        block
        disabled={!image || headline.trim().length < 3 || pending || uploading}
        onClick={() =>
          run(
            () => createSlide({ image_url: image!, headline: headline.trim(), subline: subline.trim() || null, position: nextPosition }),
            "Slide added to the landing page.",
          )
        }
      >
        {pending ? "Adding…" : "Add slide"}
      </Btn>
    </section>
  );
}
