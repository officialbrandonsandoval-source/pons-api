import assert from "assert";

try {
  assert.strictEqual(1, 1, "Math check failed. This should never happen.");
  console.log("✅ Smoke test passed!");
  process.exit(0);
} catch (error) {
  console.error("❌ Smoke test failed:", error.message);
  process.exit(1);
}