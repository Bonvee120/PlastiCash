"use client";

import { CalendarPlus, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Field, useAdminAction } from "@/components/ops/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteEvent, saveEvent, type EventInput } from "@/lib/admin-actions";
import { eventWhen, type ClimateEvent } from "@/lib/content-format";
import { photo, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

// Times are typed in Lagos time (UTC+1 all year) and sent with the +01:00 offset.
function toLagosInput(iso: string | null) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 3_600_000).toISOString().slice(0, 16);
}
function fromLagosInput(value: string) {
  return value ? `${value}:00+01:00` : null;
}

const EMPTY: EventInput = {
  title: "",
  starts_at: "",
  ends_at: null,
  location: "",
  is_online: false,
  summary: "",
  cover_url: null,
  link_url: null,
  published: true,
};

export function EventsAdmin({ events }: { events: ClimateEvent[] }) {
  const [editing, setEditing] = useState<ClimateEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<ClimateEvent | null>(null);
  const { pending, run } = useAdminAction({ onDone: () => setDeleting(null) });
  const [now] = useState(() => Date.now());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Btn variant="primary" size="sm" onClick={() => setEditing("new")}>
          <CalendarPlus className="size-4" aria-hidden /> New event
        </Btn>
      </div>
      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">No events yet.</p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>When (Lagos)</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const past = new Date(e.ends_at ?? e.starts_at).getTime() < now;
                return (
                  <TableRow key={e.id} className={cn(past && "opacity-60")}>
                    <TableCell className="font-semibold">{e.title}</TableCell>
                    <TableCell className="text-sm">{eventWhen(e)}</TableCell>
                    <TableCell className="text-sm">{e.is_online ? `Online · ${e.location}` : e.location}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", e.published ? "bg-mint text-primary" : "bg-cream text-warn")}>
                        {e.published ? (past ? "Past" : "Live") : "Draft"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(e)}>
                        <Pencil className="size-4" aria-hidden /> Edit
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setDeleting(e)} aria-label={`Delete ${e.title}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </Btn>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
      {editing && <EventForm event={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="It disappears from the events page."
        confirmLabel="Delete event"
        tone="danger"
        pending={pending}
        onConfirm={() => deleting && run(() => deleteEvent(deleting.id), "Event deleted.")}
      />
    </div>
  );
}

function EventForm({ event, onClose }: { event: ClimateEvent | null; onClose: () => void }) {
  const [form, setForm] = useState<EventInput>(event ? { ...event } : EMPTY);
  const [start, setStart] = useState(toLagosInput(event?.starts_at ?? null));
  const [end, setEnd] = useState(toLagosInput(event?.ends_at ?? null));
  const [uploading, setUploading] = useState(false);
  const { pending, run } = useAdminAction({ onDone: onClose });
  const set = (patch: Partial<EventInput>) => setForm((f) => ({ ...f, ...patch }));

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      set({ cover_url: await uploadPhoto(file, "event") });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!form.title.trim() || !start || !form.location.trim() || form.summary.trim().length < 10) {
      return toast.error("Add a title, the start, the place and a short description (10+ characters).");
    }
    const body: EventInput = {
      ...form,
      title: form.title.trim(),
      location: form.location.trim(),
      summary: form.summary.trim(),
      link_url: form.link_url?.trim() || null,
      starts_at: fromLagosInput(start)!,
      ends_at: fromLagosInput(end),
    };
    await run(() => saveEvent(event?.id ?? null, body), event ? "Event updated." : "Event added.");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[90svh] gap-4 overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-heading">{event ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <Field id="ev-title" label="Title">
          <Input id="ev-title" value={form.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ev-start" label="Starts (Lagos time)">
            <Input id="ev-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field id="ev-end" label="Ends (optional)">
            <Input id="ev-end" type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field id="ev-place" label={form.is_online ? "Platform (e.g. Zoom, YouTube Live)" : "Place"}>
          <Input id="ev-place" value={form.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Michael Okpara Square, Enugu" />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.is_online} onChange={(e) => set({ is_online: e.target.checked })} className="size-4 accent-[#15803D]" />
          Online event
        </label>
        <Field id="ev-summary" label="Description">
          <textarea
            id="ev-summary"
            rows={4}
            maxLength={2000}
            value={form.summary}
            onChange={(e) => set({ summary: e.target.value })}
            className="rounded-input border border-input bg-card px-3.5 py-2.5 text-base outline-none focus-visible:border-2 focus-visible:border-primary"
          />
        </Field>
        <Field id="ev-link" label="Link for details or registration (optional)">
          <Input id="ev-link" type="url" value={form.link_url ?? ""} onChange={(e) => set({ link_url: e.target.value })} placeholder="https://" />
        </Field>
        <div className="flex items-center gap-3">
          {form.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized WebP
            <img src={photo(form.cover_url, 240)} alt="" className="h-16 w-24 rounded-lg object-cover" />
          )}
          <label className="d-btn d-btn-outline d-btn-sm cursor-pointer">
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {form.cover_url ? "Change image" : "Add image (optional)"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.published} onChange={(e) => set({ published: e.target.checked })} className="size-4 accent-[#15803D]" />
          Show on the site
        </label>
        <Btn variant="primary" block disabled={pending || uploading} onClick={submit}>
          {pending ? "Saving…" : event ? "Save changes" : "Add event"}
        </Btn>
      </DialogContent>
    </Dialog>
  );
}
