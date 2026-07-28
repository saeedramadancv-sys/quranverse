/**
 * recite.js — plays the reference recitation for the selected ayah.
 *
 * Audio is streamed from a public per-ayah CDN whose URLs are derived directly
 * from the surah and ayah numbers (zero-padded to 3 digits), so no extra API
 * lookup is needed:
 *
 *   https://everyayah.com/data/<reciter>/<SSS><AAA>.mp3
 *   e.g. Al-Fatiha 1  ->  .../001001.mp3
 *
 * This is the only part of the app that requires a network connection; every
 * failure path degrades to a message rather than a broken control.
 */
(function () {
  "use strict";

  const pad3 = (n) => String(n).padStart(3, "0");

  const Recite = {
    _audio: null,
    _token: 0,          // guards against a slow load resolving after the user moved on
    onState: null,      // (state, detail) => void   state: idle|loading|playing|error

    /** Absolute URL of the recitation for a given ayah, or null if unknown. */
    urlFor(surahNumber, ayahNumber) {
      if (!surahNumber || !ayahNumber) return null;
      const cfg = window.APP_CONFIG || {};
      const base = cfg.RECITATION_BASE_URL || "https://everyayah.com/data";
      const reciter = cfg.RECITER || "Alafasy_128kbps";
      return `${base}/${reciter}/${pad3(surahNumber)}${pad3(ayahNumber)}.mp3`;
    },

    isPlaying() {
      return Boolean(this._audio && !this._audio.paused && !this._audio.ended);
    },

    _emit(state, detail) {
      if (typeof this.onState === "function") this.onState(state, detail);
    },

    /** Stop playback and release the element. Safe to call at any time. */
    stop() {
      this._token++;                       // invalidate any in-flight load
      if (this._audio) {
        try { this._audio.pause(); } catch (_) {}
        this._audio.src = "";
        this._audio = null;
      }
      this._emit("idle");
    },

    /** Toggle playback for an ayah. Returns a promise that settles once started. */
    async toggle(surahNumber, ayahNumber) {
      if (this.isPlaying()) { this.stop(); return; }
      return this.play(surahNumber, ayahNumber);
    },

    async play(surahNumber, ayahNumber) {
      const url = this.urlFor(surahNumber, ayahNumber);
      if (!url) { this._emit("error", "اختر آية أولاً"); return; }

      this.stop();
      const token = ++this._token;

      const audio = new Audio();
      audio.preload = "auto";
      audio.src = url;
      this._audio = audio;

      audio.addEventListener("ended", () => {
        if (token === this._token) this.stop();
      });
      // A failed load rejects play() as well, so retire the token after the
      // first report to keep it to a single message for the user.
      const fail = (msg) => {
        if (token !== this._token) return;
        this._token++;
        this._audio = null;
        this._emit("error", msg);
      };

      audio.addEventListener("error", () =>
        fail("تعذّر تحميل التلاوة — تأكّد من الاتصال بالإنترنت"));

      this._emit("loading");
      try {
        await audio.play();
        if (token !== this._token) return;   // superseded while loading
        this._emit("playing");
      } catch (e) {
        // Autoplay policies reject play() until the user has interacted; the
        // button click satisfies that, so a rejection here means a real failure.
        fail("تعذّر تشغيل التلاوة — تأكّد من الاتصال بالإنترنت");
      }
    }
  };

  window.Recite = Recite;
})();
