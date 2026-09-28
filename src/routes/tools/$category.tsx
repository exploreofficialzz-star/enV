import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tools/$category")({ component: CategoryLayout });

function CategoryLayout() {
  return <Outlet />;
}
