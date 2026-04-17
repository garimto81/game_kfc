/**
 * OFC Pineapple 포커 게임 서버
 * Express REST API + WebSocket (ws)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { URL } = require('url');
const { Room } = require('./game/room');

const db = require('./db/database');
const jwtUtil = require('./auth/jwt');
const authRouter = require('./auth/auth-router');
const rateLimit = require('express-rate-limit');

db.init(process.env.DB_PATH || './data/ofc.db');

// CRIT-1: JWT_SECRET 미설정 시 서버 기동 거부 (환경 무관)
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET 환경변수가 설정되지 않았습니다. .env 파일 또는 docker-compose env 를 확인하세요.');
  process.exit(1);
}
jwtUtil.init(process.env.JWT_SECRET);

const app = express();

// nginx 리버스 프록시 뒤에서 X-Forwarded-For 기반 rate limit 정확히 동작시키기 위함
app.set('trust proxy', 1);

// HIGH-4: 프로덕션 환경에서 CORS_ORIGIN 미설정 시 경고
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('[WARN] CORS_ORIGIN 환경변수가 설정되지 않았습니다. 프로덕션에서는 명시적으로 설정하세요.');
}
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());
app.use('/auth', rateLimit({ windowMs: 60000, max: 10 }), authRouter);

const server = http.createServer(app);

// 방 관리
const rooms = new Map(); // roomId → Room

// 로비 WebSocket 클라이언트
const lobbyClients = new Set();

// ============================================================
// 방 lifecycle 중앙 관리
// ============================================================

function registerRoom(room) {
  rooms.set(room.id, room);

  room.on('empty', () => {
    console.log(`[WS-DIAG] room empty → delete room=${room.id}`);
    room.clearTurnTimer();
    for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
    room.disconnectTimers.clear();
    if (room._allDisconnectedTimer) {
      clearTimeout(room._allDisconnectedTimer);
      room._allDisconnectedTimer = null;
    }
    rooms.delete(room.id);
    broadcastLobby('roomDeleted', { roomId: room.id });
  });

  room.on('disconnectTimeout', (playerId, result) => {
    if (!rooms.has(room.id)) return; // empty에서 이미 삭제됨
    room.broadcast('playerLeft', {
      reason: '연결 시간 초과로 퇴장되었습니다.',
      players: room.getPlayerNames()
    });
    if (result && result.action === 'gameOver') {
      room.broadcast('gameOver', { results: {} });
      room.phase = 'waiting';
    } else if (result && result.action === 'nextTurn') {
      const advResult = room.advanceTurn();
      handleTurnResult(room, advResult, null);
    }
    if (rooms.has(room.id)) {
      broadcastRoomUpdate(room);
    }
  });

  broadcastLobby('roomCreated', { room: room.toRoomInfo() });
}

// ============================================================
// REST API
// ============================================================

/**
 * GET /api/rooms - 방 목록 조회
 */
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(r => r.toRoomInfo());
  res.json(roomList);
});

/**
 * POST /api/rooms - 방 생성
 */
app.post('/api/rooms', (req, res) => {
  const { name, max_players, turn_time_limit, password } = req.body;

  if (!name) {
    return res.status(400).json({ error: '방 이름이 필요합니다.' });
  }

  const room = new Room({
    name,
    maxPlayers: max_players || 3,
    turnTimeLimit: turn_time_limit != null ? turn_time_limit : 60,
    password: password || '',
  });

  registerRoom(room);

  res.status(201).json(room.toRoomInfo());
});

/**
 * POST /api/quickmatch - 빠른 매칭
 */
app.post('/api/quickmatch', (req, res) => {
  // 빈자리가 있는 방 찾기
  for (const [roomId, room] of rooms) {
    if (room.phase === 'waiting' && room.players.size < room.maxPlayers && room.password === '') {
      return res.json({ roomId });
    }
  }

  // 빈 방이 없으면 새로 생성
  const room = new Room({
    name: `빠른 매칭 #${rooms.size + 1}`,
    maxPlayers: 3,
    turnTimeLimit: 60
  });

  registerRoom(room);

  res.json({ roomId: room.id });
});

/**
 * DELETE /api/rooms/:roomId - 방 삭제
 */
app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  }

  room.clearTurnTimer();
  rooms.delete(roomId);

  broadcastLobby('roomDeleted', { roomId });

  res.json({ success: true });
});

// ============================================================
// WebSocket 서버 (경로 기반 라우팅)
// ============================================================

const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });

