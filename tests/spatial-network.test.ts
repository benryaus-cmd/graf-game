import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MultiplayerConnection } from '../src/multiplayer/connection';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';
import type { MultiplayerStatus, MultiplayerView } from '../src/multiplayer/protocol';

class Socket {
  readyState=1;bufferedAmount=0;onopen=null;onerror=null;onclose=null;
  onmessage:((event:{data:string})=>void)|null=null;
  sent:Record<string,unknown>[]=[];
  send(data:string){this.sent.push(JSON.parse(data));}
  close(){this.readyState=3;}
  receive(message:unknown){this.onmessage?.({data:JSON.stringify(message)});}
}
const capabilities=['spatial_interest_v1','spatial_world_delta_v1','player_directory_v1'];
const hello={type:'hello',protocol:2,playerId:'self',networkRevision:6,minimumNetworkRevision:6,requiredClientCapabilities:capabilities,capabilities};

test('revision-6 join carries real initial position and all three spatial capabilities',()=>{
  const socket=new Socket();const connection=new MultiplayerConnection('wss://test',()=>{},()=>{},()=>socket);
  try {
    connection.connect(' Artist ','public',{username:'artist',nickName:'Artist'},[31,1.72,-48]);
    socket.receive(hello);
    assert.deepEqual(socket.sent[0],{type:'join',roomId:'public',protocol:2,networkRevision:6,capabilities,spatialInterest:true,position:[31,1.72,-48],username:'artist',nickName:'Artist',displayName:'Artist'});
  }finally{connection.disconnect();}
});

test('unsupported minimum revision/capabilities and client_update_required close cleanly without join or reconnect',()=>{
  for(const serverHello of [{...hello,minimumNetworkRevision:7},{...hello,requiredClientCapabilities:[...capabilities,'future_feature']}]) {
    const socket=new Socket(),states:MultiplayerStatus[]=[];
    const connection=new MultiplayerConnection('wss://test',status=>states.push(status),()=>{},()=>socket);
    try {connection.connect('Artist','public',{},[4,1.72,5]);socket.receive(serverHello);assert.equal(socket.sent.length,0);assert.equal(socket.readyState,3);assert.match(states.at(-1)?.notice??'',/Update GraffCiti/);}finally{connection.disconnect();}
  }
  const socket=new Socket(),states:MultiplayerStatus[]=[];
  const connection=new MultiplayerConnection('wss://test',status=>states.push(status),()=>{},()=>socket);
  try {
    connection.connect('Artist','public',{},[4,1.72,5]);socket.receive(hello);
    socket.receive({type:'world_snapshot',roomId:'public',playerId:'self',strokes:[],players:[]});
    socket.receive({type:'error',code:'client_update_required',message:'technical raw message'});
    assert.equal(socket.readyState,3);assert.equal(connection.connected,false);assert.match(states.at(-1)?.notice??'',/Update GraffCiti/);
  }finally{connection.disconnect();}
});

test('invalid or missing initial position never advertises spatial support with an invented spawn',()=>{
  for(const position of [undefined,[1,2],[NaN,1,2]]) {
    const socket=new Socket();const connection=new MultiplayerConnection('wss://test',()=>{},()=>{},()=>socket);
    try {connection.connect('Artist','public',{},position);socket.receive(hello);assert.equal(socket.sent.length,0);assert.equal(socket.readyState,3);}finally{connection.disconnect();}
  }
});

test('spatial directory remains online when avatar moves out of range and leaves only on directory_left',()=>{
  const old=globalThis.WebSocket;let socket:Socket;
  const oldDocument=globalThis.document;
  globalThis.document={getElementById:()=>null,createElement:()=>({width:1,height:1,getContext:()=>null})} as unknown as Document;
  globalThis.WebSocket=class extends Socket{constructor(){super();socket=this;}} as unknown as typeof WebSocket;
  const world:any={scene:new THREE.Scene(),walls:[],setPaintSession(){},playerPosition:new THREE.Vector3(31,1.72,-48),playerYaw:0,playerPitch:0,paintRevision:0,renderer:{domElement:{}}};
  const views:MultiplayerView[]=[],statuses:MultiplayerStatus[]=[];
  const session=new WorldMultiplayerSession(world,status=>statuses.push(status),view=>views.push(view));
  try {
    session.join('Self','public',{username:'self-user',nickName:'Self'});socket!.receive(hello);
    assert.deepEqual(socket!.sent[0].position,[31,1.72,-48]);
    socket!.receive({type:'world_snapshot',roomId:'public',playerId:'self',revision:0,sequence:0,strokes:[],players:[{playerId:'near',username:'near-user',nickName:'Near',role:'player'}],playerDirectory:[{playerId:'near',username:'near-user',nickName:'Near',role:'player'},{playerId:'far',username:'far-user',nickName:'Far',role:'player'}],playerCount:3});
    assert.equal(world.scene.children.filter((child:any)=>child.userData.parts).length,1,'only nearby avatar is rendered');
    assert.equal(views.at(-1)?.onlinePlayers?.length,3);
    session.selectPlayer('far');assert.equal(views.at(-1)?.selectedPlayer?.online,true);
    socket!.receive({type:'player_left',playerId:'near',spatial:true,reason:'spatial_out_of_range'});
    assert.equal(world.scene.children.filter((child:any)=>child.userData.parts).length,0);
    session.selectPlayer('near');assert.equal(views.at(-1)?.selectedPlayer?.online,true);
    assert.equal(statuses.at(-1)?.playerCount,3);
    socket!.receive({type:'player_directory_left',playerId:'near'});
    assert.ok(!views.at(-1)?.onlinePlayers?.some(player=>player.playerId==='near'));
    assert.equal(views.at(-1)?.selectedPlayer?.online,false);
    socket!.receive({type:'player_directory_joined',player:{playerId:'new',username:'new-user',nickName:'New',role:'player'}});
    assert.ok(views.at(-1)?.onlinePlayers?.some(player=>player.playerId==='new'));
    assert.equal(world.scene.children.filter((child:any)=>child.userData.parts).length,0,'directory join cannot spawn avatars');
  }finally{session.dispose();globalThis.WebSocket=old;globalThis.document=oldDocument;}
});
