/**
 * Google Maps API Key Utility
 * Fetches API key from backend database instead of .env file
 */

const SESSION_KEY = 'mv.mapsKey';

let cachedApiKey = null;
let apiKeyPromise = null;

// Survives a page navigation, so a session costs one lookup rather than one
// per screen that shows a map.
try {
  cachedApiKey = window.sessionStorage?.getItem(SESSION_KEY) || null;
} catch {
  cachedApiKey = null;
}

/**
 * Get Google Maps API Key from backend
 * Uses caching to avoid multiple requests
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey() {
  // Return cached key if available
  if (cachedApiKey) {
    return cachedApiKey;
  }

  // Return existing promise if already fetching
  if (apiKeyPromise) {
    return apiKeyPromise;
  }

  // Fetch from backend
  apiKeyPromise = (async () => {
    try {
      // Admin -> Settings -> Business Setup stores the key; this endpoint is
      // public and already carries it. It replaced getPublicEnvVariables,
      // which was deleted -- calling it threw, and every map on the site
      // reported "key not found" while the key sat in the database.
      const { adminAPI } = await import('../api/index.js');
      const response = await adminAPI.getBusinessSettingsPublic();
      const key = response?.data?.data?.googleMapsApiKey;

      if (key) {
        cachedApiKey = key;
        try {
          window.sessionStorage?.setItem(SESSION_KEY, key);
        } catch {
          // Private windows refuse storage; the in-memory cache still holds.
        }
        return cachedApiKey;
      }

      // The built-in key is the fallback, so a cleared panel field does not
      // black out every map at once.
      const builtIn = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (builtIn) {
        cachedApiKey = builtIn;
        return cachedApiKey;
      }

      console.warn('⚠️ Google Maps API key not set. Admin → Settings → Business Setup → Google Maps API Key');
      return '';
    } catch (error) {
      console.warn('Failed to fetch Google Maps API key from backend:', error.message);
      return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    } finally {
      apiKeyPromise = null;
    }
  })();

  return apiKeyPromise;
}

/**
 * Clear cached API key (call after updating in admin panel)
 */
export function clearGoogleMapsApiKeyCache() {
  try {
    window.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored to clear.
  }
  cachedApiKey = null;
  apiKeyPromise = null;
}

