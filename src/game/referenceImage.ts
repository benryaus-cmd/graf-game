/** Decode/downsample once; references stay in this browser and use a blob URL, never an upload. */
export async function loadReferenceImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
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
