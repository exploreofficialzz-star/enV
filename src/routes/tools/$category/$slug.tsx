import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolEngine } from "@/components/tools/tool-engine";
import { getToolByPath } from "@/lib/registry";

export const Route = createFileRoute("/tools/$category/$slug")({ component: Tool });

function Tool() {
  const { category, slug } = Route.useParams();
  const tool = getToolByPath(category, slug);
  if (!tool) return <AppShell><p className="mx-auto max-w-5xl px-4 py-10">Tool not found.</p></AppShell>;
  return <AppShell><ToolShell tool={tool}><ToolEngine tool={tool} /></ToolShell></AppShell>;
}
