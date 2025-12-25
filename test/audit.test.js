import assert from "assert";
import fetch from "node-fetch";

const API_URL = process.env.API_URL || "http://localhost:8080";

(async () => {
  const res = await fetch(`${API_URL}/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.strictEqual(res.status, 200, "Audit endpoint failed");

  const json = await res.json();
  assert.ok(json.leaks, "Missing leaks array");

  console.log("✅ Backend audit test passed");
})();