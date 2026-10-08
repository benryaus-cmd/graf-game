import type { MapId } from './mapPreference';
import { quarterLayout, isQuarterChunk } from './morningQuarterLayout';
/** Shared legacy seed sequence: proxies and real walls must describe the same buildings. */
export const CITY_CHUNK_SIZE=48;
export interface CityBuildingDescription { x:number; z:number; width:number; depth:number; height:number; tower:boolean; stairs:boolean; id?:string; color?:string }
export function createCityBlockLayout(chunkX:number,chunkZ:number,map:MapId='original') {
  if(map==='map2'&&isQuarterChunk(chunkX,chunkZ))return quarterLayout(chunkX,chunkZ);
  let seed=(Math.imul(chunkX,374761393)^Math.imul(chunkZ,668265263))>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const towerIndex=random()>.72?Math.floor(random()*4):-1;const buildings:CityBuildingDescription[]=[];
  for(const offsetX of [-15.5,15.5])for(const offsetZ of [-15.5,15.5]){const index=buildings.length;
    const x=chunkX*48+offsetX+(random()-.5)*1.1,z=chunkZ*48+offsetZ+(random()-.5)*1.1,width=10.8+random()*2.1,depth=10.8+random()*2.1;
    buildings.push({x,z,width,depth,height:index===towerIndex?32+random()*23:4.65,tower:index===towerIndex,stairs:index%2===0});
  }
  if(map==='map2')buildings.forEach((b,i)=>{b.id=`backdrop:${chunkX}:${chunkZ}:${i}`;b.height=b.tower?20+(Math.abs(chunkX*3+chunkZ)%4)*4:7+(i%3)*2;b.color=['#c1b8a9','#a9b4aa','#bea8a0'][i%3];});
  return {buildings,random};
}
