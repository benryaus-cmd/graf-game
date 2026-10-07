import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlayersSheet from '../src/components/PlayersSheet';
import PlayerInteractionCard from '../src/components/PlayerInteractionCard';
import MultiplayerChat from '../src/components/MultiplayerChat';

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
