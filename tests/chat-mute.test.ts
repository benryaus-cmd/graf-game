import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatMute, chatMuteLabel, isChatMuteActive } from '../src/multiplayer/chatMute';

test('server mute state displays remaining time without changing server authority', () => {
  const state=readChatMute({type:'chat_mute_state',muted:true,mutedUntil:1801000,remainingMs:1800000,reason:'spam'},1000)!;
  assert.equal(chatMuteLabel(state,121000),'MUTED · 28m remaining');
  assert.equal(isChatMuteActive(state,121000),true);
  assert.equal(isChatMuteActive(state,1801001),false,'allow a new attempt once the supplied time elapses; server still decides');
  assert.equal(state.muted,true,'the display clock cannot mark a player unmuted');
  assert.match(chatMuteLabel(state,1801001),/server/);
  const clear=readChatMute({type:'chat_mute_state',muted:false},1801001)!;
  assert.equal(isChatMuteActive(clear,1801001),false);
  assert.equal(chatMuteLabel(clear,1801001),'');
});

test('chat_muted rejection refreshes state; invalid mute state and unrelated messages are ignored', () => {
  const state=readChatMute({type:'chat_muted',mutedUntil:'2026-10-07T02:00:00Z',remainingMs:60000,reason:'spam'},1000)!;
  assert.equal(state.muted,true);assert.equal(state.mutedUntil,Date.parse('2026-10-07T02:00:00Z'));
  assert.equal(readChatMute({type:'chat_mute_state',muted:'yes'}),null);
  assert.equal(readChatMute({type:'credit_balance',balance:10}),null);
});

test('missing or invalid mute timing allows a server-checked retry instead of an indefinite local block', () => {
  for (const message of [{type:'chat_muted'}, {type:'chat_mute_state',muted:true,mutedUntil:'invalid',remainingMs:-1}]) {
    const state=readChatMute(message,1000)!;
    assert.equal(state.muted,true);
    assert.equal(isChatMuteActive(state,1000),false);
    assert.match(chatMuteLabel(state,1000),/server checks/);
  }
});
