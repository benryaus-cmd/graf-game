const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

/** Fetch into browser memory. No artwork upload or multiplayer connection is involved. */
export async function downloadReferenceFile(rawUrl: string, signal?: AbortSignal): Promise<File> {
  let url: URL;
  try { url = new URL(rawUrl.trim()); }
  catch { throw new Error('Paste the full https:// image address.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Paste an http:// or https:// image address.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20_000);
  try {
    let response: Response;
    try { response = await fetch(url.href, { mode: 'cors', credentials: 'omit', signal: controller.signal }); }
    catch {
      if (controller.signal.aborted) throw new Error('Image download cancelled or timed out.');
      throw new Error('Could not download this image. The site may block direct imports; try another image address.');
    }
    if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
    if (Number(response.headers.get('content-length')) > MAX_REFERENCE_BYTES) {
      await response.body?.cancel();
      throw new Error('Choose an image smaller than 12 MB.');
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_REFERENCE_BYTES) { await reader.cancel(); throw new Error('Choose an image smaller than 12 MB.'); }
          chunks.push(new Uint8Array(value));
        }
      } finally { reader.releaseLock(); }
    } else {
      const data = await response.arrayBuffer();
      if (data.byteLength > MAX_REFERENCE_BYTES) throw new Error('Choose an image smaller than 12 MB.');
      chunks.push(new Uint8Array(data));
    }
    const blob = new Blob(chunks);
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
    const detected = head[0] === 137 && ascii(1, 4) === 'PNG' ? 'image/png'
      : head[0] === 255 && head[1] === 216 && head[2] === 255 ? 'image/jpeg'
      : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp'
      : ascii(0, 3) === 'GIF' ? 'image/gif' : '';
    const declared = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    const type = detected || (declared.startsWith('image/') ? declared : '');
    if (!type) throw new Error('Use a direct image address, not a webpage or search-results link.');
    const name = url.pathname.split('/').pop() || 'Reference image';
    return new File([blob], name, { type });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

/** Decode/downsample once; references stay in this browser and use a blob URL, never an upload. */
export async function loadReferenceImage(file: File): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > MAX_REFERENCE_BYTES) throw new Error('Choose an image smaller than 12 MB.');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('This image could not be opened.')); image.src = source; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image has no readable size.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('This image could not be prepared.')), 'image/png'));
    canvas.width = 0; canvas.height = 0;
    return URL.createObjectURL(blob);
  } finally { URL.revokeObjectURL(source); }
}
