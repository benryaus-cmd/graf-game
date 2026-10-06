import * as THREE from 'three';

/** One temporary sprite per speaker. No React/frame updates and no HTML interpretation. */
export class SpeechBubble {
  private sprite: THREE.Sprite | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private avatar: THREE.Group | undefined) {}
  show(value: string): void {
    this.dispose();
    const text = value.trim().slice(0, 500).replace(/\s+/g, ' ');
    if (!text || !this.avatar) return;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    let context = canvas.getContext('2d');
    if (!context) return;
    context.font = '26px sans-serif';
    const lines: string[] = [];
    // Character wrapping also supports long unbroken words and non-Latin messages.
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const character of paragraph) {
        if (line && context.measureText(line + character).width > 720) {
          const split = line.lastIndexOf(' ');
          if (split > line.length / 2) { lines.push(line.slice(0, split)); line = line.slice(split + 1); }
          else { lines.push(line); line = ''; }
        }
        line += character;
      }
      lines.push(line);
    }
    canvas.height = lines.length * 34 + 32;
    context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = 'rgba(18,22,19,.94)'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '26px sans-serif'; context.fillStyle = '#fff9ed'; context.textAlign = 'center'; context.textBaseline = 'middle';
    lines.forEach((line, index) => context!.fillText(line, 384, 32 + index * 34));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false }));
    const height = canvas.height / canvas.width * 3.4;
    sprite.scale.set(3.4, height, 1); sprite.position.set(0, 3.05 + height / 2, 0);
    sprite.raycast = () => {};
    this.avatar.add(sprite); this.sprite = sprite;
    this.timer = setTimeout(() => this.dispose(), Math.min(16_000, Math.max(8_000, text.length * 32)));
  }
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.sprite) { this.sprite.removeFromParent(); this.sprite.material.map?.dispose(); this.sprite.material.dispose(); this.sprite = null; }
  }
}
