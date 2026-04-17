/**
 * health-check.js — 서버 health check (Windows 호환)
 *
 * 사용: node server/test/health-check.js [port] [timeout_sec]
 * 성공 시 exit 0, 실패 시 exit 1
 */
const http = require('http');

const port = process.argv[2] || 8092;
const timeout = (process.argv[3] || 15) * 1000;
const start = Date.now();

function check() {
  if (Date.now() - start > timeout) {
    console.error(`Health check failed: timeout ${timeout}ms on port ${port}`);
    process.exit(1);
  }
  http.get(`http://localhost:${port}/api/rooms`, (res) => {
    if (res.statusCode === 200) {
      console.log(`Server healthy on port ${port} (${Date.now() - start}ms)`);
      process.exit(0);
    }
    setTimeout(check, 500);
  }).on('error', () => setTimeout(check, 500));
}

check();
