import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlayersSheet from '../src/components/PlayersSheet';
import PlayerInteractionCard from '../src/components/PlayerInteractionCard';
import MultiplayerChat from '../src/components/MultiplayerChat';
import GraffitiPieces from '../src/components/GraffitiPieces';

test('every player can browse actual names/handles and select a profile', () => {
  const html=renderToStaticMarkup(createElement(PlayersSheet,{players:[{playerId:'a',username:'artist-tag',nickName:'Artist'}],onSelect(){},onClose(){},onChat(){}}));
  assert.match(html, /Artist/); assert.match(html, /@artist-tag/); assert.match(html, /View player Artist/);
  assert.match(html, /Collapse online players/);
});

test('kick is immediately available for authorised roles, hidden from players, owners protected from admins, and self excluded', () => {
  const selected={playerId:'a',username:'artist',nickName:'Artist',role:'player' as const};
  const props={selected,connected:true,onSetRole:()=>true,onAdminAction:()=>true};
  const html=(extra:object)=>renderToStaticMarkup(createElement(PlayerInteractionCard,{...props,...extra}));
  assert.match(html({ownRole:'owner'}), /KICK PLAYER/);
  assert.match(html({ownRole:'admin'}), /KICK PLAYER/);
  assert.ok(!html({ownRole:'player'}).includes('KICK PLAYER'));
  assert.ok(!html({ownRole:'admin',selected:{...selected,role:'owner'}}).includes('KICK PLAYER'));
  assert.ok(!html({ownRole:'owner',isSelf:true}).includes('KICK PLAYER'));
});

test('chat names are accessible profile buttons keyed to authors, not nickname matching', () => {
  const html=renderToStaticMarkup(createElement(MultiplayerChat,{messages:[{id:'m',playerId:'a',displayName:'Artist',text:'hello',timestamp:1}],connected:true,onSend(){},onClose(){},onResync(){},onPlayerSelect(){}}));
  assert.match(html, /View profile of Artist/); assert.match(html, /chat-author/);
});

test('public profiles hide technical IDs/roles while owner/admin info keeps them, including self', () => {
  const selected={playerId:'private-session-uuid',username:'artist',nickName:'Artist',role:'player' as const,online:false};
  const props={selected,connected:true,onSetRole:()=>true,onAdminAction:()=>true};
  const html=(extra:object)=>renderToStaticMarkup(createElement(PlayerInteractionCard,{...props,...extra}));
  for(const ownRole of ['player','moderator',undefined]) {
    const publicCard=html({ownRole});
    assert.ok(!publicCard.includes('private-session-uuid'));
    assert.ok(!publicCard.includes('ADMIN INFO'));
    assert.match(publicCard, /@artist/);assert.match(publicCard,/OFFLINE/);
  }
  for(const ownRole of ['owner','admin']) {
    assert.match(html({ownRole,isSelf:true}), /ADMIN INFO/);
    assert.match(html({ownRole,isSelf:true}), /private-session-uuid/);
    assert.match(html({ownRole}), /Role: player/);
  }
});

test('owner can send credits to self and known offline authors; admins and players cannot', () => {
  const selected={playerId:'self',username:'owner-tag',nickName:'Owner',role:'owner' as const,online:true};
  const props={selected,connected:true,onSetRole:()=>true,onAdminAction:()=>true};
  const html=(extra:object)=>renderToStaticMarkup(createElement(PlayerInteractionCard,{...props,...extra}));
  assert.match(html({ownRole:'owner',isSelf:true}), /SEND CREDITS/);
  assert.match(html({ownRole:'owner',selected:{...selected,online:false}}), /SEND CREDITS/);
  assert.ok(!html({ownRole:'admin',selected:{...selected,role:'player'}}).includes('SEND CREDITS'));
  assert.ok(!html({ownRole:'player'}).includes('SEND CREDITS'));
  assert.ok(!html({ownRole:'owner',connected:false}).includes('SEND CREDITS'));
  assert.ok(!html({ownRole:'owner',selected:{...selected,username:''}}).includes('SEND CREDITS'));
});

test('nearby art does not expose a public technical role label', () => {
  const html=renderToStaticMarkup(createElement(GraffitiPieces,{open:true,pieces:[],connected:true,role:'player',onLike:()=>true,onResync(){}}));
  assert.ok(!html.includes('Role: player'));
});
