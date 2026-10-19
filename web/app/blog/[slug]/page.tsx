import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Markdown } from "@/components/content/markdown";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { getPost, postDate } from "@/lib/content";

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found", robots: { index: false } };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.published_at ?? undefined,
      ...(post.cover_url
        ? {
            images: [
              {
                url: post.cover_url.replace(
                  "/upload/",
                  "/upload/f_jpg,c_fill,w_1200,h_630/",
                ),
              },
            ],
          }
        : {}),
    },
  };
}

export default function PostPage({ params }: PageProps<"/blog/[slug]">) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-6 px-4 py-10">
        <Link
          href="/blog"
          className="flex items-center gap-1 text-sm font-bold text-primary"
        >
          <ChevronLeft className="size-4" aria-hidden /> All posts
        </Link>
        <Suspense
          fallback={<Skeleton className="h-[600px] w-full rounded-2xl" />}
        >
          <Article params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Article({
  params,
}: {
  params: PageProps<"/blog/[slug]">["params"];
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return (
    <article>
      <div>
        <p className="tabular text-sm text-muted-foreground">
          {postDate(post.published_at)}
          {post.author_name ? ` · ${post.author_name}` : ""}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight font-extrabold tracking-[-0.03em] lg:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-lg text-slate-700">{post.excerpt}</p>
      </div>
      {post.cover_url && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized WebP */}
          <img
            src={post.cover_url.replace(
              "/upload/",
              "/upload/f_auto,q_auto,w_1200/",
            )}
            alt=""
            className="mt-8 w-full rounded-3xl"
            fetchPriority="high"
          />
        </div>
      )}
      <Markdown source={post.body_md} className="mt-6" />
    </article>
  );
}
