/**
 * Smoke Test: Verifies the basic health of the API.
 *
 * This test makes a request to the /health endpoint and checks for a 200 OK
 * response. It's a simple, fast way to confirm that the server is up and
 * running before proceeding with more complex integration tests.
 *
 * To run: `node smoke.test.js`
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:8080';

async function runSmokeTest() {
  console.log(`[INFO] Running smoke test against ${API_BASE_URL}...`);

  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(`[FAIL] Health check failed with status: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 'ok') {
    throw new Error(`[FAIL] Health check response body is invalid: ${JSON.stringify(data)}`);
  }

  console.log('[SUCCESS] Smoke test passed. Service is healthy.');
}

runSmokeTest().catch(err => {
  console.error(err.message);
  process.exit(1);
});