import 'dotenv/config';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}
import assert from 'assert';
import http from 'http';
import app from '../server.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {
      'Authorization': 'Bearer admin-test-token'
    };
    if (body) headers['Content-Type'] = 'application/json';

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;

  try {
    // Assert removed endpoints return 404 in User-Owned Servers architecture
    {
      const res = await makeRequest('POST', '/api/admin/permissions', {"user_id":"u1","server_id":"s1"});
      assert.strictEqual(res.status, 404, 'POST /api/admin/permissions must return 404 on removed route');
      console.log('   ✓ Verified POST /api/admin/permissions returns 404 (removed route)');
    }
    console.log('✓ noPermittedServerAccess.test.js: All removed route 404 assertions passed');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
