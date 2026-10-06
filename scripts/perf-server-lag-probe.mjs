import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

const WS_URL = process.env.PROBE_WS_URL || 'wss://24.144.88.205/multiplayer';
const HTTP_BASE = process.env.PROBE_HTTP_BASE || 'https://24.144.88.205';
const INTERVAL_MS = 50;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => performance.now();

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function makePng(width = 768, height = 512, seed = 0x12345678) {
  let state = seed >>> 0;
  const raw = Buffer.allocUnsafe((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
      raw[offset++] = state & 0xff;
      raw[offset++] = (state >>> 8) & 0xff;
      raw[offset++] = (state >>> 16) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Client {
  constructor(name, roomId) {
    this.name = name;
    this.roomId = roomId;
    this.playerId = null;
    this.socket = null;
    this.messages = [];
    this.waiters = [];
    this.capabilities = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      this.socket = socket;
      const timeout = setTimeout(() => reject(new Error(this.name + ' connect timeout')), 15000);
      socket.onerror = () => reject(new Error(this.name + ' websocket error'));
      socket.onclose = event => {
        if (!this.playerId) reject(new Error(this.name + ' closed before join: ' + event.code));
      };
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        this.messages.push({ t: now(), message });
        if (message.type === 'hello') {
          this.playerId = message.playerId;
          this.capabilities = Array.isArray(message.capabilities) ? message.capabilities : [];
          this.send({
            type: 'join',
            protocol: 2,
            roomId: this.roomId,
            displayName: this.name,
            username: this.name.toLowerCase(),
            nickName: this.name,
          });
        }
        for (const waiter of [...this.waiters]) {
          if (waiter.predicate(message)) {
            clearTimeout(waiter.timeout);
            this.waiters.splice(this.waiters.indexOf(waiter), 1);
            waiter.resolve({ t: now(), message });
          }
        }
        if (message.type === 'world_snapshot' && message.roomId === this.roomId && message.playerId === this.playerId) {
          clearTimeout(timeout);
          resolve(message);
        }
      };
    });
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error(this.name + ' socket not open');
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const existing = this.messages.find(entry => predicate(entry.message));
      if (existing) return resolve(existing);
      const waiter = { predicate, resolve, reject, timeout: null };
      waiter.timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(this.name + ' wait timeout'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

function startMovementSender(sender, observer, marks) {
  let seq = 0;
  let previousArrival = null;
  const gaps = [];
  const originalOnMessage = observer.socket.onmessage;

  observer.socket.onmessage = event => {
    let parsed = null;
    try { parsed = JSON.parse(String(event.data)); } catch {}
    if (parsed?.type === 'player_state' && parsed.playerId === sender.playerId &&
        Array.isArray(parsed.state?.position) && Number.isFinite(parsed.state.position[0])) {
      const arrival = now();
      if (previousArrival !== null) {
        gaps.push({
          at: arrival,
          gap: arrival - previousArrival,
          seq: Math.round(parsed.state.position[0]),
        });
      }
      previousArrival = arrival;
    }
    originalOnMessage?.call(observer.socket, event);
  };

  const timer = setInterval(() => {
    seq++;
    try {
      sender.send({
        type: 'player_state',
        state: {
          position: [seq, 0, 0],
          rotation: [0, 0, 0],
          movement: 'walking',
          tool: 'off',
          jumping: false,
          animation: 'walking',
          emote: '',
          visibleHeldItem: 'none',
          flightState: 'grounded',
          cosmetics: { outfit: 'street', top: 'coral', bottom: 'charcoal', accessory: 'none' },
        },
      });
    } catch {}
  }, INTERVAL_MS);

  return {
    stop: () => clearInterval(timer),
    gaps,
    summarize(label, start, end) {
      const windowStart = start - 250;
      const windowEnd = end + 1500;
      const inWindow = gaps.filter(g => g.at >= windowStart && g.at <= windowEnd);
      const values = inWindow.map(g => g.gap);
      const spikes = inWindow.filter(g => g.gap >= 100);
      return {
        label,
        windowStart,
        windowEnd,
        samples: values.length,
        p50Ms: +percentile(values, 0.50).toFixed(1),
        p95Ms: +percentile(values, 0.95).toFixed(1),
        maxMs: +(values.length ? Math.max(...values) : 0).toFixed(1),
        spikes: spikes.map(g => ({ at: +g.at.toFixed(1), gapMs: +g.gap.toFixed(1), seq: g.seq })),
      };
    },
  };
}

async function uploadImage(png, label, marks) {
  const start = now();
  marks.push({ label: label + ':upload:start', t: start, bytes: png.length });
  const response = await fetch(HTTP_BASE + '/artwork-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
  const body = await response.text();
  const end = now();
  marks.push({ label: label + ':upload:end', t: end, status: response.status });
  if (!response.ok) throw new Error(label + ' upload failed ' + response.status + ': ' + body.slice(0, 300));
  const json = JSON.parse(body);
  if (!json.assetRef) throw new Error(label + ' upload missing assetRef: ' + body);
  return { assetRef: json.assetRef, start, end, status: response.status };
}

async function getAsset(assetRef, label, marks) {
  const start = now();
  marks.push({ label: label + ':get:start', t: start });
  const response = await fetch(assetRef, { cache: 'no-store' });
  const bytes = (await response.arrayBuffer()).byteLength;
  const end = now();
  marks.push({ label: label + ':get:end', t: end, status: response.status, bytes });
  return {
    start, end, status: response.status, bytes,
    cacheControl: response.headers.get('cache-control'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    contentType: response.headers.get('content-type'),
  };
}

async function createPieceWithStrokes(client, count, pointsPerStroke, marks, label) {
  const pieceId = randomUUID();
  const surfaceId = 'ss1:0:0:perfprobe/f4/l0';
  client.send({
    type: 'piece_create',
    pieceId,
    anchor: [0, 1, 0],
    bounds: { min: [-1, 0, -0.1], max: [1, 2, 0.1] },
  });
  marks.push({ label: label + ':piece_create', t: now(), pieceId });

  await sleep(100);

  const strokeStart = now();
  for (let i = 0; i < count; i++) {
    const strokeId = pieceId + '.s' + i;
    client.send({
      type: 'stroke_begin',
      strokeId,
      pieceId,
      surfaceId,
      colour: '#ff3355',
      tool: 'marker',
      brushSize: 2,
      operation: 'paint',
      opacity: 1,
      layerIndex: 0,
      face: '4',
    });
    const points = Array.from({ length: pointsPerStroke }, (_, p) => ({
      x: -0.9 + ((p % 20) / 20) * 1.8,
      y: 0.1 + ((i % 20) / 20) * 1.8,
      z: 0,
      pressure: 1,
    }));
    client.send({ type: 'stroke_points', strokeId, points });
    client.send({ type: 'stroke_end', strokeId });
    await sleep(40);
  }
  const strokeEnd = now();
  marks.push({ label: label + ':strokes:end', t: strokeEnd, strokeCount: count, pointCount: count * pointsPerStroke });

  client.send({ type: 'piece_complete', pieceId, title: 'perf-' + label });
  const completeSent = now();
  marks.push({ label: label + ':piece_complete:sent', t: completeSent });

  return { pieceId, surfaceId, strokeStart, strokeEnd, completeSent };
}

async function runScenario({ label, strokeCount, pointsPerStroke, seed }) {
  const roomId = 'perf-lag-' + label + '-' + Date.now().toString(36);
  const a = new Client('ProbeWalker_' + label, roomId);
  const b = new Client('ProbePainter_' + label, roomId);
  const marks = [];
  try {
    await Promise.all([a.connect(), b.connect()]);
    console.log(JSON.stringify({ event: 'joined', label, roomId, a: a.playerId, b: b.playerId, capabilities: b.capabilities }));
    const movement = startMovementSender(a, b, marks);
    await sleep(1500);

    const baselineEnd = now();
    const baselineStart = baselineEnd - 1000;
    const baseline = movement.summarize(label + ':baseline', baselineStart, baselineEnd);

    const png = makePng(768, 512, seed);
    console.log(JSON.stringify({ event: 'image', label, bytes: png.length }));

    const posterUpload = await uploadImage(png, label + ':poster', marks);
    b.send({
      type: 'artwork_place',
      actionId: randomUUID(),
      artworkId: randomUUID(),
      assetRef: posterUpload.assetRef,
      surfaceId: 'ss1:0:0:perfprobe/f4/l0',
      face: '4',
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      width: 2,
      height: 2,
    });
    const posterPlacedSent = now();
    marks.push({ label: label + ':poster_place:sent', t: posterPlacedSent });
    await sleep(1600);
    const posterWindow = movement.summarize(label + ':poster_upload_and_place', posterUpload.start, posterPlacedSent);

    const piece = await createPieceWithStrokes(b, strokeCount, pointsPerStroke, marks, label);
    await sleep(300);

    const flattenPng = makePng(768, 512, seed ^ 0xa5a5a5a5);
    const flattenUpload = await uploadImage(flattenPng, label + ':flatten', marks);

    const flattenSent = now();
    b.send({
      type: 'piece_flatten',
      pieceId: piece.pieceId,
      assetRef: flattenUpload.assetRef,
      surfaceId: piece.surfaceId,
      face: '4',
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      width: 2,
      height: 2,
    });
    marks.push({ label: label + ':piece_flatten:sent', t: flattenSent });

    let flattenAck = null;
    let flattenError = null;
    try {
      flattenAck = await b.waitFor(
        msg => (msg.type === 'piece_flattened' && msg.pieceId === piece.pieceId) ||
               (msg.type === 'error' && typeof msg.code === 'string'),
        10000,
      );
      if (flattenAck.message.type === 'error') flattenError = flattenAck.message;
    } catch (error) {
      flattenError = { code: 'ack_timeout', message: String(error) };
    }
    const flattenAckAt = flattenAck?.t ?? now();
    marks.push({ label: label + ':piece_flatten:ack', t: flattenAckAt, type: flattenAck?.message?.type, error: flattenError });

    await sleep(1800);
    const flattenWindow = movement.summarize(label + ':piece_flatten', flattenSent, flattenAckAt);

    const get1 = await getAsset(flattenUpload.assetRef, label + ':asset1', marks);
    await sleep(300);
    const get2 = await getAsset(flattenUpload.assetRef, label + ':asset2', marks);
    await sleep(1300);
    const getWindow = movement.summarize(label + ':asset_gets', get1.start, get2.end);

    movement.stop();

    const allGapValues = movement.gaps.map(g => g.gap);
    return {
      label,
      roomId,
      strokeCount,
      pointCount: strokeCount * pointsPerStroke,
      capabilities: b.capabilities,
      upload: {
        posterMs: +(posterUpload.end - posterUpload.start).toFixed(1),
        flattenMs: +(flattenUpload.end - flattenUpload.start).toFixed(1),
        imageBytes: flattenPng.length,
      },
      flatten: {
        ackMs: +(flattenAckAt - flattenSent).toFixed(1),
        ackType: flattenAck?.message?.type ?? null,
        error: flattenError,
      },
      assetGet: {
        firstMs: +(get1.end - get1.start).toFixed(1),
        secondMs: +(get2.end - get2.start).toFixed(1),
        bytes: get1.bytes,
        cacheControl: get1.cacheControl,
        etag: get1.etag,
        lastModified: get1.lastModified,
      },
      movement: {
        overallP50Ms: +percentile(allGapValues, 0.5).toFixed(1),
        overallP95Ms: +percentile(allGapValues, 0.95).toFixed(1),
        overallMaxMs: +(allGapValues.length ? Math.max(...allGapValues) : 0).toFixed(1),
        baseline,
        posterWindow,
        flattenWindow,
        getWindow,
      },
      marks,
    };
  } finally {
    a.close();
    b.close();
  }
}

const started = Date.now();
const results = [];
for (const scenario of [
  { label: 'few', strokeCount: 5, pointsPerStroke: 20, seed: 0x11111111 },
  { label: 'many', strokeCount: 120, pointsPerStroke: 100, seed: 0x22222222 },
]) {
  try {
    results.push(await runScenario(scenario));
  } catch (error) {
    console.error(JSON.stringify({ event: 'scenario_error', label: scenario.label, error: error?.stack || String(error) }));
    results.push({ label: scenario.label, error: String(error) });
  }
}

console.log('=== PERF_PROBE_RESULT ===');
console.log(JSON.stringify({
  startedAt: new Date(started).toISOString(),
  finishedAt: new Date().toISOString(),
  wsUrl: WS_URL,
  httpBase: HTTP_BASE,
  results,
}, null, 2));
