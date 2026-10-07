import * as THREE from 'three';

/** One shared 64 KiB grain tile. No downloaded concrete photograph or normal map. */
export function createFixtureGrain(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 713;
  for (let i = 0; i < data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 48 + (seed >>> 24) * .7;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

export function applyFixtureGrain(material: THREE.MeshStandardMaterial, grain: THREE.Texture, enabled: { value: number }): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.fixtureGrain = { value: grain };
    shader.uniforms.fixtureDetail = enabled;
    // Use the city's concrete material hue, normalized to preserve atlas brightness.
    const tint = new THREE.Color('#e6e0d3');
    tint.multiplyScalar(1 / (.2126 * tint.r + .7152 * tint.g + .0722 * tint.b));
    shader.uniforms.fixtureConcreteTint = { value: tint };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFixtureGrainUv;\nvarying float vFixtureVertical;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFixtureGrainUv = (abs(normal.x) > .5 ? position.zy : position.xy) * 5.0;\nvFixtureVertical = 1.0 - smoothstep(.15, .3, abs(normal.y));');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D fixtureGrain;\nuniform float fixtureDetail;\nuniform vec3 fixtureConcreteTint;\nvarying vec2 vFixtureGrainUv;\nvarying float vFixtureVertical;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float spread = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
float concrete = 1.0 - smoothstep(.06, .12, spread);
float concreteLuminance = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
diffuseColor.rgb = mix(diffuseColor.rgb, concreteLuminance * fixtureConcreteTint, concrete * .85);
if (fixtureDetail > .5 && vFixtureVertical > .5) {
  float grain = texture2D(fixtureGrain, vFixtureGrainUv).r;
  diffuseColor.rgb *= mix(1.0, .75 + grain * .5, concrete);
}`);
  };
  material.customProgramCacheKey = () => 'graffciti-fixture-grain-v2';
  material.needsUpdate = true;
}
