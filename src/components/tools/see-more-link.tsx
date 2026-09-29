import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function SeeMoreLink({ to, children = "See more" }: { to: string; children?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
