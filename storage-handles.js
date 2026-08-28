// IndexedDB persistence for File System Access directory handles
const FVD_DB_NAME = 'FVDStorage';
const FVD_DB_VERSION = 1;
const FVD_DIR_KEY = 'downloadDir';

function fvdOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FVD_DB_NAME, FVD_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function fvdSaveDirectoryHandle(handle) {
  const db = await fvdOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, FVD_DIR_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function fvdGetDirectoryHandle() {
  try {
    const db = await fvdOpenDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(FVD_DIR_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function fvdClearDirectoryHandle() {
  try {
    const db = await fvdOpenDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(FVD_DIR_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}

async function fvdEnsureDirectoryPermission(handle) {
  if (!handle) return false;
  let perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return true;
  perm = await handle.requestPermission({ mode: 'readwrite' });
  return perm === 'granted';
}

async function fvdWriteBlobToDirectory(blob, filename) {
  const handle = await fvdGetDirectoryHandle();
  if (!handle) return false;
  if (!(await fvdEnsureDirectoryPermission(handle))) return false;
  const safeName = (filename || 'video.mp4').replace(/[/\\?%*:|"<>]/g, '_');
  const fileHandle = await handle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}
