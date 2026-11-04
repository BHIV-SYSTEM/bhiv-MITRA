/**
 * High-Capacity Companion Asset Storage Service for React SPA
 * Uses IndexedDB to store MP4 videos, animated GIFs, WebP, PNG, and JPG assets
 * without hitting localStorage's 5MB quota limit.
 */
class CompanionStorage {
  private dbName = 'mitra_companion_db';
  private storeName = 'companion_assets';
  private dbPromise: Promise<IDBDatabase | null>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        req.onsuccess = (e: any) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  async setAsset(key: string, value: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    } catch (e) {
      console.warn('[CompanionStorage] IndexedDB set error:', e);
    }

    try {
      if (typeof localStorage !== 'undefined' && value.length < 2 * 1024 * 1024) {
        localStorage.setItem('mitra_companion_asset', value);
        localStorage.setItem('mitra_active_avatar', value);
      }
    } catch (_) {}
  }

  async getAsset(key: string): Promise<string | null> {
    try {
      const db = await this.dbPromise;
      if (db) {
        const result = await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readonly');
          const store = tx.objectStore(this.storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
        if (result) return result;
      }
    } catch (e) {
      console.warn('[CompanionStorage] IndexedDB get error:', e);
    }

    if (typeof localStorage !== 'undefined') {
      return (
        localStorage.getItem('mitra_companion_asset') ||
        localStorage.getItem('mitra_active_avatar') ||
        localStorage.getItem('mitra_avatar_custom') ||
        null
      );
    }
    return null;
  }

  async removeAsset(key: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    } catch (e) {
      console.warn('[CompanionStorage] IndexedDB delete error:', e);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mitra_companion_asset');
      localStorage.removeItem('mitra_active_avatar');
      localStorage.removeItem('mitra_avatar_custom');
      localStorage.removeItem('mitra_custom_avatar');
      localStorage.removeItem('mitra_avatar_data_url');
    }
  }
}

export const companionStorage = new CompanionStorage();
