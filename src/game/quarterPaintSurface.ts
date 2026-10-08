import * as THREE from 'three';
import type { PaintSurfaceLayer, PaintWall } from './worldTypes';
/** Invisible canonical targets share geometry/material; canvases and paint materials exist only after a stroke. */
export class QuarterPaintSurfaces {
    private geometries = new Map<string, THREE.BufferGeometry>();
    private hidden = new THREE.MeshBasicMaterial({visible:false,colorWrite:false,depthWrite:false});
    plane(parent: THREE.Object3D, face: readonly number[], transform: THREE.Matrix4, name: string): PaintWall {
        const [x,y,z,width,height,qx,qy,qz,qw] = face;
        const shape=face.slice(9),key = `${width}:${height}:${shape.join(',')}`;
        let geometry = this.geometries.get(key);
        if (!geometry) {
            if(shape.length){
                geometry=new THREE.BufferGeometry();const positions:number[]=[],uvs:number[]=[];
                for(let i=0;i<shape.length;i+=2){positions.push(shape[i],shape[i+1],0);uvs.push(shape[i]/width+.5,shape[i+1]/height+.5);}
                geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();geometry.addGroup(0,positions.length/3,0);
            }else{geometry = new THREE.PlaneGeometry(width,height);geometry.addGroup(0,6,0);}
            this.geometries.set(key,geometry);
        }
        const target = new THREE.Mesh(geometry,this.hidden);
        target.name=name;target.userData.planarPaintUv=shape.length>0;target.userData.sharedMapAsset=true;target.userData.fixtureSlab=true;target.userData.paintWorkspaceContext=parent;
        target.matrix.copy(transform).multiply(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion(qx,qy,qz,qw).normalize(),new THREE.Vector3(1,1,1)));
        target.matrix.decompose(target.position,target.quaternion,target.scale);target.matrixAutoUpdate=false;target.visible=false;
        const add=target.add;
        target.add=function(...objects:THREE.Object3D[]){if(objects.some(object=>!object.userData.quarterBlankLayer))this.visible=true;return add.apply(this,objects);};
        parent.add(target);
        // District paint targets are stationary. Cache their world transform once;
        // scene updates still reach painted children without multiplying 22k matrices.
        parent.updateWorldMatrix(true,false);
        target.matrixWorld.copy(parent.matrixWorld).multiply(target.matrix);
        target.matrixWorldAutoUpdate=false;target.matrixWorldNeedsUpdate=false;
        const right=new THREE.Vector3(width,0,0).applyMatrix4(target.matrix).sub(target.position).length(),up=new THREE.Vector3(0,height,0).applyMatrix4(target.matrix).sub(target.position).length();
        const dimensions={width:right,height:up};
        const layers:PaintSurfaceLayer[]=[];
        const createLayer=()=>{
            const contexts:[CanvasRenderingContext2D|null]=[null],textures:THREE.Texture[]=[];
            const mesh=new THREE.Mesh(geometry!,this.hidden);mesh.userData.sharedMapAsset=true;mesh.userData.quarterBlankLayer=true;mesh.renderOrder=3+layers.length;
            // Keep blank layers out of scene traversal until first use. The invisible
            // shared material and target hide them while their visibility remains user-owned.
            const index=layers.length;
            const layer:PaintSurfaceLayer={contexts,textures,mesh,ensureFace:(faceIndex)=>{
                if(faceIndex!==0)return null;if(contexts[0])return contexts[0];
                const canvas=document.createElement('canvas');canvas.width=Math.max(32,Math.min(2048,Math.round(right*64)));canvas.height=Math.max(32,Math.min(2048,Math.round(up*64)));
                const ctx=canvas.getContext('2d');if(!ctx)return null;
                const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.generateMipmaps=false;map.minFilter=THREE.LinearFilter;
                contexts[0]=ctx;textures[0]=map;
                const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2-index,polygonOffsetUnits:-2-index,toneMapped:false});
                mesh.material=material;
                const workspace=parent.userData.paintWorkspaceState;
                if(workspace?.active&&workspace.savedLayers&&!workspace.savedLayers.has(mesh))workspace.savedLayers.set(mesh,mesh.layers.isEnabled(31));
                mesh.layers.mask=target.layers.mask;target.add(mesh);target.visible=true;mesh.userData.sharedMapAsset=false;mesh.userData.sharedMapGeometry=true;
                return ctx;
            }};
            layers.push(layer);return layer;
        };
        const first=createLayer();
        return {mesh:target,uvScales:[{u:1,v:1}],faceDimensions:[dimensions],layers,createLayer,contexts:first.contexts,textures:first.textures};
    }
    dispose(){for(const geometry of this.geometries.values())geometry.dispose();this.geometries.clear();this.hidden.dispose();}
}
