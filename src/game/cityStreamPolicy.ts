import { CITY_CHUNK_SIZE } from './cityBlockLayout';
export function wantedChunkKeys(x:number,z:number):Set<string>{const cx=Math.floor(x/48+.5),cz=Math.floor(z/48+.5),keys=new Set<string>();for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)keys.add(`${cx+dx}:${cz+dz}`);return keys;}
export function distanceToChunk(x:number,z:number,cx:number,cz:number):number{return Math.hypot(Math.max(0,Math.abs(x-cx*CITY_CHUNK_SIZE)-24),Math.max(0,Math.abs(z-cz*CITY_CHUNK_SIZE)-24));}
export function keepChunk({wanted,pinned,lastWanted,now,retentionMs}:{wanted:boolean;pinned:boolean;lastWanted:number;now:number;retentionMs:number}):boolean{return wanted||pinned||now-lastWanted<retentionMs;}
