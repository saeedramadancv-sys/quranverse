/**
 * recorder.js — Microphone audio capture with WAV export.
 *
 * Runs alongside the speech recognizer (speech.js): while the user dictates,
 * this captures the raw audio and, on stop, produces a 16-bit PCM WAV Blob
 * (mono) suitable for playback and download. Uses MediaRecorder to capture
 * and the Web Audio API to decode + re-encode to WAV.
 */

(function () {
  "use strict";

  const Recorder = {
    _mr: null,
    _stream: null,
    _chunks: [],
    _active: false,

    isSupported() {
      return Boolean(navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    },

    isActive() {
      return this._active;
    },

    /** Request mic and begin capturing. Rejects if permission denied. */
    async start() {
      if (!this.isSupported()) throw new Error("unsupported");
      if (this._active) return;
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._chunks = [];
      this._mr = new MediaRecorder(this._stream);
      this._mr.ondataavailable = (e) => { if (e.data.size) this._chunks.push(e.data); };
      this._mr.start();
      this._active = true;
    },

    /**
     * Stop capture and resolve with { wavBlob, url, durationSec }.
     * Returns null if nothing was recorded.
     */
    async stop() {
      if (!this._active || !this._mr) return null;
      const mr = this._mr;

      const raw = await new Promise((resolve) => {
        mr.onstop = () => resolve(new Blob(this._chunks, { type: this._chunks[0]?.type || "audio/webm" }));
        mr.stop();
      });

      // Release the mic.
      this._stream.getTracks().forEach((t) => t.stop());
      this._active = false;
      this._mr = null;
      this._stream = null;

      if (!raw.size) return null;

      const wavBlob = await this._toWav(raw);
      const durationSec = await this._durationOf(wavBlob);
      return { wavBlob, url: URL.createObjectURL(wavBlob), durationSec };
    },

    /** Abort without producing a file (e.g. on error). */
    cancel() {
      try { this._mr && this._mr.stop(); } catch (_) {}
      try { this._stream && this._stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      this._active = false;
      this._mr = null;
      this._stream = null;
      this._chunks = [];
    },

    // ---- internal: decode compressed audio → mono PCM → WAV ----
    async _toWav(blob) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      try {
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        return this._encodeWav(buf);
      } finally {
        ctx.close();
      }
    },

    _encodeWav(audioBuffer) {
      const sampleRate = audioBuffer.sampleRate;
      const numCh = audioBuffer.numberOfChannels;

      // Downmix to mono.
      const len = audioBuffer.length;
      const mono = new Float32Array(len);
      for (let c = 0; c < numCh; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i++) mono[i] += data[i] / numCh;
      }

      const bytesPerSample = 2;
      const blockAlign = bytesPerSample; // mono
      const dataSize = len * bytesPerSample;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };

      writeStr(0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);          // fmt chunk size
      view.setUint16(20, 1, true);           // PCM
      view.setUint16(22, 1, true);           // mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * blockAlign, true); // byte rate
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);          // bits per sample
      writeStr(36, "data");
      view.setUint32(40, dataSize, true);

      // PCM samples.
      let offset = 44;
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, mono[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
      return new Blob([view], { type: "audio/wav" });
    },

    _durationOf(blob) {
      return new Promise((resolve) => {
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => resolve(isFinite(a.duration) ? a.duration : 0);
        a.onerror = () => resolve(0);
        a.src = URL.createObjectURL(blob);
      });
    }
  };

  window.Recorder = Recorder;
})();
