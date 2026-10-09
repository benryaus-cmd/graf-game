import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSheetPosition, defaultSheetPosition, normalizeSheetPosition, restoreSheetPosition, readSheetAnchorSize, readSheetPosition, sheetLocalPointer, sheetPositionKey } from '../src/components/movableSheetLayout';

test('floating panels stay inside visible bounds including safe-area margins', () => {
 const bounds = { width: 384, height: 606, left: 12, right: 16, top: 8, bottom: 20 }, size = { width: 280, height: 400 };
 assert.deepEqual(clampSheetPosition({ x: -40, y: 500 }, bounds, size), { x: 12, y: 186 });
 assert.deepEqual(clampSheetPosition({ x: 500, y: -30 }, bounds, size), { x: 88, y: 8 });
 assert.deepEqual(clampSheetPosition({ x: 99, y: 99 }, { ...bounds, height: 180 }, { width: 500, height: 300 }), { x: 12, y: 8 });
});

test('saved panel positions preserve relative travel when viewport and keyboard dimensions change', () => {
 const bounds = { width: 606, height: 384, left: 8, right: 8, top: 8, bottom: 8 }, size = { width: 250, height: 150 };
 const normalized = normalizeSheetPosition({ x: 178, y: 117 }, bounds, size);
 assert.deepEqual(normalized, { x: .5, y: .5 });
 assert.deepEqual(restoreSheetPosition(normalized, { ...bounds, width: 384, height: 606 }, size), { x: 67, y: 228 });
 assert.deepEqual(restoreSheetPosition(normalized, { ...bounds, width: 384, height: 220 }, size), { x: 67, y: 35 });
});

test('fresh panels start at upper right below the HUD and taller panels clamp to the visible area', () => {
 const bounds = { width: 384, height: 606, left: 8, right: 8, top: 8, bottom: 8 };
 assert.deepEqual(defaultSheetPosition(bounds, { width: 330, height: 400 }), { x: 46, y: 96 });
 assert.deepEqual(defaultSheetPosition(bounds, { width: 330, height: 580 }), { x: 46, y: 18 });
});

test('local pointer conversion follows portrait quarter-turn and shell scaling', () => {
 const rectangle = { left: 10, top: 20, width: 384, height: 606 };
 assert.deepEqual(sheetLocalPointer({ x: 202, y: 323 }, rectangle, 606, 384, true), { x: 303, y: 192 });
 const start = sheetLocalPointer({ x: 100, y: 100 }, rectangle, 606, 384, true);
 const moved = sheetLocalPointer({ x: 150, y: 200 }, rectangle, 606, 384, true);
 assert.ok(Math.abs(moved.x - start.x + 100) < 1e-8);
 assert.ok(Math.abs(moved.y - start.y - 50) < 1e-8);
 assert.deepEqual(sheetLocalPointer({ x: 202, y: 323 }, rectangle, 768, 1212, false), { x: 384, y: 606 });
});

test('device positions reject malformed storage and normalize finite out-of-range values', () => {
 assert.equal(readSheetPosition('not json'), null);
 assert.equal(readSheetPosition('{"x":"1","y":0}'), null);
 assert.equal(readSheetPosition('{"x":0}'), null);
 assert.deepEqual(readSheetPosition('{"x":3,"y":-1}'), { x: 1, y: 0 });
 assert.equal(sheetPositionKey('paint-sheet', 'PAINT TOOLS'), 'graffciti.sheet-position.v1:paint-sheet:PAINT TOOLS');
 assert.notEqual(sheetPositionKey('chat-sheet', 'CHAT'), sheetPositionKey('avatar-sheet', 'STREET CLOSET'));
});

test('legacy positions and invalid anchor sizes stay safe while valid saved dimensions preserve collapsed header intent', () => {
 assert.equal(readSheetAnchorSize('{"x":0.5,"y":0.8}'), null);
 assert.equal(readSheetAnchorSize('{"anchorWidth":-1,"anchorHeight":50}'), null);
 assert.equal(readSheetAnchorSize('{"anchorWidth":1e999,"anchorHeight":50}'), null);
 const size = readSheetAnchorSize('{"anchorWidth":216,"anchorHeight":50}')!;
 assert.deepEqual(size, { width: 216, height: 50 });
 const full = { width: 384, height: 606, left: 8, right: 8, top: 8, bottom: 8 };
 const point = { x: 20, y: 140 }, canonical = normalizeSheetPosition(point, full, size), expanded = { width: 330, height: 470 };
 const before = clampSheetPosition(restoreSheetPosition(canonical, full, size), full, expanded);
 const keyboard = { ...full, height: 250 };
 assert.equal(clampSheetPosition(restoreSheetPosition(canonical, keyboard, size), keyboard, { ...expanded, height: 234 }).y, 8);
 assert.deepEqual(clampSheetPosition(restoreSheetPosition(canonical, full, size), full, expanded), before);
 assert.equal(before.y, 128);
});
