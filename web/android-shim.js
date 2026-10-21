// Stands in for the claude.ai runtime inside the Android app: the same
// window.claude.use("db" | "user" | "downloads") calls the page already makes,
// backed by this phone's localStorage and the CalypsoAndroid file-save bridge.
(function () {
  const PREFIX = 'calypso:db:';
  const docListeners = new Map();   // doc path -> Set<fn>
  const colListeners = new Map();   // collection path -> Set<fn>

  const read = path => { try { const v = localStorage.getItem(PREFIX + path); return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; } };
  const snap = (path, data) => {
    const frozen = data === undefined ? undefined : Object.freeze(JSON.parse(JSON.stringify(data)));
    return { id: path.split('/').pop(), exists: frozen !== undefined, data: () => frozen, metadata: { fromCache: false, hasPendingWrites: false } };
  };
  function listCol(col) {
    const pre = PREFIX + col + '/', docs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(pre) && !k.slice(pre.length).includes('/')) docs.push(snap(col + '/' + k.slice(pre.length), read(k.slice(PREFIX.length))));
    }
    docs.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  const colOf = path => path.split('/').slice(0, -1).join('/');
  function notify(path) {
    setTimeout(() => {
      (docListeners.get(path) || []).forEach(fn => fn(snap(path, read(path))));
      const col = colOf(path);
      (colListeners.get(col) || []).forEach(fn => fn(listCol(col)));
    }, 0);
  }
  function write(path, data) {
    try { localStorage.setItem(PREFIX + path, JSON.stringify(data)); }
    catch (e) { throw { code: 'quota_exceeded', message: 'Phone storage for the app is full.' }; }
    notify(path);
  }
  const listen = (map, key, fn, first) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(fn);
    setTimeout(() => fn(first()), 0);
    return () => map.get(key).delete(fn);
  };

  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      async get() { return snap(path, read(path)); },
      async set(data) { write(path, data); },
      async update(data) {
        const cur = read(path);
        if (cur === undefined) throw { code: 'invalid_argument', message: 'Document does not exist.' };
        write(path, Object.assign({}, cur, data));
      },
      async delete() { localStorage.removeItem(PREFIX + path); notify(path); },
      onSnapshot(next) { return listen(docListeners, path, next, () => snap(path, read(path))); },
      collection(sub) { return colRef(path + '/' + sub); },
    };
  }
  function colRef(path) {
    const q = {
      path,
      where() { return q; }, orderBy() { return q; }, limit() { return q; },
      async get() { return listCol(path); },
      onSnapshot(next) { return listen(colListeners, path, next, () => listCol(path)); },
      doc(id) { return docRef(path + '/' + (id || Math.random().toString(36).slice(2))); },
      async add(data) { const r = q.doc(); await r.set(data); return r; },
    };
    return q;
  }
  const db = { doc: docRef, collection: colRef };

  const user = { isOwner: () => true, canEdit: () => true, can: async () => true, id: async () => 'phone', me: async () => ({ id: 'phone', name: '' }) };

  const pending = new Map();
  window.__calypsoSaved = (id, status) => {
    const p = pending.get(id); if (!p) return; pending.delete(id);
    status === 'saved' ? p.resolve({ status: 'saved' }) : p.reject({ code: status, message: status });
  };
  const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', json: 'application/json', txt: 'text/plain' };
  const downloads = {
    async save({ filename, data }) {
      if (!window.CalypsoAndroid) throw { code: 'unavailable', message: 'Saving files needs the Android app.' };
      let bytes = data;
      if (typeof data === 'string') bytes = new TextEncoder().encode(data);
      else if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const id = 's' + Date.now() + Math.random().toString(36).slice(2);
      const ext = (filename.split('.').pop() || '').toLowerCase();
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        window.CalypsoAndroid.saveFile(id, filename, btoa(bin), MIME[ext] || 'application/octet-stream');
      });
    },
  };

  const caps = { db, user, downloads };
  window.claude = { use: async name => caps[name] || null };
})();
