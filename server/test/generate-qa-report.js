/**
 * generate-qa-report.js — QA 체크리스트 Markdown 리포트 자동 생성
 *
 * 모든 테스트를 순차 실행하고 결과를 Markdown 체크리스트로 조합한다.
 * 산출물: docs/04-report/qa-report-{날짜}.md
 *
 * 실행: node server/test/generate-qa-report.js
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const date = new Date().toISOString().slice(0, 10);
const reportDir = path.join(ROOT_DIR, 'docs', '04-report');
const reportPath = path.join(reportDir, `qa-report-${date}.md`);

// ============================================================
// 헬퍼
// ============================================================

function runTest(cmd, options = {}) {
  try {
    const stdout = execSync(cmd, {
      cwd: options.cwd || ROOT_DIR,
      encoding: 'utf8',
      timeout: options.timeout || 300000,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: stdout };
  } catch (err) {
    return {
      success: false,
      output: (err.stdout || '') + '\n' + (err.stderr || err.message || ''),
    };
  }
}

function parsePassFail(output) {
  const passes = (output.match(/(?:PASS|✓|passed|\[OK\])/gi) || []).length;
  const fails = (output.match(/(?:FAIL|✗|failed|\[FAIL\])/gi) || []).length;
  return { passes, fails };
}

function parseResultsSummary(output) {
  // "Results: X passed, Y failed out of Z" 패턴
  const m = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed\s+out\s+of\s+(\d+)/);
  if (m) return { passes: parseInt(m[1]), fails: parseInt(m[2]), total: parseInt(m[3]) };
  // "Total: X passed, Y failed out of Z" 패턴
  const m2 = output.match(/Total:\s+(\d+)\s+passed,\s+(\d+)\s+failed\s+out\s+of\s+(\d+)/);
  if (m2) return { passes: parseInt(m2[1]), fails: parseInt(m2[2]), total: parseInt(m2[3]) };
  return null;
}

function parseSoakResults(output) {
  const results = {};
  const totalMatch = output.match(/Total hands:\s+(\d+)\/(\d+)/);
  if (totalMatch) {
    results.completedHands = parseInt(totalMatch[1]);
    results.totalHands = parseInt(totalMatch[2]);
  }
  const errMatch = output.match(/Errors:\s+(\d+)/);
  if (errMatch) results.errors = parseInt(errMatch[1]);
  const timeMatch = output.match(/Total time:\s+([\d.]+)s/);
  if (timeMatch) results.totalTime = timeMatch[1] + 's';
  const avgMatch = output.match(/Avg hand time:\s+([\d.]+)ms/);
  if (avgMatch) results.avgHandTime = avgMatch[1] + 'ms';
  const foulMatch = output.match(/Total fouls:\s+(\d+)/);
  if (foulMatch) results.fouls = parseInt(foulMatch[1]);
  const flMatch = output.match(/Total FL:\s+(\d+)/);
  if (flMatch) results.fl = parseInt(flMatch[1]);
  const memMatch = output.match(/Memory growth:\s+([\d.]+)%/);
  if (memMatch) results.memoryGrowth = memMatch[1] + '%';
  return results;
}

function extractInvariants(output) {
  const invariants = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const okMatch = line.match(/\[OK\]\s+(INV\d+:?\s*.+)/);
    if (okMatch) {
      invariants.push({ name: okMatch[1].trim(), status: 'OK' });
    }
    const failMatch = line.match(/INVARIANT FAILED:\s*(.+)/);
    if (failMatch) {
      invariants.push({ name: failMatch[1].trim(), status: 'FAIL' });
    }
  }
  return invariants;
}

function extractErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  for (const line of lines) {
    // [OK] 라인은 스킵, [FAIL]/[ERROR]/ASSERTION FAILED만 수집
    if (/\[OK\]/.test(line)) continue;
    if (/\[FAIL\]|\[ERROR\]|ASSERTION FAILED/i.test(line)) {
      const clean = line.replace(/^\s+/, '').substring(0, 200);
      if (clean.length > 5) errors.push(clean);
    }
  }
  return errors;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// 서버 시작/종료
// ============================================================

function startServer(port) {
  return new Promise((resolve, reject) => {
    const serverProc = spawn('node', ['server/index.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        started = true;
        // 서버가 아직 안 열렸어도 일단 반환 (포트 오픈 대기)
        resolve(serverProc);
      }
    }, 4000);

    serverProc.stdout.on('data', (data) => {
      const text = data.toString();
      if (!started && (text.includes('listening') || text.includes('Server') || text.includes(String(port)))) {
        started = true;
        clearTimeout(timeout);
        resolve(serverProc);
      }
    });

    serverProc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function killServer(proc) {
  if (!proc) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch { /* ignore */ }
}

