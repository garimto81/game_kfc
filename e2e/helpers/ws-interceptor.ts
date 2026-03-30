/**
 * WebSocket 메시지 인터셉터
 * Flutter Web ↔ 게임 서버 간 WS 메시지를 캡처/필터링
 */
import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export interface WsMessage {
  direction: 'sent' | 'received';
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
  raw: string;
}

export class WsInterceptor {
  readonly playerName: string;
  private messages: WsMessage[] = [];

  constructor(playerName: string) {
    this.playerName = playerName;
  }

  /**
   * page의 WebSocket 이벤트를 가로채 메시지를 수집한다
   */
  async attach(page: Page): Promise<void> {
    // CDP 세션을 통해 WebSocket 프레임 캡처
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');

    cdp.on('Network.webSocketFrameSent', (params) => {
      this.recordMessage('sent', params.response.payloadData);
    });

    cdp.on('Network.webSocketFrameReceived', (params) => {
      this.recordMessage('received', params.response.payloadData);
    });
  }

  private recordMessage(direction: 'sent' | 'received', raw: string): void {
    try {
      const parsed = JSON.parse(raw);
      this.messages.push({
        direction,
        timestamp: Date.now(),
        type: parsed.type || 'unknown',
        payload: parsed.payload || {},
        raw,
      });
    } catch {
      this.messages.push({
        direction,
        timestamp: Date.now(),
        type: 'unparseable',
        payload: {},
        raw,
      });
    }
  }

  /**
   * 특정 타입의 메시지만 필터링
   */
  getMessages(type?: string): WsMessage[] {
    if (!type) return [...this.messages];
    return this.messages.filter((m) => m.type === type);
  }

  /**
   * 특정 타입의 마지막 메시지
   */
  getLastMessage(type: string): WsMessage | undefined {
    const filtered = this.getMessages(type);
    return filtered[filtered.length - 1];
  }

  /**
   * 수신 메시지 중 특정 타입이 올 때까지 대기
   */
  async waitForMessage(type: string, timeoutMs = 30_000): Promise<WsMessage> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const msg = this.getLastMessage(type);
      if (msg && msg.timestamp >= start) return msg;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`[${this.playerName}] WS message '${type}' not received within ${timeoutMs}ms`);
  }

  /**
   * JSON 파일로 로그 저장
   */
  saveLog(testId: string): string {
    const dir = path.join(__dirname, '..', 'reports', 'ws-logs');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${testId}-${this.playerName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.messages, null, 2));
    return filePath;
  }

  /** 메시지 수 */
  get count(): number {
    return this.messages.length;
  }

  /** 초기화 */
  clear(): void {
    this.messages = [];
  }
}

/**
 * 편의 함수: page에 인터셉터를 부착하고 반환
 */
export async function attachInterceptor(page: Page, playerName: string): Promise<WsInterceptor> {
  const interceptor = new WsInterceptor(playerName);
  await interceptor.attach(page);
  return interceptor;
}