// 서버 ping: 30초마다 모든 WS에 ping — 2회 연속 무응답 시 terminate
const PING_INTERVAL = 30000;
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === undefined) return; // 핸들러 미등록 연결 스킵
    if (ws.isAlive === false) {
      console.log(`[WS-DIAG] ping timeout → terminate (playerId: ${ws._playerId || 'lobby'})`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws/lobby') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleLobbyConnection(ws);
    });
  } else if (pathname.startsWith('/ws/game/')) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const roomId = pathname.split('/ws/game/')[1];
    // CRIT-3: URL 토큰 파싱 유지 (하위 호환) + 메시지 기반 인증 추가
    const jwtToken = url.searchParams.get('token');
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.authUser = jwtToken ? jwtUtil.verify(jwtToken) : null;
      ws.authCompleted = !!ws.authUser; // 메시지 기반 인증 완료 여부
      handleGameConnection(ws, roomId);
    });
  } else {
    socket.destroy();
  }
});

// ============================================================
// 로비 WebSocket 핸들러
// ============================================================

function handleLobbyConnection(ws) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  lobbyClients.add(ws);

  // 초기 방 목록 전송
  const roomList = Array.from(rooms.values()).map(r => r.toRoomInfo());
  ws.send(JSON.stringify({ type: 'roomList', payload: { rooms: roomList } }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      // heartbeat → pong 응답
      if (msg.type === 'heartbeat') {
        try { ws.send(JSON.stringify({ type: 'pong', payload: {} })); } catch (_) {}
        return;
      }
    } catch (e) {
      // 무시
    }
  });

  ws.on('close', () => {
    lobbyClients.delete(ws);
  });

  ws.on('error', () => {
    lobbyClients.delete(ws);
  });
}

/**
 * 로비 클라이언트에 브로드캐스트
 */
