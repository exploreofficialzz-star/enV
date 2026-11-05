import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { rewriteSubdomainInput, rewriteSubdomainOutput } from "@/lib/subdomain-routing";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultPreload: "intent",
    scrollRestoration: true,
    // Mirror Vercel's host rewrites during hydration and client navigation.
    rewrite: {
      input: rewriteSubdomainInput,
      output: rewriteSubdomainOutput,
    },
  });
}
