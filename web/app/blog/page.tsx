import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/brand/ui";
import { PostCard } from "@/components/content/cards";
import { MotionRoot, Stagger, StaggerItem } from "@/components/motion/reveal";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { getPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Blog: plastic, recycling and climate in Enugu",
  description:
    "News and stories from EcoCyclers and PlastiCash: recycling in Enugu, plastic waste, and climate action in Nigeria.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <MotionRoot>
      <div className="flex min-h-svh flex-col bg-canvas">
        <SiteHeader />
        <main className="container-site flex flex-1 flex-col gap-8 py-10">
          <div>
            <span className="eyebrow text-primary">Blog</span>
            <h1 className="mt-2 font-display text-4xl leading-tight font-extrabold tracking-[-0.03em] lg:text-5xl">
              Plastic, recycling and climate in Enugu
            </h1>
          </div>
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <Posts />
          </Suspense>
        </main>
        <SiteFooter />
      </div>
    </MotionRoot>
  );
}

async function Posts() {
  const posts = await getPosts(48);
  if (posts.length === 0)
    return (
      <EmptyState icon={Newspaper} text="No posts yet. Check back soon." />
    );
  return (
    <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:gap-6">
      {posts.map((p, i) => (
        <StaggerItem
          key={p.id}
          className={i === 0 ? "sm:col-span-2 lg:col-span-3" : undefined}
        >
          <PostCard post={p} large={i === 0} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
