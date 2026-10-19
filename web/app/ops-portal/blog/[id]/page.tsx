import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PostEditor } from "@/components/ops/post-editor";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Post } from "@/lib/content";

export default function EditPostPage({ params }: PageProps<"/ops-portal/blog/[id]">) {
  return (
    <OpsPage title="Edit post">
      <Link href="/ops-portal/blog" className="-mt-3 flex items-center gap-1 text-sm font-bold text-primary">
        <ChevronLeft className="size-4" aria-hidden /> All posts
      </Link>
      <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-2xl" />}>
        <Editor params={params} />
      </Suspense>
    </OpsPage>
  );
}

async function Editor({ params }: { params: PageProps<"/ops-portal/blog/[id]">["params"] }) {
  const { id } = await params;
  const result = await api<Post>(`/admin/posts/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 422)) notFound();
  if (!result.ok) throw new Error(`GET /admin/posts/${id} failed: ${result.status}`);
  return <PostEditor key={result.data.updated_at} post={result.data} />;
}
