/**
 * Business Settings Utility
 * Handles loading and updating business settings (favicon, title, logo)
 */

import apiClient from '../api/axios.js';
import { API_ENDPOINTS } from '../api/config.js';

let cachedSettings = null;
// Callers that fire before the first response lands would each start their own
// request -- the result cache below only helps once something has resolved.
// Eight modules import this and several mount together, which is why one page
// load asked for business settings three times.
let inFlight = null;

/**
 * Load business settings from backend (public endpoint - no auth required)
 */
export const loadBusinessSettings = async () => {
  try {
    // Check if we have a cached version
    if (cachedSettings) {
      return cachedSettings;
    }

    // Use public endpoint that doesn't require authentication
    if (!inFlight) {
      inFlight = apiClient
        .get(API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS_PUBLIC)
        .finally(() => {
          inFlight = null;
        });
    }
    const response = await inFlight;
    const settings = response?.data?.data || response?.data;
    
    if (settings) {
      cachedSettings = settings;
      updateFavicon(settings.favicon?.url);
      updateTitle(settings.companyName);
      return settings;
    }
  } catch (error) {
    // Silently fail - this is expected if settings don't exist yet
    return null;
  }
};

/**
 * Update favicon in document
 */
export const updateFavicon = (url) => {
  if (!url) return;

  // Remove existing favicon
  const existingFavicon = document.querySelector("link[rel='icon']");
  if (existingFavicon) {
    existingFavicon.remove();
  }

  // Add new favicon
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = url;
  document.head.appendChild(link);
};

/**
 * Update page title
 */
export const updateTitle = (companyName) => {
  if (companyName) {
    document.title = companyName;
  }
};

/**
 * Clear cached settings (call after updating settings)
 */
export const clearCache = () => {
  cachedSettings = null;
};

/**
 * Get cached settings
 */
export const getCachedSettings = () => {
  return cachedSettings;
};

/**
 * Get company name from business settings with fallback
 * @returns {string} Company name or default "Maava"
 */
export const getCompanyName = () => {
  const settings = getCachedSettings();
  return settings?.companyName || 'Maava';
};

/**
 * Get company name asynchronously (loads if not cached)
 * @returns {Promise<string>} Company name or default "Maava"
 */
export const getCompanyNameAsync = async () => {
  try {
    const settings = await loadBusinessSettings();
    return settings?.companyName || 'Maava';
  } catch (error) {
    return 'Maava';
  }
};
