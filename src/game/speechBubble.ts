import * as THREE from 'three';
import { EYE_HEIGHT } from './playerPhysics';

export const SPEECH_BUBBLE_DISTANCE = 15;
const LINE_HEIGHT = 34;
const PADDING = 32;
const PIXELS_PER_METRE = 128;

/** One temporary world sprite per speaker. No HTML interpretation or frame allocations. */
export class SpeechBubble {
  private sprite: THREE.Sprite | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private speakerPosition = new THREE.Vector3();
  constructor(
    private avatar: THREE.Group | undefined,
    private listenerPosition?: () => THREE.Vector3,
    private distance = SPEECH_BUBBLE_DISTANCE,
    private heightAboveFeet = 2.35,
  ) {}
  show(value: string): void {
    this.dispose();
    const text = value.trim().slice(0, 500).replace(/\s+/g, ' ');
    if (!text || !this.avatar) return;
    const canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    if (!context) return;
    context.font = '26px sans-serif';
    const measure = (value: string) => context!.measureText(value).width;
    // Short messages keep their natural width; long messages approach a square block.
    const textWidth = measure(text);
    const wrapWidth = textWidth <= 288 ? textWidth : Math.min(480, Math.max(288, Math.sqrt(textWidth * LINE_HEIGHT)));
    const lines: string[] = [];
    let line = '';
    for (const character of text) {
      if (line && measure(line + character) > wrapWidth) {
        const split = line.lastIndexOf(' ');
        if (split > 0) { lines.push(line.slice(0, split)); line = line.slice(split + 1); }
        else { lines.push(line); line = ''; }
      }
      line += character;
    }
    if (line) lines.push(line.trimEnd());
    canvas.width = Math.ceil(Math.max(40, ...lines.map(measure)) + PADDING);
    canvas.height = lines.length * LINE_HEIGHT + PADDING;
    context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = 'rgba(18,22,19,.94)'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '26px sans-serif'; context.fillStyle = '#fff9ed'; context.textAlign = 'center'; context.textBaseline = 'middle';
    lines.forEach((line, index) => context!.fillText(line, canvas.width / 2, 32 + index * LINE_HEIGHT));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // Writing depth prevents later transparent posters/paint behind the speaker from
    // covering speech. Real nearer walls still occlude it through the usual depth test.
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: true, alphaTest: .05, toneMapped: false }));
    const height = canvas.height / PIXELS_PER_METRE;
    sprite.scale.set(canvas.width / PIXELS_PER_METRE, height, 1); sprite.position.set(0, this.heightAboveFeet + height / 2, 0);
    sprite.raycast = () => {};
    this.avatar.add(sprite); this.sprite = sprite;
    this.update();
    this.timer = setTimeout(() => this.dispose(), Math.min(16_000, Math.max(8_000, text.length * 32)));
  }
  update(): void {
    if (!this.sprite || !this.avatar || !this.listenerPosition) return;
    this.avatar.getWorldPosition(this.speakerPosition);
    this.speakerPosition.y += EYE_HEIGHT;
    this.sprite.visible = this.speakerPosition.distanceToSquared(this.listenerPosition()) <= this.distance * this.distance;
  }
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.sprite) { this.sprite.removeFromParent(); this.sprite.material.map?.dispose(); this.sprite.material.dispose(); this.sprite = null; }
  }
}
