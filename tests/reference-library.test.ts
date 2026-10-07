import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferenceLibrary, createReferenceThumbnail } from '../src/game/referenceLibrary';

/** IDB boundary double: request success precedes transaction commit, writes stage until commit. */
function memoryIndexedDB() {
  const records = new Map<string, unknown>();
  const transactions: any[] = [];
  const opens: any[] = [];
  let exists = false;
  let blocked = false;
  let openError: DOMException | null = null;
  let writeError: DOMException | null = null;
  let hold = false;
  let closed = 0;
  const database = {
    objectStoreNames: { contains: (name: string) => exists && name === 'references' },
    createObjectStore(name: string, options: { keyPath: string }) {
      assert.equal(name, 'references'); assert.equal(options.keyPath, 'id'); exists = true;
    },
    close() { closed++; },
    transaction(name: string, mode: string) {
      assert.equal(name, 'references'); assert.ok(['readonly', 'readwrite'].includes(mode));
      const staged = new Map(records);
      const tx: any = { error: null, oncomplete: null, onerror: null, onabort: null, finish() {
        if (tx.error) { tx.onabort?.(); return; }
        if (mode === 'readwrite') { records.clear(); for (const [key, value] of staged) records.set(key, value); }
        tx.oncomplete?.();
      } };
      tx.objectStore = (store: string) => {
        assert.equal(store, 'references');
        const request = (operation: () => unknown) => {
          const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
          queueMicrotask(() => {
            if (mode === 'readwrite' && writeError) { req.error = writeError; tx.error = writeError; req.onerror?.(); tx.onerror?.(); tx.onabort?.(); return; }
            req.result = operation(); req.onsuccess?.();
            if (!hold) queueMicrotask(() => tx.finish());
          });
          return req;
        };
        return {
          put: (value: { id: string }) => request(() => { staged.set(value.id, structuredClone(value)); return value.id; }),
          getAll: () => request(() => [...staged.values()].map(value => structuredClone(value))),
          get: (id: string) => request(() => staged.get(id) ? structuredClone(staged.get(id)) : undefined),
          delete: (id: string) => request(() => staged.delete(id)),
        };
      };
      transactions.push(tx);
      return tx;
    },
  };
  return {
    records, transactions, opens,
    get closed() { return closed; },
    set blocked(value: boolean) { blocked = value; },
    set openError(value: DOMException | null) { openError = value; },
    set writeError(value: DOMException | null) { writeError = value; },
    set hold(value: boolean) { hold = value; },
    factory: { open(name: string, version: number) {
      assert.equal(name, 'graffciti-reference-library'); assert.equal(version, 1);
      const request: any = { result: database, error: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
      opens.push(request);
      queueMicrotask(() => {
        if (openError) { request.error = openError; request.onerror?.(); return; }
        if (blocked) { request.onblocked?.(); return; }
        if (!exists) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    } } as unknown as IDBFactory,
  };
}

const image = () => new Blob(['private original image'], { type: 'image/png' });
const thumbnail = () => ({ blob: new Blob(['small preview'], { type: 'image/png' }), width: 120, height: 80 });

test('device reference library retains multiple private image blobs and reusable names across instances', async () => {
  const db = memoryIndexedDB();
  const library = new ReferenceLibrary(db.factory);
  const first = await library.add(image(), 'First mural.png', thumbnail());
  const second = await library.add(image(), 'Second mural.png', thumbnail());
  assert.notEqual(first.id, second.id);
  const reopened = new ReferenceLibrary(db.factory);
  const entries = await reopened.list();
  assert.deepEqual(entries.map(entry => entry.name).sort(), ['First mural.png', 'Second mural.png']);
  const saved = await reopened.get(first.id);
  assert.ok(saved?.image instanceof Blob);
  assert.equal(await saved.image.text(), 'private original image');
  assert.equal(await saved.thumbnail.text(), 'small preview');
  assert.equal(saved.thumbnailWidth, 120); assert.equal(saved.thumbnailHeight, 80);
  assert.equal(saved.type, 'image/png'); assert.ok(saved.createdAt > 0);
  assert.ok(!JSON.stringify([...db.records.values()]).includes('blob:'), 'ephemeral object URLs are never persisted');
  await reopened.remove(first.id);
  assert.equal(await reopened.get(first.id), null);
  assert.deepEqual((await reopened.list()).map(entry => entry.id), [second.id]);
  // A caller can still use the previously read Blob after deleting its device-library record.
  assert.equal(await saved.image.text(), 'private original image');
});

test('reference storage waits for transaction completion and rejects rollback after request success', async () => {
  const db = memoryIndexedDB(); db.hold = true;
  const library = new ReferenceLibrary(db.factory);
  let settled = false;
  const pending = library.add(image(), 'Pending', thumbnail()).then(value => { settled = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); assert.equal(db.records.size, 0);
  db.transactions[0].error = new DOMException('disk gone', 'UnknownError');
  db.transactions[0].finish();
  await assert.rejects(pending, /save|storage|device/i);
  assert.equal(db.records.size, 0);
  db.hold = false;
  await library.add(image(), 'Retry', thumbnail());
  assert.equal((await library.list()).length, 1);
});

test('blocked reference storage rejects promptly and closes an eventual connection', async () => {
  const db = memoryIndexedDB(); db.blocked = true;
  const library = new ReferenceLibrary(db.factory);
  await assert.rejects(library.list(), /other.*tab|blocked/i);
  db.opens[0].onsuccess();
  assert.equal(db.closed, 1, 'late open after rejection cannot hold a database connection');
  db.blocked = false;
  assert.deepEqual(await library.list(), []);
});

test('quota and private-mode failures give actionable device-storage errors', async () => {
  const db = memoryIndexedDB();
  const library = new ReferenceLibrary(db.factory);
  db.writeError = new DOMException('Full', 'QuotaExceededError');
  await assert.rejects(library.add(image(), 'Large', thumbnail()), /full|space|quota/i);
  assert.equal(db.records.size, 0);
  db.writeError = null; db.openError = new DOMException('denied', 'SecurityError');
  await assert.rejects(new ReferenceLibrary(db.factory).list(), /browser|private|storage/i);
  await assert.rejects(new ReferenceLibrary(null).list(), /browser|unavailable|storage/i);
});

test('reference thumbnails have compact proportional dimensions and release decoder resources', async () => {
  const oldImage = globalThis.Image; const oldDocument = globalThis.document;
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(callback: (value: Blob) => void) { callback(new Blob(['preview'], { type: 'image/png' })); } };
  const images: Array<{ src: string }> = [];
  globalThis.Image = class { naturalWidth = 2400; naturalHeight = 1200; onload?: () => void; onerror?: () => void; private source = ''; constructor() { images.push(this); } get src() { return this.source; } set src(value: string) { this.source = value; if (value) queueMicrotask(() => this.onload?.()); } } as unknown as typeof Image;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  try {
    const preview = await createReferenceThumbnail('blob:active-guide');
    assert.equal(preview.width, 160); assert.equal(preview.height, 80);
    assert.ok(preview.blob instanceof Blob);
    assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
    assert.equal(images[0].src, '');
  } finally { globalThis.Image = oldImage; globalThis.document = oldDocument; }
});

test('reference sheet presents device-library storage separately from URL and file guide import', async () => {
  const { default: ReferenceSheet } = await import('../src/components/ReferenceSheet');
  const html = renderToStaticMarkup(createElement(ReferenceSheet, { selected: false, guide: null, onChange() {}, onClose() {} }));
  assert.match(html, /SAVED ON THIS DEVICE/);
  assert.match(html, /Reference image URL/);
  assert.match(html, /Choose reference image/);
  assert.match(html, /never saved into your piece or sent to the server/);
  assert.ok(!html.includes('SAVE TO SERVER'));
  assert.ok(!html.includes('DELETE SERVER REFERENCE'));
});

test('explicit owner reference callbacks expose server controls separately from the private device library', async () => {
  const { default: ReferenceSheet } = await import('../src/components/ReferenceSheet');
  const html = renderToStaticMarkup(createElement(ReferenceSheet, {
    selected: true,
    guide: { url: 'blob:current', name: 'Local sketch', visible: true, moving: false, opacity: .35, scale: 1, x: 0, y: 0, rotation: 0 },
    onChange() {}, onClose() {}, canKeepReference: true,
    ownerReferences: [{ referenceId: 'server-reference-one', name: 'Saved server sketch', assetRef: 'server-asset-one' }],
    onKeepReference() {}, onDeleteOwnerReference() {},
  }));
  assert.match(html, /KEEP \/ SAVE TO SERVER/);
  assert.match(html, /Saved server references/);
  assert.match(html, /DELETE SERVER REFERENCE/);
  assert.match(html, /Saved server sketch/);
  assert.match(html, /SAVED ON THIS DEVICE/);
  assert.match(html, /explicit/);
});

test('server reference data alone never grants server-save or server-delete controls', async () => {
  const { default: ReferenceSheet } = await import('../src/components/ReferenceSheet');
  const html = renderToStaticMarkup(createElement(ReferenceSheet, {
    selected: true, guide: null, onChange() {}, onClose() {}, canKeepReference: true,
    ownerReferences: [{ referenceId: 'server-reference-one', name: 'Owner-only sketch', assetRef: 'server-asset-one' }],
  }));
  assert.ok(!html.includes('SAVE TO SERVER'));
  assert.ok(!html.includes('DELETE SERVER REFERENCE'));
  assert.ok(!html.includes('Owner-only sketch'));
});
