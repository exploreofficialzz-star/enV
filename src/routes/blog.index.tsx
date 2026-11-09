import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AdSensePageUnit } from "@/components/layout/ad-sense-page-unit";
import { BLOG_ARTICLES } from "@/data/blog-articles";
import { getSearchableTools, categoryLabel, toolPath } from "@/lib/registry";
import { searchTools } from "@/lib/search";
import {
  toolCategoryLabel,
  toolDocumentationPath,
  toolDocumentationSummary,
  toolExecutionLabel,
  toolStatusLabel,
} from "@/lib/tool-documentation";
import { seoPageHead, pageSchema } from "@/lib/seo-metadata";

export const Route = createFileRoute("/blog/")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "articles" ? "articles" as const : undefined,
  }),
  head: () => seoPageHead({
    title: "enV Blogs & Guides | Tool Documentation and Product Articles",
    description: "Read practical guides for enV tools, understand how individual utilities work, and explore product notes about privacy, usage, and the platform.",
    path: "/blog",
    structuredData: pageSchema("enV Blogs and Guides", "Practical tool documentation and product articles from enV.", "/blog", "CollectionPage")
  }),
  component: BlogIndex,
});

type LibraryView = "tools" | "articles";
const PAGE_SIZE = 24;

function compareToolNames(a: { name: string; id: string }, b: { name: str¶»§q«^