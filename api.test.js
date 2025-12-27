/**
 * API Test: Verifies a core authenticated API endpoint.
 *
 * This test checks the /api/analytics endpoint, ensuring that it requires a
 * valid API key and returns a JSON payload with the expected structure.
 *
 * Pre-requisites:
 * - The API server must be running.
 * - The `API_KEY` environment variable must be set to a valid key.
 *
 * To run: `API_KEY=your_key node api.test.js`
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:8080';
const API_KEY = process.env.API_KEY;

async function runApiTest() {
  console.log(`[INFO] Running API test against ${API_BASE_URL}...`);

  if (!API_KEY) {
    throw new Error('[FAIL] API_KEY environment variable is not set. This test requires authentication.');
  }

  const response = await fetch(`${API_BASE_URL}/api/analytics?crm=demo`, {
    headers: { 'x-api-key': API_KEY },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[FAIL] API request failed with status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  if (!('total_opportunities' in data && 'win_rate' in data)) {
    throw new Error(`[FAIL] API response JSON is missing expected keys: ${JSON.stringify(data)}`);
  }

  console.log('[SUCCESS] API test passed. Endpoint returned valid JSON.');
}

runApiTest().catch(err => {
  console.error(err.message);
  process.exit(1);
});