"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Btn, Card } from "@/components/brand/ui";
import { Label } from "@/components/ui/label";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const selectClass =
  "h-12 w-full rounded-input border border-input bg-white px-3 text-base font-medium outline-none focus-visible:border-2 focus-visible:border-primary";

// ESG report for organizations: pick a month (or the whole year) and download the PDF (03-screens-and-routes.md).
export function EsgReport() {
  const [now] = useState(() => new Date(Date.now() + 3_600_000)); // Lagos is UTC+1
  const thisYear = now.getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));
  const [pending, setPending] = useState(false);
  const years = Array.from({ length: Math.max(thisYear - 2025, 1) }, (_, i) => thisYear - i); // PlastiCash started in 2026
  const months = MONTHS.map((name, i) => ({ value: String(i + 1), name })).filter(
    (m) => year < thisYear || Number(m.value) <= now.getUTCMonth() + 1,
  );

  async function download() {
    setPending(true);
    const query = new URLSearchParams({ year: String(year), ...(month ? { month } : {}) });
    try {
      const response = await fetch(`/app/impact/esg?${query}`);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        toast.error(error?.message ?? "The report didn't download. Try again.");
        return;
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "plasticash-esg.pdf";
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded.");
    } catch {
      toast.error("No connection. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="gap-3">
      <span className="flex items-center gap-2">
        <FileText className="size-5 text-primary" aria-hidden />
        <h3 className="text-[17px] font-bold">ESG report</h3>
      </span>
      <p className="text-sm text-muted-foreground">A PDF of what your organization recycled, for your ESG or sustainability reporting.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="esg-month">Month</Label>
          <select id="esg-month" value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
            <option value="">Whole year</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="esg-year">Year</Label>
          <select
            id="esg-year"
            value={year}
            onChange={(e) => {
              const next = Number(e.target.value);
              setYear(next);
              if (next === thisYear && Number(month) > now.getUTCMonth() + 1) setMonth("");
            }}
            className={selectClass}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Btn variant="primary" block disabled={pending} onClick={download}>
        <Download className="size-5" aria-hidden /> {pending ? "Preparing…" : "Download PDF"}
      </Btn>
    </Card>
  );
}