function broadcastLobby(type, payload) {
  const message = JSON.stringify({ type, payload });
  for (const client of lobbyClients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}

/**
 * 로비에 방 정보 업데이트 브로드캐스트
 */
function broadcastRoomUpdate(room) {
  broadcastLobby('roomUpdated', { room: room.toRoomInfo() });
}

// ============================================================
// 게임 WebSocket 핸들러
// ============================================================

function handleGameConnection(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: '방을 찾을 수 없습니다.' } }));
    ws.close();
    return;
  }

  let playerId = null;
  let disconnected = false;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: '잘못된 메시지 형식입니다.' } }));
      return;
    }
    try {
      handleGameMessage(ws, room, msg, () => playerId, (id) => { playerId = id; ws._playerId = id; });
    } catch (e) {
      console.error(`[ERROR] ${msg.type} from ${playerId}:`, e.message, e.stack);
      ws.send(JSON.stringify({ type: 'error', payload: { message: `서버 오류: ${e.message}` } }));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WS-DIAG] ws.close: playerId=${playerId} code=${code} reason=${reason || ''}`);
    if (playerId && room && !disconnected) {
      disconnected = true;
      handleWsDisconnect(room, playerId);
    }
  });

  ws.on('error', (err) => {
    console.log(`[WS-DIAG] ws.error: playerId=${playerId} error=${err.message}`);
    if (playerId && room && !disconnected) {
      disconnected = true;
      handleWsDisconnect(room, playerId);
    }
  });
}

/**
 * WS 연결 끊김 처리 — disconnect + 빈 방 삭제
 */
function handleWsDisconnect(room, playerId) {
  const connectedBefore = Array.from(room.players.values()).filter(p => p.connected).length;
  console.log(`[WS-DIAG] disconnect: playerId=${playerId} phase=${room.phase} connected=${connectedBefore}→${connectedBefore - 1} players=${room.players.size}`);

  room.disconnectPlayer(playerId);
  room.broadcast('playerDisconnected', { playerId }, playerId);

  // 전원 이탈 시 기존 타이머 취소 → 10초 유예 후 전원 제거
  const connectedCount = Array.from(room.players.values()).filter(p => p.connected).length;
  if (connectedCount === 0 && room.players.size > 0) {
    console.log(`[WS-DIAG] all disconnected → 10s grace period room=${room.id}`);
    // 기존 개별 타이머 취소
    for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
    room.disconnectTimers.clear();
    // 10초 유예 타이머 (reconnect 시 취소됨)
    room._allDisconnectedTimer = setTimeout(() => {
      if (!rooms.has(room.id)) return;
      const stillConnected = Array.from(room.players.values()).filter(p => p.connected).length;
      if (stillConnected === 0) {
        console.log(`[WS-DIAG] grace period expired → clearing room=${room.id}`);
        // 전원 제거 → emit('empty') → 방 삭제
        for (const pid of [...room.playerOrder]) {
          room.removePlayer(pid);
        }
      }
    }, 10000);
  }

  if (rooms.has(room.id)) {
    broadcastRoomUpdate(room);
  }
}

/**
 * 게임 메시지 처리
 */
function handleGameMessage(ws, room, msg, getPlayerId, setPlayerId) {
  const type = msg.type;
  const payload = msg.payload || {};
  const playerId = getPlayerId();
  if (type !== 'heartbeat') {
    console.log(`[GAME] ${type} from ${playerId || '(new)'}`);
  }

  switch (type) {
    case 'heartbeat':
      try { ws.send(JSON.stringify({ type: 'pong', payload: {} })); } catch (_) {}
      break;

    // CRIT-3: 메시지 기반 JWT 인증 (URL 토큰 대체)
    case 'auth': {
      const token = payload.token;
      if (token) {
        const user = jwtUtil.verify(token);
        if (user) {
          ws.authUser = user;
          ws.authCompleted = true;
          ws.send(JSON.stringify({ type: 'authResult', payload: { success: true, name: user.name } }));
        } else {
          ws.send(JSON.stringify({ type: 'authResult', payload: { success: false, message: '유효하지 않은 토큰입니다.' } }));
        }
      } else {
        ws.send(JSON.stringify({ type: 'authResult', payload: { success: false, message: '토큰이 필요합니다.' } }));
      }
      break;
    }

    case 'joinRequest':
      handleJoinRequest(ws, room, payload, setPlayerId);
      break;

    case 'reconnect':
      handleReconnect(ws, room, payload, setPlayerId);
      break;

    case 'startGame':
      handleStartGame(room, playerId);
      break;

    case 'placeCard':
      handlePlaceCard(room, playerId, payload);
      break;

    case 'unplaceCard':
      handleUnplaceCard(room, playerId, payload);
      break;

    case 'discardCard':
      handleDiscardCard(room, playerId, payload);
      break;

    case 'unDiscardCard':
      handleUnDiscardCard(room, playerId, payload);
      break;

    case 'confirmPlacement':
      handleConfirmPlacement(room, playerId);
      break;

    case 'playOrFoldResponse':
      handlePlayOrFoldResponse(room, playerId, payload);
      break;

    case 'readyForNextHand':
      handleReadyForNextHand(room, playerId);
      break;

    case 'leaveGame':
      handleLeaveGame(room, playerId);
      break;

    case 'emote':
      handleEmote(room, playerId, payload);
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', payload: { message: `알 수 없는 메시지 타입: ${type}` } }));
  }
}

// ============================================================
// 게임 메시지 핸들러들
// ============================================================

function handleJoinRequest(ws, room, msg, setPlayerId) {
  const playerName = ws.authUser?.name || msg.playerName;
  if (!playerName || typeof playerName !== 'string') {
    ws.send(JSON.stringify({ type: 'error', payload: { message: '플레이어 이름이 필요합니다.' } }));
    return;
  }
  if (playerName.length > 50) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: '플레이어 이름은 50자 이하여야 합니다.' } }));
    return;
  }

  // CRIT-2: 방 비밀번호 검증 (hasPassword 방에 한정)
  const providedPassword = typeof msg.password === 'string' ? msg.password : '';
  if (!room.checkPassword(providedPassword)) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: '방 비밀번호가 올바르지 않습니다.', code: 'INVALID_PASSWORD' } }));
    return;
  }

  const result = room.addPlayer(playerName, ws);
  if (result.error) {
    ws.send(JSON.stringify({ type: 'error', payload: { message: result.error } }));
    return;
  }

  setPlayerId(result.playerId);

  // 참가 수락 응답
  ws.send(JSON.stringify({
    type: 'joinAccepted',
    payload: {
      playerId: result.playerId,
      sessionToken: result.sessionToken,
      playerCount: result.playerCount,
      hostId: result.hostId,
      players: result.players,
      playerName: result.playerName
    }
  }));

  // 다른 플레이어에게 알림
  room.broadcast('playerJoined', {
    playerCount: result.playerCount,
    players: result.players
  }, result.playerId);

  // 로비 업데이트
  broadcastRoomUpdate(room);
}

function handleReconnect(ws, room, msg, setPlayerId) {
  const { sessionToken } = msg;
  const result = room.reconnectPlayer(sessionToken, ws);

  if (!result) {
    console.log(`[WS-DIAG] reconnect FAIL: token=${sessionToken?.slice(0,8)}... room=${room.id} phase=${room.phase}`);
    ws.send(JSON.stringify({ type: 'error', payload: { message: '재접속에 실패했습니다.', rejoinRequired: true } }));
    return;
  }

  if (result.rejoinRequired) {
    console.log(`[WS-DIAG] reconnect → rejoin required: token=${sessionToken?.slice(0,8)}... playerId=${result.playerId}`);
    ws.send(JSON.stringify({ type: 'error', payload: { message: '세션이 만료되었습니다. 다시 참가해주세요.', rejoinRequired: true } }));
    return;
  }

  console.log(`[WS-DIAG] reconnect OK: playerId=${result.playerId} room=${room.id}`);
  setPlayerId(result.playerId);

  ws.send(JSON.stringify({
    type: 'reconnected',
    payload: {
      playerId: result.playerId,
      gameState: result.gameState
    }
  }));

  room.broadcast('playerReconnected', { playerId: result.playerId }, result.playerId);
}

function handleStartGame(room, playerId) {
  if (!playerId) return;

  const result = room.startGame(playerId);
  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  // 1. dealerSelection 브로드캐스트 (항상)
  room.broadcast('dealerSelection', {
    dealerCards: result.dealerCards,
    dealerId: result.dealerId,
    playerOrder: result.playerOrder
  });

  // 2. 5~6인이면 Play/Fold 단계
  if (room.players.size >= 5) {
    room.phase = 'playOrFold';
    const pofResult = room.initPlayOrFold();
    // 첫 번째 선택자에게만 request
    room.sendToPlayer(pofResult.currentPlayerId, 'playOrFoldRequest', {
      requiredPlayers: pofResult.requiredPlayers,
      totalPlayers: pofResult.totalPlayers
    });
    // 전체에게 상태 알림
    room.broadcast('playOrFoldUpdate', {
      playCount: 0, foldCount: 0,
      remaining: room.players.size,
      currentPlayerId: pofResult.currentPlayerId
    });
    broadcastRoomUpdate(room);
    return;
  }

  // 3. 2~4인: 즉시 게임 시작
  startGameAfterDealer(room);
}

function startGameAfterDealer(room, foldedPlayerIds = []) {
  room.phase = 'playing';
  room.handNumber = 1;
  const handResult = room.startNewHand(foldedPlayerIds);

  room.onTurnTimeout = (timedOutPlayerId, turnResult) => {
    handleTurnResult(room, turnResult, timedOutPlayerId);
    room.sendToPlayer(timedOutPlayerId, 'foldedThisHand', {
      gameState: room.getGameState(timedOutPlayerId)
    });
  };

  // disconnectTimeout → registerRoom의 'disconnectTimeout' 리스너에서 처리

  room.broadcast('gameStart', {
    turnTimeLimit: handResult.turnTimeLimit,
    currentTurnPlayerId: handResult.currentTurnPlayerId,
    dealerButtonId: room.dealerButtonId,
    ...handResult.gameState
  });

  sendDealCards(room);
  broadcastRoomUpdate(room);
}

function handlePlaceCard(room, playerId, payload) {
  if (!playerId) return;

  const { card, line } = payload;
  const result = room.placeCard(playerId, card, line);

  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  // 라인 완성 이벤트 (상대 화면 이펙트용)
  if (result.lineCompleted) {
    room.broadcast('lineCompleted', result.lineCompleted);
  }

  // 상태 업데이트 브로드캐스트
  broadcastStateUpdate(room);
}

function handleUnplaceCard(room, playerId, payload) {
  if (!playerId) return;

  const { card, line } = payload;
  const result = room.unplaceCard(playerId, card, line);

  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  broadcastStateUpdate(room);
}

function handleDiscardCard(room, playerId, payload) {
  if (!playerId) return;

  const { card } = payload;
  const result = room.discardCard(playerId, card);

  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  broadcastStateUpdate(room);
}

function handleUnDiscardCard(room, playerId, payload) {
  if (!playerId) return;

  const { card } = payload;
  const result = room.unDiscardCard(playerId, card);

  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  broadcastStateUpdate(room);
}

function handleConfirmPlacement(room, playerId) {
  if (!playerId) return;

  const result = room.confirmPlacement(playerId);

  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  handleTurnResult(room, result, playerId);
}

function handleReadyForNextHand(room, playerId) {
  if (!playerId) return;

  const result = room.playerReady(playerId);

  if (result.action === 'waitingReady') {
    room.broadcast('waitingReady', {
      readyCount: result.readyCount,
      totalCount: result.totalCount
    });
  } else if (result.action === 'nextHand') {
    // 모든 플레이어 준비 → 다음 핸드 시작
    room.broadcast('allPlayersReady', {});

    const handResult = room.startNewHand();

    // 타임아웃 콜백 재설정
    room.onTurnTimeout = (timedOutPlayerId, turnResult) => {
      handleTurnResult(room, turnResult, timedOutPlayerId);
      room.sendToPlayer(timedOutPlayerId, 'foldedThisHand', {
        gameState: room.getGameState(timedOutPlayerId)
      });
    };

    // gameStart 전송 (새 핸드)
    room.broadcast('gameStart', {
      turnTimeLimit: handResult.turnTimeLimit,
      currentTurnPlayerId: handResult.currentTurnPlayerId,
      dealerButtonId: room.dealerButtonId,
      ...handResult.gameState
    });

    // 각 플레이어에게 카드 딜
    sendDealCards(room);
    broadcastRoomUpdate(room);
  }
}

function handleLeaveGame(room, playerId) {
  if (!playerId) return;

  const result = room.removePlayer(playerId);
  if (!result) return;

  // 호스트 변경 알림
  if (result.hostChanged) {
    room.broadcast('hostChanged', { hostId: room.hostId });
  }

  // 플레이어 나감 알림
  room.broadcast('playerLeft', {
    reason: '플레이어가 방을 떠났습니다.',
    players: room.getPlayerNames()
  });

  if (result.action === 'gameOver') {
    const finalResults = {};
    for (const [id, player] of room.players) {
      finalResults[id] = {
        totalScore: player.totalScore,
        name: player.name
      };
    }
    room.broadcast('gameOver', { results: finalResults });
    room.phase = 'waiting';
    // 방 상태 초기화 (stale state 방지)
    room.readyPlayers = new Set();
    room.handNumber = 0;
    for (const [, player] of room.players) {
      player.totalScore = 0;
      player.board = { top: [], mid: [], bottom: [] };
      player.hand = [];
      player.placed = [];
      player.discarded = [];
      player.confirmed = false;
    }
  } else if (result.action === 'nextTurn') {
    const advResult = room.advanceTurn();
    handleTurnResult(room, advResult, null);
  }

  // 방 삭제는 removePlayer → 'empty' 이벤트에서 자동 처리
  if (rooms.has(room.id)) {
    broadcastRoomUpdate(room);
  }
}

function handlePlayOrFoldResponse(room, playerId, payload) {
  if (!playerId) return;
  const { choice } = payload;
  if (choice !== 'play' && choice !== 'fold') {
    room.sendToPlayer(playerId, 'error', { message: '유효하지 않은 선택입니다.' });
    return;
  }

  const result = room.playOrFoldResponse(playerId, choice);
  if (result.error) {
    room.sendToPlayer(playerId, 'error', { message: result.error });
    return;
  }

  if (result.action === 'allDecided') {
    // 모든 선택 완료
    room.broadcast('playOrFoldResult', {
      choices: result.choices,
      activePlayers: result.activePlayers
    });
    // fold 상태를 startNewHand에 전달
    const foldedIds = Object.entries(result.choices)
      .filter(([_, choice]) => choice === 'fold')
      .map(([id]) => id);
    // 게임 시작 (foldedIds 전달)
    startGameAfterDealer(room, foldedIds);
  } else {
    // 진행 중 — 전체에게 업데이트
    room.broadcast('playOrFoldUpdate', {
      playCount: result.playCount,
      foldCount: result.foldCount,
      remaining: result.remaining,
      currentPlayerId: result.currentPlayerId,
      lastChoice: result.lastChoice
    });
    // 다음 차례 플레이어에게 request
    room.sendToPlayer(result.currentPlayerId, 'playOrFoldRequest', {
      requiredPlayers: 4,
      totalPlayers: room.players.size,
      playCount: result.playCount,
      foldCount: result.foldCount
    });
  }
}

function handleEmote(room, playerId, payload) {
  if (!playerId) return;
  room.broadcast('emote', { playerId, emote_id: payload.emote_id });
}

// ============================================================
// 유틸 함수
// ============================================================

/**
 * 턴 결과 처리
 */
function handleTurnResult(room, result, triggerPlayerId) {
  if (!result) return;

  switch (result.action) {
    case 'turnChanged':
      room.broadcast('turnChanged', {
        currentTurnPlayerId: result.currentTurnPlayerId,
        turnDeadline: room.turnDeadline,
        turnTimeLimit: room.turnTimeLimit
      });
      // 다음 턴 플레이어에게 카드 딜 (아직 안 받았으면)
      sendDealToPlayer(room, result.currentTurnPlayerId);
      broadcastStateUpdate(room);
      break;

    case 'newRound':
      // 새 라운드 → 각 플레이어에게 카드 딜
      sendDealCards(room);
      broadcastStateUpdate(room);
      break;

    case 'handScored':
      room.broadcast('handScored', {
        results: result.results,
        handNumber: result.handNumber
      });
      break;

    case 'flConfirmed':
      // FL 완료, 비FL 대기 — 상태 업데이트만
      broadcastStateUpdate(room);
      break;

    case 'waitingForFL':
      // 비FL 전원 완료, FL 대기 중
      room.broadcast('waitingForFL', {
        message: 'Waiting for Fantasyland...'
      });
      broadcastStateUpdate(room);
      break;

    case 'gameOver':
      const finalResults = {};
      for (const [id, player] of room.players) {
        finalResults[id] = {
          totalScore: player.totalScore,
          name: player.name
        };
      }
      room.broadcast('gameOver', { results: finalResults });
      room.phase = 'waiting';
      broadcastRoomUpdate(room);
      break;
  }
}

/**
 * 현재 턴 플레이어에게만 딜 카드 전송
 */
function sendDealCards(room) {
  const currentId = room.getCurrentTurnPlayerId();

  // 비FL 현재 턴 플레이어에게 딜
  if (currentId) {
    const player = room.players.get(currentId);
    if (player && player.hand.length > 0) {
      room.sendToPlayer(currentId, 'dealCards', {
        cards: player.hand,
        round: room.round,
        inFantasyland: player.inFantasyland,
        handNumber: room.handNumber,
        turnDeadline: room.turnDeadline,
        turnTimeLimit: room.turnTimeLimit,
        serverTime: Date.now() / 1000
      });
    }
  }

  // FL 플레이어는 항상 딜 (currentId 유무와 무관)
  for (const [playerId, p] of room.players) {
    if (p.inFantasyland && p.hand.length > 0 && playerId !== currentId) {
      room.sendToPlayer(playerId, 'dealCards', {
        cards: p.hand,
        round: room.round,
        inFantasyland: true,
        handNumber: room.handNumber,
        turnDeadline: room.turnDeadline,
        turnTimeLimit: room.turnTimeLimit,
        serverTime: Date.now() / 1000
      });
    }
  }
}

/**
 * 다음 턴 플레이어에게 딜 카드 전송
 */
function sendDealToPlayer(room, playerId) {
  const player = room.players.get(playerId);
  if (player && player.hand.length > 0) {
    room.sendToPlayer(playerId, 'dealCards', {
      cards: player.hand,
      round: room.round,
      inFantasyland: player.inFantasyland,
      handNumber: room.handNumber,
      turnDeadline: room.turnDeadline,
      turnTimeLimit: room.turnTimeLimit,
      serverTime: Date.now() / 1000
    });
  }
}

/**
 * 상태 업데이트 브로드캐스트 (각 플레이어 개별 시점)
 */
function broadcastStateUpdate(room) {
  room.broadcastIndividual('stateUpdate', (playerId) => {
    const state = room.getGameState(playerId);
    return {
      players: state.players,
      phase: state.phase,
      handNumber: state.handNumber,
      turnDeadline: state.turnDeadline,
      turnTimeLimit: state.turnTimeLimit,
      serverTime: Date.now() / 1000,
      currentTurnPlayerId: state.currentTurnPlayerId
    };
  });
}

// ============================================================
// 서버 시작
// ============================================================

// Flutter Web 정적 파일 서빙 (build/web 디렉토리)
const webBuildPath = path.join(__dirname, '..', 'build', 'web');
const fs = require('fs');
if (fs.existsSync(webBuildPath)) {
  app.use(express.static(webBuildPath));
  // SPA fallback: 알려진 API/WS 경로가 아닌 모든 요청은 index.html로
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) return next();
    res.sendFile(path.join(webBuildPath, 'index.html'));
  });
  console.log(`Flutter Web serving from ${webBuildPath}`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`OFC Pineapple 게임 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

module.exports = { app, server };