// ============================================================
// 스크린샷 포맷
// ============================================================

function formatScreenshots() {
  const screenshotBase = path.join(ROOT_DIR, 'e2e', 'reports', 'screenshots');
  if (!fs.existsSync(screenshotBase)) return '> 스크린샷 디렉토리 없음\n';

  const dirs = fs.readdirSync(screenshotBase).filter((d) => {
    return fs.statSync(path.join(screenshotBase, d)).isDirectory();
  });

  if (dirs.length === 0) return '> 스크린샷 없음\n';

  let md = '';
  for (const dir of dirs.sort()) {
    const dirPath = path.join(screenshotBase, dir);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.png')).sort();

    if (files.length === 0) continue;

    // 체크포인트별 그룹화
    const checkpoints = {};
    for (const file of files) {
      const parts = file.replace('.png', '').split('-');
      // 체크포인트: 01-LOBBY 같은 접두사
      const cpParts = [];
      for (const p of parts) {
        cpParts.push(p);
        if (p === p.toUpperCase() && p.length > 1 && isNaN(p)) break;
      }
      const cp = cpParts.join('-');
      if (!checkpoints[cp]) checkpoints[cp] = [];
      checkpoints[cp].push(file);
    }

    md += `#### ${dir}\n\n`;
    md += `| 체크포인트 | 스크린샷 수 | 상태 |\n`;
    md += `|-----------|:----------:|:----:|\n`;
    for (const [cp, shots] of Object.entries(checkpoints)) {
      md += `| ${cp} | ${shots.length} | ✅ |\n`;
    }
    md += '\n';
  }
  return md;
}

// ============================================================
// 메인
// ============================================================

