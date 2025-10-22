/**
 * Markdown Cache Manager
 * Manages caching of converted Markdown content
 */

class MarkdownCache {
  constructor() {
    this.CACHE_KEY = 'markdownCache';
    this.SETTINGS_KEY = 'deepSearchSettings';
    this.MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  }

  /**
   * Get default settings
   * @returns {Object} - Default deep search settings
   */
  getDefaultSettings() {
    return {
      enabled: false,
      preMarkdown: false,
      batchSize: 3,
      cacheDuration: 24, // hours
      maxPageSize: 500 // KB
    };
  }

  /**
   * Get deep search settings
   * @returns {Promise<Object>} - Deep search settings
   */
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.SETTINGS_KEY], (data) => {
        resolve(data[this.SETTINGS_KEY] || this.getDefaultSettings());
      });
    });
  }

  /**
   * Save deep search settings
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.SETTINGS_KEY]: settings }, resolve);
    });
  }

  /**
   * Get cached Markdown for a URL
   * @param {string} url - The URL to get cache for
   * @returns {Promise<string|null>} - Cached Markdown or null
   */
  async get(url) {
    try {
      const cache = await this.getCache();
      const entry = cache[url];

      if (!entry) {
        return null;
      }

      // Check if expired
      if (this.isExpired(entry)) {
        await this.remove(url);
        return null;
      }

      return entry.content;

    } catch (error) {
      console.error('Error getting cache:', error);
      return null;
    }
  }

  /**
   * Set cached Markdown for a URL
   * @param {string} url - The URL to cache
   * @param {string} content - Markdown content
   * @returns {Promise<void>}
   */
  async set(url, content) {
    try {
      const cache = await this.getCache();

      // Create cache entry
      const entry = {
        content: content,
        timestamp: Date.now(),
        size: content.length,
        url: url
      };

      // Add to cache
      cache[url] = entry;

      // Check total cache size
      const totalSize = this.calculateTotalSize(cache);
      if (totalSize > this.MAX_CACHE_SIZE) {
        // Remove oldest entries until under limit
        await this.trimCache(cache);
      }

      // Save cache
      await this.saveCache(cache);

    } catch (error) {
      console.error('Error setting cache:', error);
      
      // Handle quota exceeded
      if (error.message && error.message.includes('QUOTA_BYTES')) {
        console.warn('Storage quota exceeded, clearing old cache');
        await this.clearExpired();
        // Try again
        try {
          const cache = await this.getCache();
          cache[url] = {
            content: content,
            timestamp: Date.now(),
            size: content.length,
            url: url
          };
          await this.saveCache(cache);
        } catch (retryError) {
          console.error('Failed to cache after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * Remove cached entry for a URL
   * @param {string} url - The URL to remove
   * @returns {Promise<void>}
   */
  async remove(url) {
    try {
      const cache = await this.getCache();
      delete cache[url];
      await this.saveCache(cache);
    } catch (error) {
      console.error('Error removing cache:', error);
    }
  }

  /**
   * Clear all cached entries
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await this.saveCache({});
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Clear expired cache entries
   * @returns {Promise<number>} - Number of entries removed
   */
  async clearExpired() {
    try {
      const cache = await this.getCache();
      const urls = Object.keys(cache);
      let removedCount = 0;

      for (const url of urls) {
        if (this.isExpired(cache[url])) {
          delete cache[url];
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await this.saveCache(cache);
      }

      return removedCount;

    } catch (error) {
      console.error('Error clearing expired cache:', error);
      return 0;
    }
  }

  /**
   * Check if cache entry is expired
   * @param {Object} entry - Cache entry
   * @returns {boolean} - True if expired
   */
  isExpired(entry) {
    if (!entry || !entry.timestamp) {
      return true;
    }

    const settings = this.getDefaultSettings(); // Use default for sync check
    const maxAge = settings.cacheDuration * 60 * 60 * 1000; // Convert hours to ms
    const age = Date.now() - entry.timestamp;

    return age > maxAge;
  }

  /**
   * Check if cache entry is expired (async version)
   * @param {Object} entry - Cache entry
   * @returns {Promise<boolean>} - True if expired
   */
  async isExpiredAsync(entry) {
    if (!entry || !entry.timestamp) {
      return true;
    }

    const settings = await this.getSettings();
    const maxAge = settings.cacheDuration * 60 * 60 * 1000; // Convert hours to ms
    const age = Date.now() - entry.timestamp;

    return age > maxAge;
  }

  /**
   * Get all cached entries
   * @returns {Promise<Object>} - Cache object
   */
  async getCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.CACHE_KEY], (data) => {
        resolve(data[this.CACHE_KEY] || {});
      });
    });
  }

  /**
   * Save cache object
   * @param {Object} cache - Cache object to save
   * @returns {Promise<void>}
   */
  async saveCache(cache) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.CACHE_KEY]: cache }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Calculate total size of cache
   * @param {Object} cache - Cache object
   * @returns {number} - Total size in bytes
   */
  calculateTotalSize(cache) {
    let total = 0;
    for (const url in cache) {
      if (cache[url] && cache[url].size) {
        total += cache[url].size;
      }
    }
    return total;
  }

  /**
   * Trim cache to fit within size limit
   * @param {Object} cache - Cache object
   * @returns {Promise<void>}
   */
  async trimCache(cache) {
    // Sort entries by timestamp (oldest first)
    const entries = Object.entries(cache).sort((a, b) => {
      return (a[1].timestamp || 0) - (b[1].timestamp || 0);
    });

    // Remove oldest entries until under limit
    let totalSize = this.calculateTotalSize(cache);
    let index = 0;

    while (totalSize > this.MAX_CACHE_SIZE && index < entries.length) {
      const [url, entry] = entries[index];
      totalSize -= entry.size || 0;
      delete cache[url];
      index++;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache stats
   */
  async getStats() {
    try {
      const cache = await this.getCache();
      const urls = Object.keys(cache);
      const totalSize = this.calculateTotalSize(cache);
      
      let expiredCount = 0;
      for (const url of urls) {
        if (await this.isExpiredAsync(cache[url])) {
          expiredCount++;
        }
      }

      return {
        totalEntries: urls.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        expiredEntries: expiredCount,
        validEntries: urls.length - expiredCount
      };

    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        totalSizeMB: '0.00',
        expiredEntries: 0,
        validEntries: 0
      };
    }
  }

  /**
   * Check if URL is cached and valid
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} - True if cached and valid
   */
  async isCached(url) {
    const content = await this.get(url);
    return content !== null;
  }

  /**
   * Get multiple cached entries
   * @param {string[]} urls - Array of URLs
   * @returns {Promise<Object>} - Map of URL to content
   */
  async getMultiple(urls) {
    const cache = await this.getCache();
    const result = {};

    for (const url of urls) {
      const entry = cache[url];
      if (entry && !this.isExpired(entry)) {
        result[url] = entry.content;
      }
    }

    return result;
  }

  /**
   * Set multiple cached entries
   * @param {Object} entries - Map of URL to content
   * @returns {Promise<void>}
   */
  async setMultiple(entries) {
    const cache = await this.getCache();

    for (const [url, content] of Object.entries(entries)) {
      cache[url] = {
        content: content,
        timestamp: Date.now(),
        size: content.length,
        url: url
      };
    }

    // Check and trim if needed
    const totalSize = this.calculateTotalSize(cache);
    if (totalSize > this.MAX_CACHE_SIZE) {
      await this.trimCache(cache);
    }

    await this.saveCache(cache);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownCache;
}
