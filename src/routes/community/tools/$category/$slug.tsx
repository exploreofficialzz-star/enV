import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { loadPublicCommunityToolFeed } from "@/lib/community/public-feed.functions";
import { getToolByPath } from "@/lib/registry";
import { isIndexableTool } from "@/lib/seo-metadata";
import { SITE_ORIGIN, seoPageHead } from "@/lib/seo-metadata";

export const Route = createFileRoute("/community/tools/$category/$slug")({
  loader: async ({ params }) => {
    const tool = getToolByPath(params.category, params.slug);
    if (!tool || !isIndexableTool(tool)) throw notFound();
    const feed = await loadPublicCommunityToolFeed({ data: { toolId: tool.id } });
    return { tool, feed };
  },
  head: ({ loaderData }) => {
    const { tool, feed } = loaderData;
    const path = "/community/tools/" + tool.category + "/" + tool.slug;
    if (!feed || feed.comments.length === 0) {
      return {
        meta: [
          { title: tool.name + " discussion | enV" },
          { name: "description", content: "Public discussion for " + tool.name + " on enV." },
          { name: "robots", content: "noindex,follow" },
        ],
        links: [{ rel: "canonical", href: SITE_ORIGIN + path }],
      };
    }
    const commentItems = feed.comments.map((comment, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Comment",
        text: comment.body,
        author: { "@type": "Person", name: comment.authorLabel },
        datePublished: comment.createdAt,
      },
    }));
    return seoPageHead({
      title: "Public comments about " + tool.name + " | enV",
      description: "Read " + feed.counts.comments + " public comments and replies about " + tool.name + " on enV.",
      path,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Public comments about " + tool.name,
        url: SITE_ORIGIN + path,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: commentItems.length,
          itemListElement: commentItems,
        },
      },
    });
  },
  component: PublicToolDiscussionPage,
});

function PublicToolDiscussionPage() {
  const { tool, feed } = Route.useLoaderData();
  const toolUrl = "/tools/" + tool.category + "/" + tool.slug;
  const roots = feed?.comments.filter((comment) => !comment.parentId) ?? [];
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-6 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fg">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link to="/community" className="hover:text-fg">Public discussions</Link>
        <span aria-hidden="true"> / </span>
        <span className="text-fg">{tool.name}</span>
      </nav>
      <header className="mb-7">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{tool.name}: public discussion</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Public comments and replies from enV users. Anonymous posts remain anonymous; display names are shown only when chosen by the commenter.
        </p>
        <Link to={toolUrl} className="mt-3 inline-flex text-sm font-semibold text-accent underline underline-offset-4">
          Open {tool.name}
        </Link>
      </header>
      {feed?.comments.length ? (
        <ol className="space-y-4">
          {roots.map((comment) => (
            <li key={comment.id} id={"comment-" + comment.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{comment.authorLabel}</span>
                <time className="text-xs text-muted" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-fg">{comment.body}</p>
              {feed.comments.filter((reply) => reply.parentId === comment.id).length ? (
                <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
                  {feed.comments.filter((reply) => reply.parentId === comment.id).map((reply) => (
                    <li key={reply.id} id={"comment-" + reply.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-fg">{reply.authorLabel}</span>
                        <time className="text-[11px] text-muted" dateTime={reply.createdAt}>{new Date(reply.createdAt).toLocaleDateString()}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-fg">{reply.body}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted">No public comments yet.</p>
      )}
      <p className="mt-7 text-sm text-muted">
        Join the discussion from the <Link to={toolUrl} className="font-semibold text-accent underline underline-offset-4">{tool.name} page</Link>.
      </p>
    </main>
  );
}
