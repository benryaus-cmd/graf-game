import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlayerInteractionCard from '../src/components/PlayerInteractionCard';
import GraffitiPieces from '../src/components/GraffitiPieces';
import { buildAdminAction, type AdminAction } from '../src/multiplayer/adminActions';

type Props = { children?: ReactNode; onClick?: () => void; [key: string]: unknown };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function capture<P>(Component: (props: P) => ReactNode, props: P) {
  let tree: ReactNode;
  function Capture() { tree = Component(props); return tree; }
  return { html: renderToStaticMarkup(createElement(Capture)), nodes: elements(tree) };
}
function stateful<P>(Component: (props: P) => ReactNode, props: P) {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots: unknown[] = [];
  return () => {
    const prior = internals.H; let cursor = 0;
    internals.H = {
      useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useEffect() {},
    };
    try { return elements(Component(props)); } finally { internals.H = prior; }
  };
}
const selected = { playerId: 'private-session', username: 'artist', nickName: 'Real Artist', role: 'player' as const };
const cardProps = { selected, ownRole: 'owner' as const, connected: true, canRemoveAllArt: true, onSetRole: () => true, onAdminAction: () => true };
const piece = { pieceId: 'private-piece', anchor: [0, 0, 0], bounds: { min: [0, 0, 0], max: [1, 1, 1] }, strokeIds: [], title: 'Wall colour', ownerPlayerId: 'creator-session', ownerUsername: 'artist', ownerNickName: 'Real Artist' };
const artwork = { id: 'private-poster', surfaceId: 'wall', face: '0', assetRef: 'https://example.test/poster.png', image: 'https://example.test/poster.png', position: [1, 2, 3], quaternion: [0, 0, 0, 1], width: 1, height: 1, ownerPlayerId: 'creator-session', ownerUsername: 'artist', ownerNickName: 'Real Artist' };

test('bulk art action emits one exact server request and applies existing hierarchy', () => {
  assert.deepEqual(buildAdminAction('admin', 'player', 'remove-all-art' as AdminAction, '@artist', { reason: 'unused' }), { type: 'admin_remove_user_art', targetUsername: 'artist' });
  assert.equal(buildAdminAction('admin', 'owner', 'remove-all-art' as AdminAction, 'artist'), null);
  assert.equal(buildAdminAction('moderator', 'player', 'remove-all-art' as AdminAction, 'artist'), null);
});

test('remove all art requires capability, hierarchy, target identity and nonself selection', () => {
  assert.match(capture(PlayerInteractionCard, cardProps).html, /REMOVE ALL ART/);
  for (const extra of [{ canRemoveAllArt: false }, { isSelf: true }, { connected: false }, { ownRole: 'player' }, { ownRole: 'admin', selected: { ...selected, role: 'owner' } }, { selected: { ...selected, username: '' } }]) {
    assert.ok(!capture(PlayerInteractionCard, { ...cardProps, ...extra } as Parameters<typeof PlayerInteractionCard>[0]).html.includes('REMOVE ALL ART'));
  }
});

test('removal confirms the actual creator and sends exactly once while waiting for server', () => {
  const calls: unknown[][] = [];
  const render = stateful(PlayerInteractionCard, { ...cardProps, onAdminAction: (...args: unknown[]) => { calls.push(args); return true; } });
  const remove = () => render().find(node => node.props.children === 'REMOVE ALL ART')!;
  remove().props.onClick?.(); assert.equal(calls.length, 0);
  const confirmation = render().find(node => node.props['aria-label'] === 'Confirm removal of all art')!;
  assert.ok(confirmation);
  const text = renderToStaticMarkup(confirmation);
  assert.match(text, /Real Artist/); assert.match(text, /@artist/);
  render().find(node => node.props.children === 'CANCEL REMOVAL')!.props.onClick?.();
  assert.equal(calls.length, 0);
  remove().props.onClick?.();
  const confirm = render().find(node => node.props.children === 'CONFIRM REMOVE ALL ART')!;
  confirm.props.onClick?.();
  confirm.props.onClick?.(); // A repeated click on the same rendered handler cannot enqueue another job.
  assert.deepEqual(calls, [['remove-all-art', 'artist', {}]]);
  assert.equal(remove().props.disabled, true);
  const waiting = render().filter(node => node.props.role === 'status').map(node => node.props.children).join(' ');
  assert.match(waiting, /Waiting for the server/);
  assert.ok(!waiting.includes('confirmed'));
});

