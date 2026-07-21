/**
 * stats.js — Local history & statistics for saved transcriptions.
 *
 * Persists a lightweight record for every saved transcription in
 * localStorage and computes aggregate metrics for the dashboard. Audio is
 * NOT stored here (blobs don't belong in localStorage) — only a flag noting
 * whether a recording was attached at save time.
 */

(function () {
  "use strict";

  const KEY = "qv.history";
  const MAX = 200; // cap history size

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }
  function persist(list) {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  }

  const Stats = {
    /** Append one entry. */
    add(entry) {
      const list = load();
      list.push({
        id: "e" + Date.now(),
        ts: Date.now(),
        surah: entry.surah ?? null,
        surahName: entry.surahName || "",
        ayah: entry.ayah ?? null,
        accuracy: Number(entry.accuracy) || 0,
        passed: Boolean(entry.passed),
        hasAudio: Boolean(entry.hasAudio),
        transcription: (entry.transcription || "").slice(0, 400)
      });
      persist(list);
      return list.length;
    },

    all() { return load(); },

    clear() { localStorage.removeItem(KEY); },

    /** Pretty-printed JSON of the full history. */
    toJSON() {
      return JSON.stringify(load(), null, 2);
    },

    /** RFC-4180-ish CSV with a UTF-8 BOM so Excel renders Arabic correctly. */
    toCSV() {
      const rows = load();
      const cols = ["id", "ts", "datetime", "surah", "surahName", "ayah", "accuracy", "passed", "hasAudio", "transcription"];
      const esc = (v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [cols.join(",")];
      for (const e of rows) {
        const dt = new Date(e.ts).toISOString();
        lines.push([e.id, e.ts, dt, e.surah, e.surahName, e.ayah, e.accuracy, e.passed, e.hasAudio, e.transcription]
          .map(esc).join(","));
      }
      return "﻿" + lines.join("\r\n");
    },

    /** Aggregate metrics for the dashboard. */
    summary() {
      const list = load();
      const n = list.length;
      if (!n) {
        return { total: 0, avgAccuracy: 0, passRate: 0, withAudio: 0, bySurah: [] };
      }
      const sumAcc = list.reduce((a, e) => a + e.accuracy, 0);
      const passed = list.filter((e) => e.passed).length;
      const withAudio = list.filter((e) => e.hasAudio).length;

      const map = new Map();
      for (const e of list) {
        const key = e.surah ?? "—";
        const g = map.get(key) || { surah: e.surah, name: e.surahName, count: 0, sumAcc: 0 };
        g.count++; g.sumAcc += e.accuracy;
        if (!g.name && e.surahName) g.name = e.surahName;
        map.set(key, g);
      }
      const bySurah = [...map.values()]
        .map((g) => ({ surah: g.surah, name: g.name, count: g.count, avg: Math.round(g.sumAcc / g.count) }))
        .sort((a, b) => b.count - a.count);

      return {
        total: n,
        avgAccuracy: Math.round(sumAcc / n),
        passRate: Math.round((passed / n) * 100),
        withAudio,
        bySurah
      };
    }
  };

  window.Stats = Stats;
})();
