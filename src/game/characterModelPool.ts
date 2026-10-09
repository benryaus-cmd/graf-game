import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Model } from './assetPreview';

export interface CharacterModelLease { model: Model; release(): void }
type TemplateEntry = {
  url: string;
  controller: AbortController;
  promise: Promise<Model>;
  model?: Model;
  users: number;
  used: number;
};

function waitForTemplate(promise: Promise<Model>, signal: AbortSignal): Promise<Model> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      model => { signal.removeEventListener('abort', abort); resolve(model); },
      error => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

/** Parsed templates share GPU resources; each lease owns its bones and skeleton textures. */
export class CharacterModelPool {
  private readonly entries = new Map<string, TemplateEntry>();
  private clock = 0;
  private closed = false;

  constructor(
    private readonly load: (url: string, signal: AbortSignal) => Promise<Model>,
    private readonly releaseTemplate: (root: THREE.Object3D) => void,
  ) {}

  async acquire(url: string, signal: AbortSignal): Promise<CharacterModelLease> {
    if (this.closed) throw Error('Character model pool closed');
    signal.throwIfAborted();
    let entry = this.entries.get(url);
    if (!entry) {
      const controller = new AbortController();
      entry = { url, controller, promise: null!, users: 0, used: ++this.clock };
      const current = entry;
      current.promise = Promise.resolve().then(() => this.load(url, controller.signal)).then(model => {
        current.model = model;
        this.prune();
        return model;
      }, error => {
        if (this.entries.get(url) === current) this.entries.delete(url);
        throw error;
      });
      this.entries.set(url, entry);
    }
    const current = entry;
    current.users++;
    current.used = ++this.clock;
    try {
      const template = await waitForTemplate(current.promise, signal);
      signal.throwIfAborted();
      if (this.closed) throw Error('Character model pool closed');
      const model: Model = { scene: clone(template.scene) as THREE.Group, animations: template.animations };
      let released = false;
      return { model, release: () => {
        if (released) return;
        released = true;
        const skeletons = new Set<THREE.Skeleton>();
        model.scene.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
        skeletons.forEach(skeleton => skeleton.dispose());
        model.scene.removeFromParent();
        current.users--;
        current.used = ++this.clock;
        this.prune();
      } };
    } catch (error) {
      current.users--;
      current.used = ++this.clock;
      this.prune();
      throw error;
    }
  }

  private prune() {
    const idle = [...this.entries.values()].filter(entry => entry.model && entry.users === 0).sort((a, b) => a.used - b.used);
    const remove = this.closed ? idle.length : Math.max(0, idle.length - 4);
    for (const entry of idle.slice(0, remove)) {
      this.entries.delete(entry.url);
      this.releaseTemplate(entry.model!.scene);
    }
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.entries.values()) entry.controller.abort();
    this.prune();
  }
}
