"use client";

import type { ReactNode } from "react";

import { Btn } from "@/components/brand/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// "Are you sure?" before anything with money or a weight (DESIGN_BRIEF.md §13).
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  pending = false,
  disabled = false,
  tone = "primary",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  disabled?: boolean;
  tone?: "primary" | "danger";
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-heading">{title}</DialogTitle>
          {description && <DialogDescription className="text-[15px]">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="flex-row gap-3 sm:justify-stretch">
          <Btn variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            Not now
          </Btn>
          <Btn variant={tone === "danger" ? "danger" : "primary"} className="flex-1" onClick={onConfirm} disabled={pending || disabled}>
            {pending ? "Please wait…" : confirmLabel}
          </Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
