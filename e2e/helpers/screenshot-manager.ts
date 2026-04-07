/**
 * 스크린샷 매니저
 * 체크포인트별 모든 플레이어 스크린샷을 캡처하고 HTML 리포트를 생성한다
 */
import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

interface CaptureRecord {
  checkpointId: string;
  playerName: string;
  description: string;
  filePath: string;
  timestamp: number;
}

export class ScreenshotManager {
  private testId: string;
  private captures: CaptureRecord[] = [];
  private baseDir: string;

  constructor(runId: string, testId: string) {
    this.testId = testId;
    this.baseDir = path.join(__dirname, '..', 'reports', 'screenshots', runId, testId);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * 스크린샷 캡처
   */
  async capture(
    page: Page,
    checkpointId: string,
    playerName: string,
    description: string
  ): Promise<string> {
    const fileName = `${checkpointId}-${playerName}.png`;
    const filePath = path.join(this.baseDir, fileName);

    await page.screenshot({ path: filePath, fullPage: true });

    this.captures.push({
      checkpointId,
      playerName,
      description,
      filePath: fileName, // 상대 경로 (리포트용)
      timestamp: Date.now(),
    });

    return filePath;
  }

  /**
   * 여러 플레이어의 같은 체크포인트 스크린샷을 한 번에 캡처
   */
  async captureAll(
    pages: { page: Page; playerName: string }[],
    checkpointId: string,
    description: string
  ): Promise<string[]> {
    const paths: string[] = [];
    for (const { page, playerName } of pages) {
      const p = await this.capture(page, checkpointId, playerName, description);
      paths.push(p);
    }
    return paths;
  }

  /**
   * HTML 리포트 생성 — 체크포인트별로 모든 플레이어 스크린샷을 나란히 표시
   */
  generateReport(): string {
    // 체크포인트별 그룹화
    const grouped = new Map<string, CaptureRecord[]>();
    for (const cap of this.captures) {
      const arr = grouped.get(cap.checkpointId) || [];
      arr.push(cap);
      grouped.set(cap.checkpointId, arr);
    }

    const checkpoints = Array.from(grouped.entries());

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>E2E Screenshot Report — ${this.testId}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #00d2ff; }
    .checkpoint { margin: 30px 0; border: 1px solid #333; border-radius: 8px; padding: 16px; background: #16213e; }
    .checkpoint h2 { color: #e94560; margin-top: 0; }
    .checkpoint .desc { color: #aaa; font-size: 0.9em; margin-bottom: 12px; }
    .screenshots { display: flex; gap: 12px; overflow-x: auto; }
    .screenshot { flex: 0 0 auto; text-align: center; }
    .screenshot img { max-width: 480px; border: 2px solid #333; border-radius: 4px; }
    .screenshot .name { font-weight: bold; color: #00d2ff; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>E2E Screenshot Report: ${this.testId}</h1>
  <p>Total checkpoints: ${checkpoints.length} | Total screenshots: ${this.captures.length}</p>
  ${checkpoints
    .map(
      ([cpId, caps]) => `
  <div class="checkpoint">
    <h2>${cpId}</h2>
    <div class="desc">${caps[0]?.description || ''}</div>
    <div class="screenshots">
      ${caps
        .map(
          (c) => `
      <div class="screenshot">
        <img src="${c.filePath}" alt="${c.checkpointId} - ${c.playerName}" />
        <div class="name">${c.playerName}</div>
      </div>`
        )
        .join('')}
    </div>
  </div>`
    )
    .join('')}
</body>
</html>`;

    const reportPath = path.join(this.baseDir, 'report.html');
    fs.writeFileSync(reportPath, html);
    return reportPath;
  }
}
