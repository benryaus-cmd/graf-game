import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerDirectory } from '../src/multiplayer/playerDirectory';
import { readChatMessage } from '../src/multiplayer/chat';

test('chat profile follows stable player ID, including after leave, without guessing a handle from a nickname', () => {
  const directory=new PlayerDirectory();
  const chat=[{id:'m',playerId:'a',displayName:'Same nickname',text:'hi',timestamp:1}];
  directory.sync([{playerId:'a',username:'real-a',nickName:'Same nickname',role:'player'}, {playerId:'b',username:'real-b',nickName:'Same nickname'}],chat);
  directory.sync([],chat);
  assert.equal(directory.get('a')?.username,'real-a');
  assert.equal(directory.get('b'),null,'departed players without retained chat are pruned');
  directory.sync([], [...chat,{...chat[0],id:'n',playerId:'unknown'}]);
  assert.equal(directory.get('unknown')?.username,'');
});

test('history can retain optional server-supplied Aippy identity, but chat cannot grant an admin role', () => {
  const chat=readChatMessage({id:'m',playerId:'a',displayName:'Nickname',username:'@artist',nickName:'Artist',role:'owner',text:'hi',timestamp:1})!;
  const directory=new PlayerDirectory(); directory.sync([], [chat]);
  assert.equal(directory.get('a')?.username,'artist');
  assert.equal(directory.get('a')?.nickName,'Artist');
  assert.equal(directory.get('a')?.role,undefined);
});

test('later history identity enriches an unknown author without overwriting a known roster handle', () => {
  const directory=new PlayerDirectory();
  const old={id:'old',playerId:'a',displayName:'Artist',text:'hi',timestamp:1};
  directory.sync([], [old]);
  directory.sync([], [old, {...old,id:'new',username:'artist-tag',nickName:'Artist'}]);
  assert.equal(directory.get('a')?.username,'artist-tag');
  directory.sync([{playerId:'a',username:'authoritative',nickName:'Profile'}], [{...old,username:'chat-label'}]);
  assert.equal(directory.get('a')?.username,'authoritative');
});
