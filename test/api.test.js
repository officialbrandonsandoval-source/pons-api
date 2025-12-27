import assert from "assert";
import { detectLeaks } from "../leakDetector.js";

console.log("Running tests...");

let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`❌ [FAIL] ${name}`);
    console.error(error);
  }
};

// Test Suite

test("detectLeaks returns an array", () => {
  const result = detectLeaks({ leads: [], opportunities: [], activities: [] });
  assert.ok(Array.isArray(result), "detectLeaks should return an array");
});

test("detectLeaks identifies a stale opportunity", () => {
  const staleOpp = { id: 'O-stale', value: 10000, lastInteraction: new Date('2024-01-01') };
  const activeOpp = { id: 'O-active', value: 5000, lastInteraction: new Date() };
  const leaks = detectLeaks({ leads: [], opportunities: [staleOpp, activeOpp], activities: [] });
  assert.strictEqual(leaks.length, 1, "Should find exactly one leak");
  assert.strictEqual(leaks[0].id, `stale_opportunity_${staleOpp.id}`);
  assert.strictEqual(leaks[0].revenue_at_risk, 10000);
});

test("detectLeaks returns an empty array when no leaks are present", () => {
    const activeOpp = { id: 'O-active', value: 5000, lastInteraction: new Date() };
    const leaks = detectLeaks({ leads: [], opportunities: [activeOpp], activities: [] });
    assert.strictEqual(leaks.length, 0, "Should find no leaks");
});

// --- Test Runner ---
if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log("\nAll tests passed!");