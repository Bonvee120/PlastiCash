import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { PostEditor } from "@/components/ops/post-editor";
import { OpsPage } from "@/components/ops/ui";

export default function NewPostPage() {
  return (
    <OpsPage title="New post">
      <Link href="/ops-portal/blog" className="-mt-3 flex items-center gap-1 text-sm font-bold text-primary">
        <ChevronLeft className="size-4" aria-hidden /> All posts
      </Link>
      <PostEditor post={null} />
    </OpsPage>
  );
}
