import { Recycle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

// Shared frame for /login and /signup: wordmark, card, footer link.
export function AuthCard({ title, description, children, footer }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2 self-center text-primary-dark">
        <Recycle className="size-6" aria-hidden />
        <span className="font-heading text-2xl font-bold">PlastiCash</span>
      </Link>
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="font-heading text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
      </Card>
    </main>
  );
}
