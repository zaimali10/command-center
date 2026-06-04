/**
 * Storage Service
 * Provides a consistent API for localStorage with schema versioning,
 * error handling, and fallback for private browsing mode.
 */

export const STORAGE_PREFIX = 'cc_';
export const CURRENT_SCHEMA_VERSION = 1;

// In-memory fallback for environments where localStorage is unavailable
let memoryStorage = null;

function getStorage() {
  try {
    // Test localStorage availability
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return localStorage;
  } catch (e) {
    // Fallback to in-memory storage for private browsing mode
    if (!memoryStorage) {
      if (!globalThis.__ccMemStorage) {
        globalThis.__ccMemStorage = new Map();
      }
      memoryStorage = {
        getItem: (key) => globalThis.__ccMemStorage.get(key) || null,
        setItem: (key, value) => globalThis.__ccMemStorage.set(key, value),
        removeItem: (key) => globalThis.__ccMemStorage.delete(key),
        get length() { return globalThis.__ccMemStorage.size; },
        key: (index) => Array.from(globalThis.__ccMemStorage.keys())[index] || null,
        clear: () => globalThis.__ccMemStorage.clear()
      };
    }
    return memoryStorage;
  }
}

function prefixed(key) {
  return `${STORAGE_PREFIX}${key}`;
}

export const storage = {
  /**
   * Get a value from storage with JSON parsing
   * @param {string} key - The storage key (without prefix)
   * @param {*} defaultValue - Default value if key doesn't exist or parsing fails
   * @returns {*} The parsed value or default
   */
  get(key, defaultValue) {
    try {
      const raw = getStorage().getItem(prefixed(key));
      if (raw == null) {
        return defaultValue;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[storage] corrupt key', key, e);
      return defaultValue;
    }
  },

  /**
   * Set a value in storage with JSON stringification
   * @param {string} key - The storage key (without prefix)
   * @param {*} value - The value to store
   */
  set(key, value) {
    try {
      getStorage().setItem(prefixed(key), JSON.stringify(value));
    } catch (e) {
      console.warn('[storage] write failed', key, e);
    }
  },

  /**
   * Remove a key from storage
   * @param {string} key - The storage key (without prefix)
   */
  remove(key) {
    getStorage().removeItem(prefixed(key));
  },

  /**
   * Clear all cc_ prefixed keys from storage
   */
  clear() {
    const storageInstance = getStorage();
    const keysToRemove = [];

    if (storageInstance === memoryStorage) {
      // For memory storage, iterate over our Map
      for (const key of globalThis.__ccMemStorage.keys()) {
        if (key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
    } else {
      // For localStorage, iterate over all keys
      for (let i = 0; i < storageInstance.length; i++) {
        const key = storageInstance.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => storageInstance.removeItem(key));
  },

  /**
   * Get all keys (without prefix) that exist in storage
   * @returns {string[]} Array of un-prefixed key names
   */
  keys() {
    const storageInstance = getStorage();
    const keys = [];

    if (storageInstance === memoryStorage) {
      // For memory storage, iterate over our Map
      for (const key of globalThis.__ccMemStorage.keys()) {
        if (key.startsWith(STORAGE_PREFIX)) {
          keys.push(key.slice(STORAGE_PREFIX.length));
        }
      }
    } else {
      // For localStorage, iterate over all keys
      for (let i = 0; i < storageInstance.length; i++) {
        const key = storageInstance.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keys.push(key.slice(STORAGE_PREFIX.length));
        }
      }
    }

    return keys;
  }
};

// Schema migrations
const MIGRATIONS = [
  {
    version: 1,
    migrate: (data) => {
      const storageInstance = getStorage();
      const legacyKeys = ['layout', 'kanban_cards', 'todos', 'grocery_items', 'theme'];
      const newData = { ...data };

      // Move legacy keys to prefixed versions
      for (const key of legacyKeys) {
        try {
          const raw = storageInstance.getItem(key);
          if (raw != null) {
            // Parse and re-serialize to ensure valid JSON
            const value = JSON.parse(raw);
            newData[key] = value;
            // Remove the old unprefixed key
            storageInstance.removeItem(key);
          }
        } catch (e) {
          console.warn('[storage] failed to migrate legacy key', key, e);
        }
      }

      return newData;
    }
  }
];

/**
 * Run schema migrations to update storage format
 * This is called once on app boot and is idempotent
 */
export function runMigrations() {
  try {
    const currentVersion = storage.get('schema_version', 0);

    // If stored version is newer than current, warn but don't migrate
    if (currentVersion > CURRENT_SCHEMA_VERSION) {
      console.warn('[storage] stored schema version', currentVersion, 'is newer than current', CURRENT_SCHEMA_VERSION);
      return;
    }

    // Get snapshot of all current data
    const currentKeys = storage.keys();
    const currentData = {};
    for (const key of currentKeys) {
      if (key !== 'schema_version') {
        currentData[key] = storage.get(key, null);
      }
    }

    // Apply migrations in sequence
    let migratedData = currentData;
    for (const migration of MIGRATIONS) {
      if (migration.version > currentVersion) {
        try {
          migratedData = migration.migrate(migratedData);
          console.log('[storage] applied migration to version', migration.version);
        } catch (e) {
          console.error('[storage] migration failed for version', migration.version, e);
          // Stop migrating on failure to preserve data
          return;
        }
      }
    }

    // Write back migrated data
    for (const [key, value] of Object.entries(migratedData)) {
      if (value != null) {
        storage.set(key, value);
      }
    }

    // Update schema version
    storage.set('schema_version', CURRENT_SCHEMA_VERSION);

  } catch (e) {
    console.error('[storage] migration process failed', e);
  }
}