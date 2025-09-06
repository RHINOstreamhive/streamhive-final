export function apiUrl() {
  // Prefer env override; fall back to local dev API gateway.
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:7100";
}
