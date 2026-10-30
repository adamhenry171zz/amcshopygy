// HENRY OS server authentication placeholder.
// This endpoint intentionally refuses all login attempts until
// the owner-only authentication implementation and rate limits
// have been completed and security-tested.
// Never place passwords, password hashes or signing secrets in GitHub.
export const handler = async () => ({
  statusCode: 503,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({ error: 'Private owner login is not configured yet' })
});