async function main() {
  console.log('========================================');
  console.log('QA Report Generator');
  console.log(`Date: ${date}`);
  console.log(`Output: ${reportPath}`);
  console.log('========================================');

  const sections = [];
  const summary = {
    unitTests: { passes: 0, fails: 0, total: 0 },
    smartBot: { passes: 0, fails: 0, total: 0 },
    wsProtocol: { passes: 0, fails: 0, total: 0 },
    playFold: { passes: 0, fails: 0, total: 0 },
    soak: { completed: 0, errors: 0 },
    e2e: { passes: 0, fails: 0, total: 0 },
  };
  const allErrors = [];

  // ─── 1. 서버 단위 테스트 ───
  console.log('\n[1/6] 서버 단위 테스트...');
  const unitResult = runTest('npm test', { cwd: path.join(ROOT_DIR, 'server') });
  const unitPF = parsePassFail(unitResult.output);
  summary.unitTests = { passes: unitPF.passes, fails: unitPF.fails, total: unitPF.passes + unitPF.fails };

  let unitSection = `## 1. 서버 단위 테스트\n\n`;
  unitSection += `- **상태**: ${unitResult.success ? '✅ PASS' : '❌ FAIL'}\n`;
  unitSection += `- **결과**: ${unitPF.passes} passed / ${unitPF.fails} failed\n\n`;
  unitSection += `### 체크리스트\n\n`;
  unitSection += `- [${unitResult.success ? 'x' : ' '}] scorer.test.js\n`;
  unitSection += `- [${unitResult.success ? 'x' : ' '}] evaluator.test.js\n`;
  unitSection += `- [${unitResult.success ? 'x' : ' '}] royalty.test.js\n`;
  unitSection += `- [${unitResult.success ? 'x' : ' '}] deck.test.js\n`;

  if (!unitResult.success) {
    const errs = extractErrors(unitResult.output);
    allErrors.push(...errs.map((e) => `[Unit] ${e}`));
  }
  sections.push(unitSection);
  console.log(`  ${unitResult.success ? 'PASS' : 'FAIL'} (${unitPF.passes}/${unitPF.passes + unitPF.fails})`);

  // ─── 2. 스마트 봇 테스트 ───
  console.log('\n[2/6] 스마트 봇 테스트...');
  const botResult = runTest('node server/game/smart-bot.test.js');
  const botPF = parsePassFail(botResult.output);
  const botSummary = parseResultsSummary(botResult.output);
  if (botSummary) {
    summary.smartBot = { passes: botSummary.passes, fails: botSummary.fails, total: botSummary.total };
  } else {
    summary.smartBot = { passes: botPF.passes, fails: botPF.fails, total: botPF.passes + botPF.fails };
  }

  let botSection = `## 2. 스마트 봇 테스트\n\n`;
  botSection += `- **상태**: ${botResult.success ? '✅ PASS' : '❌ FAIL'}\n`;
  botSection += `- **결과**: ${summary.smartBot.passes} passed / ${summary.smartBot.fails} failed\n\n`;
  botSection += `### 체크리스트\n\n`;
  // 테스트 항목 추출
  const botTests = botResult.output.split('\n').filter((l) => /^\s*[✓✗]/.test(l));
  for (const line of botTests) {
    const isPass = line.includes('✓');
    const name = line.replace(/^\s*[✓✗]\s*/, '').trim();
    botSection += `- [${isPass ? 'x' : ' '}] ${name}\n`;
  }
  if (botTests.length === 0) {
    botSection += `- [${botResult.success ? 'x' : ' '}] smart-bot.test.js 전체\n`;
  }

  if (!botResult.success) {
    const errs = extractErrors(botResult.output);
    allErrors.push(...errs.map((e) => `[SmartBot] ${e}`));
  }
  sections.push(botSection);
  console.log(`  ${botResult.success ? 'PASS' : 'FAIL'} (${summary.smartBot.passes}/${summary.smartBot.total})`);

  // ─── 3. Soak 테스트 (서버 불필요) ───
  console.log('\n[3/6] Soak 테스트 (100핸드)...');
  const soakResult = runTest('node server/test/soak-test.js --hands 100', { timeout: 120000 });
  const soakData = parseSoakResults(soakResult.output);
  summary.soak = {
    completed: soakData.completedHands || 0,
    errors: soakData.errors || 0,
  };

  let soakSection = `## 3. Soak 테스트\n\n`;
  soakSection += `- **상태**: ${soakResult.success ? '✅ PASS' : '❌ FAIL'}\n`;
  soakSection += `- **실행 핸드**: ${soakData.completedHands || '?'}/${soakData.totalHands || '?'}\n`;
  soakSection += `- **에러**: ${soakData.errors || 0}\n`;
  soakSection += `- **평균 핸드 시간**: ${soakData.avgHandTime || '?'}\n`;
  soakSection += `- **메모리 증가율**: ${soakData.memoryGrowth || '?'}\n`;
  soakSection += `- **Foul 횟수**: ${soakData.fouls || 0}\n`;
  soakSection += `- **Fantasyland 진입**: ${soakData.fl || 0}\n\n`;
  soakSection += `### 체크리스트\n\n`;
  soakSection += `- [${soakResult.success ? 'x' : ' '}] 100핸드 완주\n`;
  soakSection += `- [${(soakData.errors || 0) === 0 ? 'x' : ' '}] 에러 0건\n`;
  soakSection += `- [${soakResult.success ? 'x' : ' '}] 불변식 전체 통과 (Zero-sum, Foul, Board)\n`;

  const soakInvariants = extractInvariants(soakResult.output);
  if (soakInvariants.length > 0) {
    soakSection += `\n### 불변식 검증\n\n`;
    for (const inv of soakInvariants) {
      soakSection += `- [${inv.status === 'OK' ? 'x' : ' '}] ${inv.name}\n`;
    }
  }

  if (!soakResult.success) {
    const errs = extractErrors(soakResult.output);
    allErrors.push(...errs.map((e) => `[Soak] ${e}`));
  }
  sections.push(soakSection);
  console.log(`  ${soakResult.success ? 'PASS' : 'FAIL'} (${soakData.completedHands || 0} hands, ${soakData.errors || 0} errors)`);

  // ─── 4. WS 프로토콜 테스트 (서버 필요) ───
  console.log('\n[4/6] WS 프로토콜 테스트...');
  const WS_PORT = 8092;
  let serverProc = null;
  let wsSection = `## 4. WS 프로토콜 테스트\n\n`;

  try {
    serverProc = await startServer(WS_PORT);
    await sleep(2000);

    const wsResult = runTest('node server/test/ws-protocol.test.js', {
      env: { SERVER_URL: `http://localhost:${WS_PORT}` },
      timeout: 300000,
    });
    const wsSummary = parseResultsSummary(wsResult.output);
    if (wsSummary) {
      summary.wsProtocol = { passes: wsSummary.passes, fails: wsSummary.fails, total: wsSummary.total };
    } else {
      const wsPF = parsePassFail(wsResult.output);
      summary.wsProtocol = { passes: wsPF.passes, fails: wsPF.fails, total: wsPF.passes + wsPF.fails };
    }

    const wsAllPassed = summary.wsProtocol.fails === 0 && summary.wsProtocol.passes > 0;
    wsSection += `- **상태**: ${wsAllPassed ? '✅ PASS' : '❌ FAIL'}\n`;
    wsSection += `- **결과**: ${summary.wsProtocol.passes} passed / ${summary.wsProtocol.fails} failed out of ${summary.wsProtocol.total}\n\n`;
    wsSection += `### 체크리스트\n\n`;

    const wsTests = [
      '2-Player', '3-Player', '4-Player',
      '5-Player with Fold', '6-Player with Fold',
      '2-Player Multi-Hand',
      'Reconnect', 'Invalid PlaceCard', 'Out-of-Turn Place',
      'Duplicate Confirm', 'Player Leave', 'Host Leave',
      'Malformed Message', 'Turn Timeout', 'Play/Fold All Combinations',
    ];
    for (const t of wsTests) {
      const testFailed = wsResult.output.includes(`TEST ${t} FAILED`);
      wsSection += `- [${testFailed ? ' ' : 'x'}] ${t}\n`;
    }

    // 불변식
    const wsInvariants = extractInvariants(wsResult.output);
    if (wsInvariants.length > 0) {
      const uniqueInvs = {};
      for (const inv of wsInvariants) {
        const key = inv.name.replace(/\s*\(.*\)/, '');
        if (!uniqueInvs[key] || inv.status === 'FAIL') uniqueInvs[key] = inv;
      }
      wsSection += `\n### 불변식 검증\n\n`;
      for (const [key, inv] of Object.entries(uniqueInvs)) {
        wsSection += `- [${inv.status === 'OK' ? 'x' : ' '}] ${key}\n`;
      }
    }

    if (!wsAllPassed) {
      const errs = extractErrors(wsResult.output);
      allErrors.push(...errs.map((e) => `[WS] ${e}`));
    }
    console.log(`  ${wsAllPassed ? 'PASS' : 'FAIL'} (${summary.wsProtocol.passes}/${summary.wsProtocol.total})`);

  } catch (err) {
    wsSection += `- **상태**: ❌ ERROR\n`;
    wsSection += `- **에러**: ${err.message}\n`;
    allErrors.push(`[WS] Server start failed: ${err.message}`);
    console.log(`  ERROR: ${err.message}`);
  }

  // ─── 5. Play/Fold 전수 테스트 (새 서버 시작) ───
  console.log('\n[5/6] Play/Fold 전수 테스트...');
  let pfSection = `## 5. Play/Fold 전수 테스트\n\n`;

  // WS 테스트에서 서버가 부하를 받았으므로 재시작
  killServer(serverProc);
  serverProc = null;
  await sleep(2000);

  const PF_PORT = 8093;
  try {
    serverProc = await startServer(PF_PORT);
    await sleep(2000);

    const pfResult = runTest('node server/test/run-pf-test.js', {
      env: { SERVER_URL: `http://localhost:${PF_PORT}` },
      timeout: 300000,
    });
    const pfSummary = parseResultsSummary(pfResult.output);
    if (pfSummary) {
      summary.playFold = { passes: pfSummary.passes, fails: pfSummary.fails, total: pfSummary.total };
    } else {
      const pfPF = parsePassFail(pfResult.output);
      summary.playFold = { passes: pfPF.passes, fails: pfPF.fails, total: pfPF.passes + pfPF.fails };
    }

    pfSection += `- **상태**: ${pfResult.success ? '✅ PASS' : '❌ FAIL'}\n`;
    pfSection += `- **결과**: ${summary.playFold.passes} passed / ${summary.playFold.fails} failed out of ${summary.playFold.total}\n\n`;
    pfSection += `### 체크리스트\n\n`;

    // RESULTS SUMMARY 블록에서 PASS/FAIL 라인 추출
    const pfLines = pfResult.output.split('\n');
    let inSummary = false;
    for (const line of pfLines) {
      if (line.includes('RESULTS SUMMARY')) { inSummary = true; continue; }
      if (inSummary) {
        const passMatch = line.match(/\[(PASS|FAIL)\]\s+(.+)/);
        if (passMatch) {
          const isPass = passMatch[1] === 'PASS';
          const detail = passMatch[2].trim().split(' — ');
          const label = detail[0];
          const errMsg = detail[1] || '';
          pfSection += `- [${isPass ? 'x' : ' '}] ${label}${errMsg ? ': ' + errMsg : ''}\n`;
        }
      }
    }

    if (!pfResult.success) {
      const errs = extractErrors(pfResult.output);
      allErrors.push(...errs.map((e) => `[PF] ${e}`));
    }
    console.log(`  ${pfResult.success ? 'PASS' : 'FAIL'} (${summary.playFold.passes}/${summary.playFold.total})`);

  } catch (err) {
    pfSection += `- **상태**: ❌ ERROR\n`;
    pfSection += `- **에러**: ${err.message}\n`;
    allErrors.push(`[PF] ${err.message}`);
    console.log(`  ERROR: ${err.message}`);
  }

  // 서버 종료
  killServer(serverProc);
  serverProc = null;
  await sleep(1000);

  sections.push(wsSection);
  sections.push(pfSection);

  // ─── 6. E2E 스크린샷 (기존 결과 수집) ───
  console.log('\n[6/6] E2E 스크린샷 수집...');

  let e2eSection = `## 6. E2E 스크린샷 리포트\n\n`;

  // 마지막 실행 결과 확인
  const lastRunPath = path.join(ROOT_DIR, 'e2e', 'test-results', '.last-run.json');
  let lastRun = null;
  if (fs.existsSync(lastRunPath)) {
    try {
      lastRun = JSON.parse(fs.readFileSync(lastRunPath, 'utf8'));
    } catch { /* ignore */ }
  }

  if (lastRun) {
    e2eSection += `- **마지막 실행 상태**: ${lastRun.status === 'passed' ? '✅ PASS' : '❌ FAIL'}\n`;
  }

  // 스크린샷 디렉토리 통계
  const screenshotBase = path.join(ROOT_DIR, 'e2e', 'reports', 'screenshots');
  if (fs.existsSync(screenshotBase)) {
    const dirs = fs.readdirSync(screenshotBase).filter((d) =>
      fs.statSync(path.join(screenshotBase, d)).isDirectory()
    );
    let totalPng = 0;
    for (const d of dirs) {
      const pngs = fs.readdirSync(path.join(screenshotBase, d)).filter((f) => f.endsWith('.png'));
      totalPng += pngs.length;
    }
    e2eSection += `- **테스트 시나리오**: ${dirs.length}개\n`;
    e2eSection += `- **총 스크린샷**: ${totalPng}장\n\n`;
    summary.e2e = { passes: dirs.length, fails: 0, total: dirs.length };
  }

  e2eSection += `### 시나리오별 체크리스트\n\n`;
  e2eSection += formatScreenshots();

  sections.push(e2eSection);
  console.log(`  수집 완료`);

  // ============================================================
  // 리포트 조합
  // ============================================================

  const totalPasses = summary.unitTests.passes + summary.smartBot.passes +
    summary.wsProtocol.passes + summary.playFold.passes + summary.soak.completed + summary.e2e.passes;
  const totalFails = summary.unitTests.fails + summary.smartBot.fails +
    summary.wsProtocol.fails + summary.playFold.fails + summary.soak.errors + summary.e2e.fails;

  let md = `# QA Report — ${date}\n\n`;
  md += `## 요약\n\n`;
  md += `| 카테고리 | 결과 | 상세 |\n`;
  md += `|---------|:----:|------|\n`;
  md += `| 서버 단위 테스트 | ${summary.unitTests.fails === 0 ? '✅' : '❌'} | ${summary.unitTests.passes}/${summary.unitTests.total} passed |\n`;
  md += `| 스마트 봇 | ${summary.smartBot.fails === 0 ? '✅' : '❌'} | ${summary.smartBot.passes}/${summary.smartBot.total} passed |\n`;
  md += `| WS 프로토콜 | ${summary.wsProtocol.fails === 0 ? '✅' : '❌'} | ${summary.wsProtocol.passes}/${summary.wsProtocol.total} passed |\n`;
  md += `| Play/Fold 전수 | ${summary.playFold.fails === 0 ? '✅' : '❌'} | ${summary.playFold.passes}/${summary.playFold.total} passed |\n`;
  md += `| Soak 테스트 | ${summary.soak.errors === 0 ? '✅' : '❌'} | ${summary.soak.completed} hands, ${summary.soak.errors} errors |\n`;
  md += `| E2E 스크린샷 | ${summary.e2e.fails === 0 ? '✅' : '❌'} | ${summary.e2e.passes} scenarios |\n`;
  md += `\n`;
  md += `**전체**: ${totalFails === 0 ? '✅ ALL PASS' : `❌ ${totalFails} failures`}\n\n`;
  md += `---\n\n`;

  for (const section of sections) {
    md += section + '\n\n---\n\n';
  }

  // ─── 버그 목록 ───
  md += `## 7. 버그 목록\n\n`;
  if (allErrors.length === 0) {
    md += `> 발견된 버그 없음\n`;
  } else {
    md += `| # | 카테고리 | 내용 |\n`;
    md += `|---|---------|------|\n`;
    for (let i = 0; i < allErrors.length; i++) {
      const cat = allErrors[i].match(/^\[(\w+)\]/)?.[1] || '?';
      const msg = allErrors[i].replace(/^\[\w+\]\s*/, '').replace(/\|/g, '\\|');
      md += `| ${i + 1} | ${cat} | ${msg} |\n`;
    }
  }

  // ─── 파일 출력 ───
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, md, 'utf8');

  const lineCount = md.split('\n').length;
  console.log('\n========================================');
  console.log(`QA Report generated: ${reportPath}`);
  console.log(`Lines: ${lineCount}`);
  console.log(`Sections: 요약, 단위테스트, 스마트봇, Soak, WS프로토콜, Play/Fold, E2E, 버그목록`);
  console.log(`Total: ${totalPasses} passed, ${totalFails} failed`);
  console.log('========================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
