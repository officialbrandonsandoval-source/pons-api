export function leakDetector(payload = {}) {
  if (typeof payload !== "object" || payload === null) {
    return {
      ok: false,
      issues: ["Payload must be an object"],
    };
  }

  const issues = [];

  if ("password" in payload) issues.push("Contains password");
  if ("token" in payload) issues.push("Contains token");
  if ("secret" in payload) issues.push("Contains secret");

  return {
    ok: issues.length === 0,
    issues,
  };
}