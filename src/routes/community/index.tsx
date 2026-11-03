import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { loadPublicCommunityIndex } from "@/lib/community/public-feed.functions";
import { SITE_ORIGIN, seoPageHead } from "@/lib/seo-metadata";

export const Route = createFileRoute("/community/")({
  loader: () => loadPublicCommunityIndex(),
  head: ({ loaderData }) => {
    const discussions = loaderData ?? [];
    return seoPageHead({
      title: "Public tool discussions | enV",
      description: "Read public comments and discussions about enV tools. Browse user contributions, practical questions, and replies.",
      path: "/community",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Public tool discussions on enV",
        url: SITE_ORIGIN + "/community",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: discussions.map((discussion, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: SITE_ORIGIN + "/community/tools/" + discussion.category + "/" + discussion.slug,
            name: discussion.toolName + " discussion",
            description: discussion.latestBody,
          })),
        },
      },
    });
  },
  component: CommunityIndexPage,
});

function CommunityIndexPage() {
  const discussions = Route.useLoaderData();
  return (
    <AppShell>
    <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fg">Home</Link>
        <span aria-hidden="true"> / </span>
        <span className="text-fg">Public discussions</span>
      </nav>
      <header className="mb-7">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Public tool discussions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Comments and replies shared publicly by people using enV tools. Names appear only when a commenter chooses to display one.
        </p>
      </header>
      {discussions.length ? (
        <ul className="space-y-3">
          {discussions.map((discussion) => (
            <li key={discussion.toolId}>
              <Link
                to="/community/tools/$category/$slug"
                params={{ category: discussion.category, slug: discussion.slug }}
                className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-fg">{discussion.toolName}</h2>
                  <span className="text-xs text-muted">{discussion.commentCount} comments</span>
                </div>
                <p className="mt-2 text-sm text-fg">{discussion.latestBody}</p>
                <p className="mt-2 text-xs text-muted">
                  {discussion.latestAuthor} · {new Date(discussion.latestAt).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted">
          No public discussions yet. Open a tool and start a conversation.
        </p>
      )}
    </section>
    </AppShell>
  );
}
