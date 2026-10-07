export interface ReferenceThumbnail { blob: Blob; width: number; height: number }

/** Device-only data. Object URLs belong to mounted previews/active guides, never storage. */
export interface LocalReference {
  id: string;
  name: string;
  image: Blob;
  type: string;
  size: number;
  createdAt: number;
  thumbnail: Blob;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

const DATABASE = 'graffciti-reference-library';
const STORE = 'references';

function storageError(error: unknown): Error {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'QuotaExceededError') return Object.assign(new Error('Device storage is full. Delete a saved reference or free some space, then try again.'), { cause: error });
  if (name === 'SecurityError' || name === 'InvalidStateError') return Object.assign(new Error('This browser is preventing device storage. Check private browsing or storage settings; you can still use a guide for this session.'), { cause: error });
  return Object.assign(new Error('Could not access device reference storage. Try again; you can still use a guide for this session.'), { cause: error });
}

/** Small IndexedDB boundary; callers may inject a browser IDB factory. No network writes. */
export class ReferenceLibrary {
  constructor(private readonly factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('Device reference storage is unavailable in this browser. You can still use a guide for this session.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      let request: IDBOpenDBRequest;
      const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
      try { request = this.factory!.open(DATABASE, 1); }
      catch (error) { fail(storageError(error)); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onblocked = () => fail(new Error('Device reference storage is blocked by another tab. Close other GraffCiti tabs, then retry.'));
      request.onerror = () => fail(storageError(request.error));
      request.onsuccess = () => {
        const database = request.result;
        if (settled) { database.close(); return; }
        settled = true;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
  }

  private async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = database.transaction(STORE, mode);
          const request = operation(transaction.objectStore(STORE));
          // A successful request can still be rolled back: publish only after commit.
          transaction.oncomplete = () => resolve(request.result);
          transaction.onabort = () => reject(storageError(transaction.error ?? request.error));
          transaction.onerror = () => reject(storageError(transaction.error ?? request.error));
          request.onerror = () => reject(storageError(request.error));
        } catch (error) { reject(storageError(error)); }
      });
    } finally { database.close(); }
  }

  async list(): Promise<LocalReference[]> {
    const entries = await this.run<LocalReference[]>('readonly', store => store.getAll());
    return entries.sort((left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name));
  }

  async get(id: string): Promise<LocalReference | null> {
    return (await this.run<LocalReference | undefined>('readonly', store => store.get(id))) ?? null;
  }

  async add(image: Blob, name: string, preview: ReferenceThumbnail): Promise<LocalReference> {
    if (!image.size || (image.type && !image.type.startsWith('image/'))) throw new Error('Choose an image file to save.');
    if (!preview.blob.size || !preview.blob.type.startsWith('image/') || preview.width < 1 || preview.height < 1) throw new Error('This image has no readable preview.');
    const entry: LocalReference = {
      id: crypto.randomUUID(), name: name.trim() || 'Reference image', image: new Blob([image], { type: image.type }),
      type: image.type || preview.blob.type, size: image.size, createdAt: Date.now(),
      thumbnail: preview.blob, thumbnailWidth: preview.width, thumbnailHeight: preview.height,
    };
    await this.run<IDBValidKey>('readwrite', store => store.put(entry));
    return entry;
  }

  async remove(id: string): Promise<void> {
    await this.run<undefined>('readwrite', store => store.delete(id));
  }
}

/** Compact thumbnails derive from the already decoded guide and retain its aspect ratio. */
export async function createReferenceThumbnail(url: string): Promise<ReferenceThumbnail> {
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error('This reference preview could not be opened.')); image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image has no readable size.');
    const scale = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Reference previews are unavailable in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('This reference preview could not be prepared.')), 'image/png'));
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    image.onload = null; image.onerror = null; image.src = '';
    canvas.width = 0; canvas.height = 0;
  }
}
