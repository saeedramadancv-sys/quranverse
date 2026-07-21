/**
 * config.js — Runtime configuration for QuranVerse Transcription.
 *
 * The partner's backend base URL lives here. It can be overridden at
 * runtime from the Settings panel (persisted to localStorage), which is
 * handy when the backend runs on a different host/port during integration.
 */

window.APP_CONFIG = {
  // Base URL of the partner's REST API. Change to match the backend, e.g.
  // "http://localhost:8000/api" or "https://api.quranverse.example/v1".
  API_BASE_URL: localStorage.getItem("qv.apiBaseUrl") || "http://localhost:8000/api",

  // If true, the app tries the REST API first and falls back to local
  // sample data on failure. If false, it always uses local data.
  USE_BACKEND: (localStorage.getItem("qv.useBackend") ?? "true") === "true",

  // Request timeout in milliseconds.
  REQUEST_TIMEOUT_MS: 8000,

  // Minimum word-accuracy (%) to consider a transcription "verified".
  PASS_THRESHOLD: 90
};

/** Persist a config change and update the live object. */
window.saveConfig = function (patch) {
  if ("API_BASE_URL" in patch) {
    localStorage.setItem("qv.apiBaseUrl", patch.API_BASE_URL);
    window.APP_CONFIG.API_BASE_URL = patch.API_BASE_URL;
  }
  if ("USE_BACKEND" in patch) {
    localStorage.setItem("qv.useBackend", String(patch.USE_BACKEND));
    window.APP_CONFIG.USE_BACKEND = patch.USE_BACKEND;
  }
};
