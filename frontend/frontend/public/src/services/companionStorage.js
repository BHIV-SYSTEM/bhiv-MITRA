/**
 * High-Capacity Companion Asset Storage Service
 * Uses IndexedDB to store MP4 videos, animated GIFs, WebP, PNG, and JPG assets
 * without hitting localStorage's 5MB quota limit.
 */
class CompanionStorage {
  constructor() {
    this.dbName = 'mitra_companion_db';
    this.storeName = 'companion_assets';
    this.dbPromise = this.initDB();
  }

  async initDB() {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  async setAsset(key, value) {
    try {
      const db = await this.dbPromise;
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    } catch (e) {
      console.warn('[CompanionStorage] IndexedDB set error, falling back:', e);
    }

    // Also attempt localStorage for small assets or fallback flag
    try {
      if (typeof localStorage !== 'undefined') {
        if (!value || value === 'default') {
          localStorage.removeItem('mitra_companion_asset');
          localStorage.removeItem('mitra_avatar_custom');
          localStorage.removeItem('mitra_custom_avatar');
          localStorage.removeItem('mitra_avatar_data_url');
        } else if (value.length < 2 * 1024 * 1024) { // Under 2MB
          localStorage.setItem('mitra_companion_asset', value);
          localStorage.setItem('mitra_avatar_custom', value);
        } else {
          localStorage.setItem('mitra_companion_asset_indexed', 'true');
        }
      }
    } catch (e) {
      // Ignore localStorage quota errors since IndexedDB has saved it
    }
  }

  async getAsset(key) {
    try {
      const db = await this.dbPromise;
      if (db) {
        const val = await new Promise((resolve) => {
          const tx = db.transaction(this.storeName, 'readonly');
          const store = tx.objectStore(this.storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (val) return val;
      }
    } catch (e) {
      // fallback
    }

    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('mitra_companion_asset') ||
             localStorage.getItem('mitra_avatar_custom') ||
             localStorage.getItem('mitra_custom_avatar') ||
             localStorage.getItem('mitra_avatar_data_url') ||
             null;
    }
    return null;
  }

  async removeAsset(key) {
    try {
      const db = await this.dbPromise;
      if (db) {
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).delete(key);
      }
    } catch (e) {}

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mitra_companion_asset');
      localStorage.removeItem('mitra_companion_asset_indexed');
      localStorage.removeItem('mitra_avatar_data_url');
      localStorage.removeItem('mitra_avatar_custom');
      localStorage.removeItem('mitra_custom_avatar');
    }
  }
}

export const companionStorage = new CompanionStorage();
