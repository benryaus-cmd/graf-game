// Offline extraction: pinned Quaternius OBJ conversions, no runtime triangle traversal.
import fs from 'node:fs';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import * as THREE from 'three';
const round=(n,places=5)=>+n.toFixed(places);
const names=['1Story_Sign','2Story_Balcony','2Story_Wide','3Story_Small','2Story_GableRoof'];
const output={};
for(const name of names){
 const gltf=JSON.parse(fs.readFileSync(`public/assets/quarter/${name}.gltf`,'utf8'));
 const bytes=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');
 const accessor=gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION],view=gltf.bufferViews[accessor.bufferView];
 const points=Array.from({length:accessor.count},(_,i)=>new THREE.Vector3(...[0,1,2].map(j=>bytes.readFloatLE((view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??12)+j*4))));
 const center=new THREE.Vector3((accessor.min[0]+accessor.max[0])/2,accessor.min[1],(accessor.min[2]+accessor.max[2])/2);
 const groups=new Map();
 for(let i=0;i<points.length;i+=3){
  const normal=new THREE.Triangle(...points.slice(i,i+3)).getNormal(new THREE.Vector3());if(Math.abs(normal.y)>.025||normal.lengthSq()<.9)continue;
  const n=new THREE.Vector3(...normal.toArray().map(v=>round(v))).normalize(),plane=round(n.dot(points[i]),4),key=`${n.toArray()}:${plane}`;
  if(!groups.has(key))groups.set(key,{normal:n,plane,triangles:[]});groups.get(key).triangles.push(i);
 }
 const faces=[];
 for(const group of groups.values()){
  const vertices=new Map(),remaining=new Set(group.triangles),vertexKey=p=>p.toArray().map(n=>round(n,4)).join(',');
  for(const i of remaining)for(const p of points.slice(i,i+3)){const k=vertexKey(p);if(!vertices.has(k))vertices.set(k,[]);vertices.get(k).push(i);}
  while(remaining.size){const start=remaining.values().next().value,queue=[start],component=[];remaining.delete(start);
   while(queue.length){const i=queue.pop();component.push(...points.slice(i,i+3));for(const p of points.slice(i,i+3))for(const next of vertices.get(vertexKey(p)))if(remaining.delete(next))queue.push(next);}
   const right=new THREE.Vector3(group.normal.z,0,-group.normal.x).normalize(),up=group.normal.clone().cross(right).normalize();
   const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,group.normal));
   const projected=component.map(p=>new THREE.Vector2(right.dot(p),up.dot(p))),xs=[...new Set(projected.map(p=>round(p.x)))].sort((a,b)=>a-b),ys=[...new Set(projected.map(p=>round(p.y)))].sort((a,b)=>a-b);
   let area=0;for(let i=0;i<projected.length;i+=3){const[a,b,c]=projected.slice(i,i+3);area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;}
   let rectangles=[[xs[0],xs.at(-1),ys[0],ys.at(-1)]];
   if(component.length>6&&area<(xs.at(-1)-xs[0])*(ys.at(-1)-ys[0])*.94){
    const inside=(x,y)=>{for(let i=0;i<projected.length;i+=3){const[a,b,c]=projected.slice(i,i+3),cross=(p,q)=>(q.x-p.x)*(y-p.y)-(q.y-p.y)*(x-p.x),v=[cross(a,b),cross(b,c),cross(c,a)];if(v.every(v=>v>=-1e-9)||v.every(v=>v<=1e-9))return true;}return false;};
    const cells=Array.from({length:ys.length-1},(_,y)=>Array.from({length:xs.length-1},(_,x)=>inside((xs[x]+xs[x+1])/2,(ys[y]+ys[y+1])/2)));rectangles=[];
    for(let y=0;y<cells.length;y++)for(let x=0;x<cells[y].length;x++){if(!cells[y][x])continue;let tx=x+1,ty=y+1;while(tx<cells[y].length&&cells[y][tx])tx++;while(ty<cells.length&&cells[ty].slice(x,tx).every(Boolean))ty++;for(let cy=y;cy<ty;cy++)for(let cx=x;cx<tx;cx++)cells[cy][cx]=false;rectangles.push([xs[x],xs[tx],ys[y],ys[ty]]);}
   }
   for(const[u0,u1,y0,y1]of rectangles){if(u1-u0<.002||y1-y0<.002)continue;const p=right.clone().multiplyScalar((u0+u1)/2).addScaledVector(up,(y0+y1)/2).addScaledVector(group.normal,group.plane+.0005).sub(center);const shape = component.length <= 6 && area < (u1-u0)*(y1-y0)*.94 ? projected.flatMap(v=>[v.x-(u0+u1)/2,v.y-(y0+y1)/2]) : []; faces.push([...p.toArray(),u1-u0,y1-y0,...q.toArray(),...shape].map(n=>round(n)));}
  }
 }
 faces.sort((a,b)=>{for(const i of[5,6,7,8,2,0,1,3,4])if(a[i]!==b[i])return a[i]-b[i];return 0;});
 output[name]={size:accessor.max.map((x,i)=>x-accessor.min[i]),offset:center.toArray().map(x=>-x),faces};console.log(name,faces.length);
}
fs.writeFileSync('src/game/quarterBuildingAssets.ts',`// Generated offline by scripts/generate-quarter-buildings.mjs.\n// Pinned CC0 Quaternius sources and license: public/assets/quarter/LICENSE.txt.\nexport type QuarterAssetKind = '1Story_Sign' | '2Story_Balcony' | '2Story_Wide' | '3Story_Small' | '2Story_GableRoof';\nexport interface QuarterAssetDescription {size: readonly number[]; offset: readonly number[]; faces: readonly (readonly number[])[];}\nexport const QUARTER_ASSETS: Record<QuarterAssetKind, QuarterAssetDescription> = ${JSON.stringify(output)};\n`);
