import { Recycle } from "lucide-react";

import { Button } from "@/components/ui/button";

// Step 1.3 placeholder. The landing page comes in step 10.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-primary-dark">
        <Recycle className="size-6" aria-hidden />
        <div>
          <h1 className="text-3xl font-bold">PlastiCash</h1>
          <p className="text-sm text-muted-foreground">by EcoCyclers</p>
        </div>
      </div>

      <div className="rounded-xl border bg-accent-light p-4">
        <p className="text-sm text-muted-foreground">Wallet</p>
        <p className="tabular text-4xl font-medium text-ink">₦12,450</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button>shadcn button</Button>
        <button className="d-btn d-btn-primary">daisyUI button</button>
        <span className="d-badge d-badge-warning">Please confirm</span>
      </div>
    </main>
  );
}