test('supplied removal job displays authoritative progress without exposing job IDs', () => {
  const artRemoval = { type: 'admin_remove_user_art_progress', jobId: 'private-job', targetUsername: 'artist', total: 137, removed: 30, removedPieces: 22, removedArtworks: 8, removedStrokes: 941, remaining: 107, serverTime: 100 };
  const html = capture(PlayerInteractionCard, { ...cardProps, artRemoval } as Parameters<typeof PlayerInteractionCard>[0]).html;
  assert.match(html, /30[^]*137/); assert.match(html, /107 remaining/);
  assert.ok(!html.includes('private-job'));
  assert.ok(!capture(PlayerInteractionCard, { ...cardProps, artRemoval: { ...artRemoval, targetUsername: 'someone-else' } } as Parameters<typeof PlayerInteractionCard>[0]).html.includes('107 remaining'));
});

test('piece creator identity is clickable in list and detail without leaking raw IDs', () => {
  const creators: unknown[] = [], viewed: string[] = [];
  const props = { open: true, connected: true, pieces: [piece], onLike: () => true, onResync() {}, onCreatorSelect: (identity: unknown) => creators.push(identity), onView: (id: string) => viewed.push(id) } as unknown as Parameters<typeof GraffitiPieces>[0];
  for (const extra of [{}, { selectedPieceId: 'private-piece' }]) {
    const result = capture(GraffitiPieces, { ...props, ...extra });
    assert.match(result.html, /Real Artist/); assert.match(result.html, /@artist/);
    assert.ok(!result.html.includes('private-piece')); assert.ok(!result.html.includes('creator-session'));
    result.nodes.find(node => node.props['aria-label'] === 'View profile of Real Artist')!.props.onClick?.();
  }
  assert.deepEqual(creators, [{ playerId: 'creator-session', username: 'artist', nickName: 'Real Artist' }, { playerId: 'creator-session', username: 'artist', nickName: 'Real Artist' }]);
  capture(GraffitiPieces, props).nodes.find(node => node.props.children === 'VIEW')!.props.onClick?.();
  assert.deepEqual(viewed, ['private-piece']);
});

test('shared posters use the same art sheet with creator, bounded preview and server delete flow', () => {
  const viewed: string[] = [], deleted: string[] = [];
  const props = { open: true, connected: true, pieces: [], artworks: [artwork], onLike: () => true, onResync() {}, onCreatorSelect() {}, onViewArtwork: (id: string) => viewed.push(id), canDeletePieces: true, onDeleteArtwork: (id: string) => { deleted.push(id); return true; } } as unknown as Parameters<typeof GraffitiPieces>[0];
  const list = capture(GraffitiPieces, props);
  assert.match(list.html, /Image \/ poster/); assert.match(list.html, /Real Artist/); assert.match(list.html, /@artist/);
  list.nodes.find(node => node.props.children === 'VIEW IMAGE')!.props.onClick?.();
  assert.deepEqual(viewed, ['private-poster']);
  const detail = capture(GraffitiPieces, { ...props, selectedArtworkId: 'private-poster' } as Parameters<typeof GraffitiPieces>[0]);
  assert.match(detail.html, /alt="Shared image or poster"/); assert.match(detail.html, /max-height:180px/);
  assert.ok(!detail.html.includes('private-poster'));
  detail.nodes.find(node => node.props.children === 'DELETE IMAGE')!.props.onClick?.();
  assert.deepEqual(deleted, ['private-poster']);
});

test('bulk removal reader accepts real finite server progress and binds target/job identity', async () => {
  const { readAdminArtRemovalProgress } = await import('../src/multiplayer/adminArtRemoval');
  const wire = { type: 'admin_remove_user_art_progress', jobId: 'job-1', targetUsername: '@ARTIST', total: 137, removed: 30, removedPieces: 22, removedArtworks: 8, removedStrokes: 941, remaining: 107, serverTime: 100 };
  assert.deepEqual(readAdminArtRemovalProgress(wire, { targetUsername: 'artist', jobId: 'job-1' }), { ...wire, targetUsername: 'artist' });
  assert.equal(readAdminArtRemovalProgress(wire, { targetUsername: 'other', jobId: 'job-1' }), null);
  assert.equal(readAdminArtRemovalProgress(wire, { targetUsername: 'artist', jobId: 'job-2' }), null);
  for (const field of ['total', 'removed', 'removedPieces', 'removedArtworks', 'removedStrokes', 'remaining', 'serverTime']) {
    for (const invalid of [undefined, '30', Infinity, NaN, -1]) assert.equal(readAdminArtRemovalProgress({ ...wire, [field]: invalid }), null);
  }
  assert.equal(readAdminArtRemovalProgress({ ...wire, type: 'admin_remove_user_art' }), null);
  assert.equal(readAdminArtRemovalProgress({ ...wire, jobId: '' }), null);
  assert.equal(readAdminArtRemovalProgress({ ...wire, targetUsername: '' }), null);
});
