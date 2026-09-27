export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
