"use client";

import { CameraOff } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Btn } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Back camera QR scan (html5-qrcode, loaded in the browser only). If the camera can't start, the collector can type
// the code shown under the customer's QR instead. Calls onCode once per distinct read; the parent checks it with the API.
export function QrScanner({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const elementId = `qr-${useId().replace(/:/g, "")}`;
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const last = useRef<string | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    let stopped = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (stopped) return;
      scanner = new Html5Qrcode(elementId, { verbose: false });
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            if (text !== last.current) {
              last.current = text;
              onCodeRef.current(text);
            }
          },
          () => {},
        );
        if (stopped) await scanner.stop().catch(() => {});
      } catch {
        setCameraError("The camera didn't start. Allow camera access, or type the code under the customer's QR.");
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [elementId]);

  return (
    <div className="flex flex-col gap-3">
      {cameraError ? (
        <p className="flex items-start gap-2 rounded-xl bg-cream p-3 text-sm text-[#92400E]">
          <CameraOff className="mt-0.5 size-4 shrink-0" aria-hidden /> {cameraError}
        </p>
      ) : (
        <div id={elementId} className="aspect-square w-full overflow-hidden rounded-2xl bg-ink" />
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const code = typed.replace(/\s/g, "").toLowerCase();
          last.current = code;
          onCode(code);
        }}
      >
        <Label htmlFor="qr-typed">Or type the code</Label>
        <div className="flex gap-2">
          <Input id="qr-typed" placeholder="1a2b 3c4d …" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="tabular h-12" />
          <Btn type="submit" variant="outline" disabled={!typed.trim() || busy}>
            Check
          </Btn>
        </div>
      </form>
    </div>
  );
}
