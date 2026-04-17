// E2E 검증: 비밀번호 방 우회 시도 → INVALID_PASSWORD 에러 수신
// 외부망 터널 URL 전달 가능. 기본값은 로컬.
const WebSocket = require('ws');
const host = process.env.TEST_HOST || 'http://localhost:9090';
const wsHost = host.replace(/^https/, 'wss').replace(/^http/, 'ws');

(async () => {
  const createRes = await fetch(`${host}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'gate-test', max_players: 3, turn_time_limit: 60, password: 'secret123' }),
  });
  const room = await createRes.json();
  console.log(`[SETUP] room created: id=${room.id} hasPassword=${room.password !== undefined ? 'hidden' : 'N/A'}`);

  const runJoin = (label, password) => new Promise((resolve) => {
    const ws = new WebSocket(`${wsHost}/ws/game/${room.id}`);
    const timer = setTimeout(() => { ws.close(); resolve({ label, result: 'TIMEOUT' }); }, 5000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'joinRequest', payload: { playerName: 'tester-' + label, password } }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'joinAccepted') { clearTimeout(timer); ws.close(); resolve({ label, result: 'ACCEPTED' }); }
      else if (msg.type === 'error') { clearTimeout(timer); ws.close(); resolve({ label, result: 'ERROR', code: msg.payload?.code, msg: msg.payload?.message }); }
    });
    ws.on('error', (e) => { clearTimeout(timer); resolve({ label, result: 'WS_ERROR', err: e.message }); });
  });

  const r1 = await runJoin('no-pw', '');
  const r2 = await runJoin('wrong-pw', 'wrong');
  const r3 = await runJoin('correct-pw', 'secret123');

  console.log('[TEST 1] no password  ->', r1);
  console.log('[TEST 2] wrong password ->', r2);
  console.log('[TEST 3] correct password ->', r3);

  await fetch(`${host}/api/rooms/${room.id}`, { method: 'DELETE' });
  console.log(`[CLEANUP] room deleted`);

  const pass = r1.code === 'INVALID_PASSWORD' && r2.code === 'INVALID_PASSWORD' && r3.result === 'ACCEPTED';
  console.log(`\n[VERDICT] ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
})();
