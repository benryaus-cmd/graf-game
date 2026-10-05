import { ARTWORK_UPLOAD_URL } from './config';
import { artworkAssetRef } from './artworkAssets';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function posterBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error('Poster must be a PNG, JPEG or WebP image.');
  const encoded = match[2].replace(/\s/g, '');
  if (encoded.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('Poster is larger than the 5 MB upload limit.');
  const raw = atob(encoded);
  if (raw.length > MAX_BYTES) throw new Error('Poster is larger than the 5 MB upload limit.');
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}
export class ArtworkUpload {
  private uploaded = new Map<string, Promise<string>>();
  constructor(private request: typeof fetch = fetch) {}
  async assetRef(source: string): Promise<string> {
    const existing = artworkAssetRef(source); if (existing) return existing;
    const blob = posterBlob(source);
    if (!TYPES.has(blob.type) || !blob.size) throw new Error('This poster format cannot be uploaded.');
    // Cache by image content, not placement ID: reusing a poster never uploads it again.
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const key = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    const prior = this.uploaded.get(key); if (prior) return prior;
    const upload = this.upload(blob);
    this.uploaded.set(key, upload);
    try { return await upload; }
    catch (error) { this.uploaded.delete(key); throw error; }
  }
  private async upload(blob: Blob): Promise<string> {
    const response = await this.request(ARTWORK_UPLOAD_URL, {
      method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(response.status === 413 ? 'Poster is larger than the 5 MB upload limit.' : 'Poster upload failed.');
    const result = await response.json();
    const assetRef = artworkAssetRef(result.assetRef);
    if (result.ok !== true || !assetRef) throw new Error('Server did not return a persistent poster URL.');
    return assetRef;
  }
}
