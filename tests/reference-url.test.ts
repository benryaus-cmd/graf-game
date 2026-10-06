import test from 'node:test';
import assert from 'node:assert/strict';

const png = new Uint8Array([137,80,78,71,13,10,26,10]);

test('direct image URL downloads actual bytes as a local File without uploading', async t => {
  const module = await import('../src/game/referenceImage');
  assert.equal(typeof module.downloadReferenceFile, 'function');
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL, options?: RequestInit) => {
    calls.push(String(url));
    assert.equal(options?.credentials, 'omit');
    return new Response(png, {headers: {'content-type': 'image/png'}});
  });
  const file = await module.downloadReferenceFile(' https://images.example/reference.png?size=800 ');
  assert.equal(file.name, 'reference.png');
  assert.equal(file.type, 'image/png');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), png);
  assert.deepEqual(calls, ['https://images.example/reference.png?size=800']);
});

test('extensionless binary image links are recognized from their downloaded bytes', async t => {
  const {downloadReferenceFile} = await import('../src/game/referenceImage');
  assert.equal(typeof downloadReferenceFile, 'function');
  t.mock.method(globalThis, 'fetch', async () => new Response(png, {headers: {'content-type': 'application/octet-stream'}}));
  const file = await downloadReferenceFile('https://images.example/asset?id=123');
  assert.equal(file.type, 'image/png');
});

test('image URL import rejects webpages and failed responses instead of making a ghost guide', async t => {
  const {downloadReferenceFile} = await import('../src/game/referenceImage');
  assert.equal(typeof downloadReferenceFile, 'function');
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Google images</html>', {headers: {'content-type': 'text/html'}}));
  await assert.rejects(downloadReferenceFile('https://images.example/search'), /direct.*image/i);
  t.mock.method(globalThis, 'fetch', async () => new Response('', {status:404}));
  await assert.rejects(downloadReferenceFile('https://images.example/missing.jpg'), /404/);
});

test('image URL import bounds downloaded bytes even without a content-length header', async t => {
  const {downloadReferenceFile} = await import('../src/game/referenceImage');
  assert.equal(typeof downloadReferenceFile, 'function');
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(12*1024*1024+1), {headers: {'content-type':'image/png'}}));
  await assert.rejects(downloadReferenceFile('https://images.example/large.png'), /12 MB/);
});

test('image URL import rejects non-web links and explains blocked cross-origin downloads', async t => {
  const {downloadReferenceFile} = await import('../src/game/referenceImage');
  assert.equal(typeof downloadReferenceFile, 'function');
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(downloadReferenceFile('javascript:alert(1)'), /https/i);
  await assert.rejects(downloadReferenceFile('https://images.example/blocked.jpg'), /blocks.*direct|could not.*download/i);
});
