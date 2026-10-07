import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';
import type { MultiplayerView } from '../src/multiplayer/protocol';

class Socket {
  readyState=1; bufferedAmount=0; onopen=null; onmessage:((event:{data:string})=>void)|null=null; onerror=null; onclose=null;
  sent:Record<string,unknown>[]=[];
  send(data:string){this.sent.push(JSON.parse(data));} close(){this.readyState=3;}
  receive(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
function sessionFixture() {
  const old=globalThis.WebSocket;let socket:Socket;
  globalThis.WebSocket=class extends Socket {constructor(){super();socket=this;}} as unknown as typeof WebSocket;
  const world:any={scene:new THREE.Scene(),walls:[],setPaintSession(){},playerPosition:new THREE.Vector3(),playerYaw:0,playerPitch:0,paintRevision:0,renderer:{domElement:{}}};
  const views:MultiplayerView[]=[];
  const session=new WorldMultiplayerSession(world,()=>{},view=>views.push(view));
  session.join('Owner',undefined,{username:'owner-tag',nickName:'Owner'});
  socket!.receive({type:'hello',protocol:2,playerId:'self'});
  socket!.receive({type:'world_snapshot',protocol:2,roomId:'public',playerId:'self',sequence:0,revision:0,strokes:[],players:[{playerId:'a',username:'artist',nickName:'Artist',role:'player'}]});
  return {session,socket:socket!,views,dispose(){session.dispose();globalThis.WebSocket=old;}};
}

test('online reward reaches the same protection balance view; request sends cannot grant local credits', () => {
  const fixture=sessionFixture();const {session,socket,views}=fixture;
  try {
    socket.receive({type:'account_state',credits:456});
    assert.equal(views.at(-1)?.protection?.creditBalance,456);
    socket.receive({type:'permissions',role:'owner',permissions:['*']});
    session.selectPlayer('self');
    assert.equal(session.adminAction('give-credits','owner-tag',{amount:50}),true);
    assert.deepEqual(socket.sent.at(-1),{type:'admin_give_credits',targetUsername:'owner-tag',amount:50});
    assert.equal(views.at(-1)?.protection?.creditBalance,456,'sending a request never changes the balance');
    socket.receive({type:'credit_balance',balance:458,amount:2,reason:'online_reward',serverTime:123});
    assert.equal(views.at(-1)?.protection?.creditBalance,458);
    socket.receive({type:'permissions',role:'admin',permissions:[]});
    assert.equal(session.adminAction('give-credits','artist',{amount:50}),false);
  } finally {fixture.dispose();}
});

test('mute/unmute requests use supplied messages and server mute state resets on explicit leave', () => {
  const fixture=sessionFixture();const {session,socket,views}=fixture;
  try {
    socket.receive({type:'permissions',role:'owner',permissions:['*']});
    assert.equal(session.adminAction('mute','artist',{durationMinutes:30,reason:'spam'}),true);
    assert.deepEqual(socket.sent.at(-1),{type:'admin_mute',targetUsername:'artist',durationMinutes:30,reason:'spam'});
    assert.equal(session.adminAction('unmute','artist',{}),true);
    assert.deepEqual(socket.sent.at(-1),{type:'admin_unmute',targetUsername:'artist'});
    socket.receive({type:'chat_mute_state',muted:true,remainingMs:1800000,mutedUntil:Date.now()+1800000,reason:'spam'});
    assert.equal(views.at(-1)?.chatMute?.muted,true);
    socket.receive({type:'chat_muted',remainingMs:1200000,reason:'still muted'});
    assert.equal(views.at(-1)?.chatMute?.remainingMs,1200000);
    socket.receive({type:'chat_mute_state',muted:false});
    assert.equal(views.at(-1)?.chatMute?.muted,false);
    socket.receive({type:'chat_mute_state',muted:true,remainingMs:1800000});
    session.leave();assert.equal(views.at(-1)?.chatMute,null);
  } finally {fixture.dispose();}
});
