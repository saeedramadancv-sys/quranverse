/**
 * api.js — REST API integration layer.
 *
 * Wraps the partner's backend endpoints and gracefully degrades to local
 * sample data (data.js) / the local verification engine (verify.js) when
 * the backend is unreachable. All methods return Promises and normalize
 * responses so the UI never needs to know which source served the data.
 *
 * Expected backend contract (adjust to match the partner's implementation):
 *   GET  {BASE}/surahs                       -> [{ number, name, englishName, ... }]
 *   GET  {BASE}/surahs/{n}/ayahs             -> [{ number, text }]
 *   POST {BASE}/verify                       -> { accuracy, passed, ops, stats }
 *        body: { surah, ayah, reference, transcription }
 *   POST {BASE}/transcriptions               -> { id, status }
 *        body: { surah, ayah, transcription, accuracy }
 */

(function () {
  const cfg = () => window.APP_CONFIG;

  /** fetch() with a timeout via AbortController. */
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg().REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(cfg().API_BASE_URL + path, {
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        signal: controller.signal,
        ...options
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const localSurahs = () => window.QURAN_DATA.surahs;

  const Api = {
    /** Tracks where the last successful data came from, for the UI badge. */
    lastSource: "unknown",

    async getSurahs() {
      if (cfg().USE_BACKEND) {
        try {
          const data = await request("/surahs");
          this.lastSource = "backend";
          return data;
        } catch (e) {
          console.warn("[api] getSurahs backend failed, using local data:", e.message);
        }
      }
      this.lastSource = "local";
      return localSurahs().map(({ number, name, englishName, revelationType }) =>
        ({ number, name, englishName, revelationType }));
    },

    async getAyahs(surahNumber) {
      if (cfg().USE_BACKEND) {
        try {
          const data = await request(`/surahs/${surahNumber}/ayahs`);
          this.lastSource = "backend";
          return data;
        } catch (e) {
          console.warn("[api] getAyahs backend failed, using local data:", e.message);
        }
      }
      this.lastSource = "local";
      const surah = localSurahs().find(s => s.number === Number(surahNumber));
      return surah ? surah.ayahs : [];
    },

    /**
     * Verify a transcription. Prefers the backend's verifier; on failure
     * falls back to the local Levenshtein engine. Always resolves to the
     * same normalized shape.
     */
    async verify({ surah, ayah, reference, transcription }) {
      if (cfg().USE_BACKEND) {
        try {
          const data = await request("/verify", {
            method: "POST",
            body: JSON.stringify({ surah, ayah, reference, transcription })
          });
          this.lastSource = "backend";
          // Trust backend accuracy/ops if provided; otherwise compute locally.
          if (typeof data.accuracy === "number" && Array.isArray(data.ops)) {
            return { ...data, source: "backend" };
          }
        } catch (e) {
          console.warn("[api] verify backend failed, using local engine:", e.message);
        }
      }
      this.lastSource = "local";
      return { ...window.Verify.verifyLocal(reference, transcription), source: "local" };
    },

    /** Submit a verified transcription for storage/review by the backend. */
    async saveTranscription(payload) {
      if (!cfg().USE_BACKEND) {
        return { id: "local-" + Date.now(), status: "stored_locally" };
      }
      try {
        const data = await request("/transcriptions", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        this.lastSource = "backend";
        return data;
      } catch (e) {
        console.warn("[api] saveTranscription failed:", e.message);
        return { id: "local-" + Date.now(), status: "stored_locally", error: e.message };
      }
    },

    /** Lightweight health check for the Settings panel. */
    async ping() {
      try {
        await request("/surahs");
        return true;
      } catch {
        return false;
      }
    }
  };

  window.Api = Api;
})();
