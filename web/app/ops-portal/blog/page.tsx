import { Newspaper, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { BtnLink, EmptyState } from "@/components/brand/ui";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { get } from "@/lib/api";
import { postDate, type PostSummary } from "@/lib/content";
import { cn } from "@/lib/utils";

export default function OpsBlogPage() {
  return (
    <OpsPage
      title="Blog"
      sub="News and stories for the public site. Drafts are only visible here."
      filters={
        <BtnLink href="/ops-portal/blog/new" variant="primary" size="sm">
          <Plus className="size-4" aria-hidden /> New post
        </BtnLink>
      }
    >
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-2xl" />}>
        <Posts />
      </Suspense>
    </OpsPage>
  );
}

async function Posts() {
  const posts = await get<PostSummary[]>("/admin/posts");
  if (posts.length === 0) return <EmptyState icon={Newspaper} text="No posts yet. Write the first one." />;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Edited</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/ops-portal/blog/${p.id}`} className="font-semibold hover:text-primary">
                  {p.title}
                </Link>
                <span className="block max-w-xl truncate text-xs text-muted-foreground">{p.excerpt}</span>
              </TableCell>
              <TableCell>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", p.published_at ? "bg-mint text-primary" : "bg-cream text-warn")}>
                  {p.published_at ? `Published ${postDate(p.published_at)}` : "Draft"}
                </span>
              </TableCell>
              <TableCell className="text-sm">{p.author_name ?? "–"}</TableCell>
              <TableCell className="tabular text-sm">{postDate(p.updated_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
