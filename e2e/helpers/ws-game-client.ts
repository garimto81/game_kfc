/**
 * WS 게임 클라이언트 — E2E 하이브리드 테스트용
 *
 * ws-protocol.test.js의 connectPlayer 패턴을 TypeScript로 포팅.
 * Playwright 브라우저(스크린샷 전용)와 병행하여 게임 조작을 WS로 수행한다.
 */
import WebSocket from 'ws';

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '8098');
const BASE_URL = `http://localhost:${SERVER_PORT}`;
const WS_URL = `ws://localhost:${SERVER_PORT}`;

export interface GameMessage {
  type: string;
  payload: Record<string, any>;
}

export class WSGameClient {
  private ws: WebSocket | null = null;
  private messages: GameMessage[] = [];
  private messageListeners: Array<(msg: GameMessage) => void> = [];
  /** waitFor에서 타입별로 마지막으로 소비한 인덱스를 추적 */
  private consumedIndex: Map<string, number> = new Map();
  public playerId: string | null = null;
  public sessionToken: string | null = null;
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  // ============================================================
  // REST API
  // ============================================================

  /**
   * REST API로 방 생성
   */
  static async createRoom(
    name: string,
    maxPlayers = 2,
    timeLimit = 60
  ): Promise<{ id: string; name: string }> {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        max_players: maxPlayers,
        turn_time_limit: timeLimit,
      }),
    });
    return res.json();
  }

  /**
   * REST API로 방 목록 조회
   */
  static async listRooms(): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/api/rooms`);
    return res.json();
  }

  /**
   * REST API로 모든 방 삭제 (테스트 정리용)
   */
  static async deleteAllRooms(): Promise<number> {
    const rooms = await WSGameClient.listRooms();
    let deleted = 0;
    for (const room of rooms) {
      await fetch(`${BASE_URL}/api/rooms/${room.id}`, { method: 'DELETE' }).catch(() => {});
      deleted++;
    }
    return deleted;
  }

  // ============================================================
  // WS 연결 + 게임 참가
  // ============================================================

  /**
   * WS 연결 + joinRequest → joinAccepted 대기
   */
  async join(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_URL}/ws/game/${roomId}`);

      this.ws.on('open', () => {
        this.send('joinRequest', { playerName: this.name });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        const msg: GameMessage = JSON.parse(data.toString());
        this.messages.push(msg);

        // 리스너 호출
        for (const listener of this.messageListeners) {
          listener(msg);
        }

        if (msg.type === 'joinAccepted') {
          this.playerId = msg.payload.playerId;
          this.sessionToken = msg.payload.sessionToken;
          resolve();
        }
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => reject(new Error(`[${this.name}] Join timeout`)), 10000);
    });
  }

  /**
   * 기존 sessionToken으로 재접속
   */
  async reconnect(roomId: string, sessionToken: string): Promise<GameMessage> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_URL}/ws/game/${roomId}`);

      this.ws.on('open', () => {
        this.send('reconnect', { sessionToken });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        const msg: GameMessage = JSON.parse(data.toString());
        this.messages.push(msg);

        for (const listener of this.messageListeners) {
          listener(msg);
        }

        if (msg.type === 'reconnected') {
          this.playerId = msg.payload.playerId;
          this.sessionToken = sessionToken;
          resolve(msg);
        }
        if (msg.type === 'error') {
          reject(new Error(msg.payload.message));
        }
      });

      this.ws.on('error', reject);

      setTimeout(() => reject(new Error(`[${this.name}] Reconnect timeout`)), 10000);
    });
  }

  // ============================================================
  // 메시지 송수신
  // ============================================================

  /**
   * WS 메시지 전송
   */
  send(type: string, payload: Record<string, any> = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  /**
   * 특정 타입의 다음 메시지 대기
   * 타입별로 마지막 소비 인덱스를 추적하여, 같은 메시지를 두 번 반환하지 않는다.
   * 이미 도착한 미소비 메시지가 있으면 즉시 반환한다.
   */
  async waitFor(type: string, timeout = 30000): Promise<GameMessage> {
    const startFrom = (this.consumedIndex.get(type) ?? -1) + 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        const recentTypes = this.messages.slice(startFrom).map((m) => m.type);
        reject(
          new Error(
            `[${this.name}] Timeout waiting for '${type}' (${timeout}ms). ` +
              `Messages since idx ${startFrom}: [${recentTypes.join(', ')}]`
          )
        );
      }, timeout);

      const found = (idx: number) => {
        cleanup();
        this.consumedIndex.set(type, idx);
        resolve(this.messages[idx]);
      };

      const listener = (msg: GameMessage) => {
        if (msg.type === type) {
          const idx = this.messages.length - 1;
          if (idx >= startFrom) {
            found(idx);
          }
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        const listenerIdx = this.messageListeners.indexOf(listener);
        if (listenerIdx >= 0) this.messageListeners.splice(listenerIdx, 1);
      };

      // 이미 도착한 미소비 메시지 검색
      for (let i = startFrom; i < this.messages.length; i++) {
        if (this.messages[i].type === type) {
          found(i);
          return;
        }
      }

      this.messageListeners.push(listener);
    });
  }

  /**
   * 특정 타입의 모든 메시지 필터링
   */
  getMessages(type?: string): GameMessage[] {
    if (!type) return [...this.messages];
    return this.messages.filter((m) => m.type === type);
  }

  /**
   * 특정 타입의 마지막 메시지
   */
  getLastMessage(type: string): GameMessage | undefined {
    return [...this.messages].reverse().find((m) => m.type === type);
  }

  /**
   * 모든 메시지 (디버깅용)
   */
  get allMessages(): GameMessage[] {
    return [...this.messages];
  }

  /**
   * 메시지 수
   */
  get messageCount(): number {
    return this.messages.length;
  }

  // ============================================================
  // 정리
  // ============================================================

  /**
   * WS 연결 종료
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageListeners = [];
  }

  /**
   * 메시지 초기화
   */
  clearMessages(): void {
    this.messages = [];
    this.consumedIndex.clear();
  }
}

/**
 * 편의 함수: sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
