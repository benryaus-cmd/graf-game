import test from 'node:test';
import assert from 'node:assert/strict';
import { canPaintCanvas } from '../src/game/worldPainting';
import type { WorldEngine, LiveSettings } from '../src/game/worldTypes';

test('solo stays free; multiplayer drafts cannot paint before server purchase', () => {
 const world = { multiplayerActive: false, paintWorkspace: { selection: { started: true } } } as unknown as WorldEngine;
 const settings = {} as LiveSettings;
 assert.equal(canPaintCanvas(world, settings), true);
 world.multiplayerActive = true;
 assert.equal(canPaintCanvas(world, settings), false);
 world.paintWorkspace!.selection!.purchaseApproved = true;
 assert.equal(canPaintCanvas(world, settings), true);
 world.paintWorkspace!.selection = null;
 assert.equal(canPaintCanvas(world, settings), false);
});

test('admin free paint requires both current server permission and chosen admin mode', () => {
 const world = { multiplayerActive: true, adminFreePaint: true } as WorldEngine;
 const settings = { adminFreePaint: false } as LiveSettings;
 assert.equal(canPaintCanvas(world, settings), false);
 settings.adminFreePaint = true;
 assert.equal(canPaintCanvas(world, settings), true);
 world.adminFreePaint = false;
 assert.equal(canPaintCanvas(world, settings), false);
});
