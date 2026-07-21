/**
 * speech.js — Arabic speech-to-text.
 *
 * Two backends, chosen automatically at runtime:
 *   • Web  — the browser's Web Speech API (Chromium/Edge/Safari). Used when
 *            running the site in a normal browser.
 *   • Native — the @capacitor-community/speech-recognition plugin. Used when
 *            running inside the Capacitor Android app, because the Android
 *            System WebView does NOT implement webkitSpeechRecognition.
 *
 * Both expose the same callback surface to app.js:
 *   Speech.isSupported() -> boolean
 *   Speech.start({ onInterim, onFinal, onState, onError })
 *   Speech.stop()
 *   Speech.toggle(handlers)
 */

(function () {
  "use strict";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Capacitor injects window.Capacitor inside the native app only.
  const Cap = window.Capacitor;
  const isNative = Boolean(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const NativeSR = isNative && Cap.Plugins ? Cap.Plugins.SpeechRecognition : null;

  const Speech = {
    _rec: null,
    _active: false,
    _handlers: {},
    _wantContinue: false,
    // native state
    _partialHandle: null,
    _lastPartial: "",
    lang: "ar-SA",

    isSupported() {
      return Boolean(NativeSR) || Boolean(SR);
    },

    isActive() {
      return this._active;
    },

    start(handlers = {}) {
      if (this._active) return true;
      this._handlers = handlers;
      if (NativeSR) return this._startNative(handlers);
      return this._startWeb(handlers);
    },

    stop() {
      if (NativeSR) { this._stopNative(); return; }
      this._wantContinue = false;
      if (this._rec && this._active) {
        try { this._rec.stop(); } catch (_) { /* ignore */ }
      }
    },

    toggle(handlers) {
      if (this._active) this.stop();
      else this.start(handlers);
    },

    // ---------------- Web Speech API path ----------------
    _startWeb(handlers) {
      if (!SR) {
        handlers.onError && handlers.onError("unsupported");
        return false;
      }
      const rec = new SR();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        let interim = "", final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) final += res[0].transcript + " ";
          else interim += res[0].transcript;
        }
        if (final && this._handlers.onFinal) this._handlers.onFinal(final.trim());
        if (interim && this._handlers.onInterim) this._handlers.onInterim(interim.trim());
      };
      rec.onerror = (event) => {
        this._handlers.onError && this._handlers.onError(event.error);
      };
      rec.onend = () => {
        if (this._active && this._wantContinue) {
          try { rec.start(); return; } catch (_) { /* fall through */ }
        }
        this._active = false;
        this._handlers.onState && this._handlers.onState(false);
      };

      try {
        this._active = true;
        this._wantContinue = true;
        rec.start();
        this._rec = rec;
        handlers.onState && handlers.onState(true);
        return true;
      } catch (e) {
        this._active = false;
        handlers.onError && handlers.onError(e.message || "start-failed");
        return false;
      }
    },

    // ---------------- Native (Capacitor) path ----------------
    async _startNative(handlers) {
      try {
        const avail = await NativeSR.available();
        if (avail && avail.available === false) {
          handlers.onError && handlers.onError("unsupported");
          return false;
        }
      } catch (_) { /* some versions lack available() */ }

      // Ensure microphone / speech permission.
      try {
        const perm = await NativeSR.requestPermissions();
        const granted = perm && (perm.speechRecognition === "granted" || perm.speechRecognition === "prompt");
        if (perm && perm.speechRecognition === "denied") {
          handlers.onError && handlers.onError("not-allowed");
          return false;
        }
        void granted;
      } catch (_) { /* older versions: permission handled inside start() */ }

      this._lastPartial = "";
      this._active = true;
      handlers.onState && handlers.onState(true);

      // Stream partial results to the live preview.
      try {
        this._partialHandle = await NativeSR.addListener("partialResults", (data) => {
          const t = (data && data.matches && data.matches[0]) || "";
          if (t) { this._lastPartial = t; this._handlers.onInterim && this._handlers.onInterim(t); }
        });
      } catch (_) { /* listener optional */ }

      try {
        const res = await NativeSR.start({
          language: this.lang,
          maxResults: 1,
          partialResults: true,
          popup: false
        });
        // On resolve, the recognition session has ended. Some versions return
        // the final matches here.
        if (res && res.matches && res.matches[0]) this._lastPartial = res.matches[0];
      } catch (e) {
        this._handlers.onError && this._handlers.onError((e && e.message) || "start-failed");
      }

      this._finishNative();
      return true;
    },

    async _stopNative() {
      try { await NativeSR.stop(); } catch (_) { /* ignore */ }
      // _finishNative runs when start()'s promise resolves.
    },

    _finishNative() {
      if (this._partialHandle) {
        try { this._partialHandle.remove(); } catch (_) {}
        this._partialHandle = null;
      }
      if (this._lastPartial && this._handlers.onFinal) this._handlers.onFinal(this._lastPartial.trim());
      this._lastPartial = "";
      this._active = false;
      this._handlers.onState && this._handlers.onState(false);
    }
  };

  window.Speech = Speech;
})();
