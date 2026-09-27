export function env(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function isVercelDeployment(): boolean {
  return env("VERCEL") === "1";
}
