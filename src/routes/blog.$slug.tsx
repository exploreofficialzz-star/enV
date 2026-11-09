import { Fragment } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AdSensePageUnit } from "@/components/layout/ad-sense-page-unit";
import { getBlogArticle, type BlogArticle } from "@/data/blog-articles";
import {
  getRelatedTools,
  getSearchableTools,
  getToolsByCategory,
  getToolById,
  toolPath,
} from "@/lib/registry";
import {
  getToolDocumentation,
  toolCategoryLabel,
  toolDocumentationPath,
  toolDocumentationSummary,
  toolExecutionLabel,
  toolStatusLabel,
} from "@/lib/tool-documentation";
import type { ToolMeta } from "@/types/tool";
import { seoPageHead, articleSchema, technicalArticleSchema, isIndexableTool, articleSeoTitle, toolGuideSeoTitle, canonicalSeoTools, canonicalSeoToolFor } from "@/lib/seo-metadata";

const seoGuideCandidateMap = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
for (const tool of getToolsByCategory("accessibility")) seoGuideCandidateMap.set(tool.id, tool);
const CANONICAL_SEO_GUIDES = canonicalSeoTools([...seoGuideCandidateMap.values()]);

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const article = getBlogArticle(params.slug);
    if (article) return { kind: "article" as const, article };

    if (params.slug.startsWith("tool-")) {
      const toolId = params.slug.slice("t¶»§q«^