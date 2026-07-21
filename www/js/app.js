/**
 * app.js — UI controller for QuranVerse Transcription.
 * Wires the DOM to the API layer (api.js) and verification engine (verify.js).
 */

(function () {
  "use strict";

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const els = {
    surahSelect: $("surahSelect"),
    ayahSearch: $("ayahSearch"),
    ayahList: $("ayahList"),
    referenceVerse: $("referenceVerse"),
    ayahMeta: $("ayahMeta"),
    transcriptionInput: $("transcriptionInput"),
    recordBtn: $("recordBtn"),
    recordLabel: $("recordLabel"),
    recDot: $("recDot"),
    recStatus: $("recStatus"),
    verifyBtn: $("verifyBtn"),
    clearBtn: $("clearBtn"),
    saveBtn: $("saveBtn"),
    loadRefBtn: $("loadRefBtn"),
    resultCard: $("resultCard"),
    resultStatus: $("resultStatus"),
    accuracyValue: $("accuracyValue"),
    matchValue: $("matchValue"),
    subValue: $("subValue"),
    delValue: $("delValue"),
    insValue: $("insValue"),
    accuracyFill: $("accuracyFill"),
    diffView: $("diffView"),
    sourceBadge: $("sourceBadge"),
    // audio
    audioBox: $("audioBox"),
    audioPlayer: $("audioPlayer"),
    audioDownload: $("audioDownload"),
    audioMeta: $("audioMeta"),
    // stats
    statsBtn: $("statsBtn"),
    statsOverlay: $("statsOverlay"),
    closeStatsBtn: $("closeStatsBtn"),
    clearStatsBtn: $("clearStatsBtn"),
    exportCsvBtn: $("exportCsvBtn"),
    exportJsonBtn: $("exportJsonBtn"),
    stChart: $("stChart"),
    stTotal: $("stTotal"),
    stAvg: $("stAvg"),
    stPass: $("stPass"),
    stAudio: $("stAudio"),
    stBySurah: $("stBySurah"),
    stRecent: $("stRecent"),
    // settings
    settingsBtn: $("settingsBtn"),
    settingsOverlay: $("settingsOverlay"),
    closeSettingsBtn: $("closeSettingsBtn"),
    apiUrlInput: $("apiUrlInput"),
    useBackendToggle: $("useBackendToggle"),
    testConnBtn: $("testConnBtn"),
    connStatus: $("connStatus"),
    saveSettingsBtn: $("saveSettingsBtn"),
    toast: $("toast")
  };

  // ---- State ----
  const state = {
    surahs: [],
    ayahs: [],
    currentSurah: null,
    currentAyah: null,
    lastResult: null,
    speechBase: "",       // textarea content captured when recording starts
    interimEl: null,      // live interim-dictation preview element
    audio: null           // last recording { wavBlob, url, durationSec }
  };

  // ---- Helpers ----
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("is-hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add("is-hidden"), 2600);
  }

  function updateSourceBadge() {
    const src = window.Api.lastSource;
    const map = { backend: "من الباك-إند", local: "بيانات محلية", unknown: "—" };
    els.sourceBadge.textContent = map[src] || "—";
    els.sourceBadge.className = "badge " + (src === "backend" ? "badge-pass" : "badge-muted");
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---- Data loading ----
  async function loadSurahs() {
    state.surahs = await window.Api.getSurahs();
    els.surahSelect.innerHTML = state.surahs.map((s) =>
      `<option value="${s.number}">${s.number} · ${escapeHtml(s.name)} (${escapeHtml(s.englishName || "")})</option>`
    ).join("");
    updateSourceBadge();
    if (state.surahs.length) {
      els.surahSelect.value = state.surahs[0].number;
      await loadAyahs(state.surahs[0].number);
    }
  }

  async function loadAyahs(surahNumber) {
    state.currentSurah = state.surahs.find((s) => s.number === Number(surahNumber)) || null;
    state.ayahs = await window.Api.getAyahs(surahNumber);
    updateSourceBadge();
    renderAyahList();
    if (state.ayahs.length) selectAyah(state.ayahs[0]);
  }

  function renderAyahList() {
    const q = window.Verify.normalizeWord(els.ayahSearch.value || "");
    const filtered = q
      ? state.ayahs.filter((a) => window.Verify.tokenize(a.text)
          .some((w) => window.Verify.normalizeWord(w).includes(q)))
      : state.ayahs;

    if (!filtered.length) {
      els.ayahList.innerHTML = `<li style="cursor:default;color:var(--text-muted)">لا نتائج</li>`;
      return;
    }

    els.ayahList.innerHTML = filtered.map((a) => `
      <li data-ayah="${a.number}" role="option"
          class="${state.currentAyah && state.currentAyah.number === a.number ? "active" : ""}">
        <span class="ayah-num">${a.number}</span>
        <span class="ayah-snippet">${escapeHtml(a.text)}</span>
      </li>`).join("");

    els.ayahList.querySelectorAll("li[data-ayah]").forEach((li) => {
      li.addEventListener("click", () => {
        const ayah = state.ayahs.find((a) => a.number === Number(li.dataset.ayah));
        if (ayah) selectAyah(ayah);
      });
    });
  }

  function selectAyah(ayah) {
    state.currentAyah = ayah;
    els.referenceVerse.textContent = ayah.text;
    const sName = state.currentSurah ? state.currentSurah.name : "";
    els.ayahMeta.textContent = `${sName} · آية ${ayah.number}`;
    els.ayahMeta.className = "badge badge-muted";
    // reset result + selection highlight
    els.resultCard.classList.add("is-hidden");
    els.saveBtn.disabled = true;
    state.lastResult = null;
    showAudio(null);
    renderAyahList();
  }

  // ---- Verification ----
  async function runVerify() {
    if (!state.currentAyah) { toast("اختر آية أولاً"); return; }
    const transcription = els.transcriptionInput.value.trim();
    if (!transcription) { toast("اكتب نص النسخ أولاً"); return; }

    els.verifyBtn.disabled = true;
    els.verifyBtn.textContent = "جارٍ التحقق…";
    try {
      const result = await window.Api.verify({
        surah: state.currentSurah ? state.currentSurah.number : null,
        ayah: state.currentAyah.number,
        reference: state.currentAyah.text,
        transcription
      });
      state.lastResult = result;
      renderResult(result);
      updateSourceBadge();
      els.saveBtn.disabled = false;
    } catch (e) {
      console.error(e);
      toast("تعذّر إجراء التحقق");
    } finally {
      els.verifyBtn.disabled = false;
      els.verifyBtn.textContent = "تحقّق من النسخ";
    }
  }

  function renderResult(r) {
    els.resultCard.classList.remove("is-hidden");
    els.accuracyValue.textContent = r.accuracy + "%";
    els.matchValue.textContent = r.stats.matches;
    els.subValue.textContent = r.stats.substitutions;
    els.delValue.textContent = r.stats.deletions;
    els.insValue.textContent = r.stats.insertions;
    els.accuracyFill.style.width = r.accuracy + "%";

    els.resultStatus.textContent = r.passed ? "مقبول ✓" : "يحتاج مراجعة";
    els.resultStatus.className = "badge " + (r.passed ? "badge-pass" : "badge-fail");

    // Word-by-word diff
    const cls = { match: "tok-match", substitution: "tok-sub", deletion: "tok-del", insertion: "tok-ins" };
    els.diffView.innerHTML = r.ops.map((op) => {
      const word = op.type === "insertion" ? op.hyp : op.ref;
      const title = op.type === "substitution"
        ? `المتوقع: ${escapeHtml(op.ref)} — المُدخل: ${escapeHtml(op.hyp)}`
        : op.type;
      return `<span class="tok ${cls[op.type]}" title="${title}">${escapeHtml(word)}</span>`;
    }).join(" ");

    els.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function saveTranscription() {
    if (!state.lastResult || !state.currentAyah) return;
    els.saveBtn.disabled = true;
    const hasAudio = Boolean(state.audio);
    const res = await window.Api.saveTranscription({
      surah: state.currentSurah ? state.currentSurah.number : null,
      ayah: state.currentAyah.number,
      transcription: els.transcriptionInput.value.trim(),
      accuracy: state.lastResult.accuracy,
      hasAudio
    });

    // Record in the local statistics history.
    window.Stats.add({
      surah: state.currentSurah ? state.currentSurah.number : null,
      surahName: state.currentSurah ? state.currentSurah.name : "",
      ayah: state.currentAyah.number,
      accuracy: state.lastResult.accuracy,
      passed: state.lastResult.passed,
      hasAudio,
      transcription: els.transcriptionInput.value.trim()
    });

    updateSourceBadge();
    toast(res.status === "stored_locally" ? "حُفظ محلياً (لا يوجد باك-إند)" : "تم الحفظ بنجاح ✓");
  }

  // ---- Speech-to-text (dictation) ----
  const SPEECH_ERRORS = {
    "not-allowed": "تم رفض إذن الميكروفون",
    "service-not-allowed": "خدمة التعرّف غير متاحة",
    "no-speech": "لم يُلتقط صوت — حاول مجدداً",
    "audio-capture": "لا يوجد ميكروفون متاح",
    "network": "تعذّر الاتصال بخدمة التعرّف",
    "unsupported": "المتصفح لا يدعم التعرّف على الكلام"
  };

  function setInterim(text) {
    if (!state.interimEl) return;
    state.interimEl.textContent = text || "";
    state.interimEl.classList.toggle("is-hidden", !text);
  }

  function initSpeech() {
    // Interim preview lives just under the mic row.
    const preview = document.createElement("div");
    preview.className = "interim-preview is-hidden quran-text";
    preview.setAttribute("aria-live", "polite");
    els.recordBtn.closest(".card").querySelector(".mic-row").after(preview);
    state.interimEl = preview;

    if (!window.Speech || !window.Speech.isSupported()) {
      els.recordBtn.disabled = true;
      els.recStatus.textContent = "التسجيل الصوتي غير مدعوم في هذا المتصفح";
      els.recStatus.classList.add("error");
      return;
    }
  }

  function formatDuration(sec) {
    const s = Math.round(sec || 0);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  function showAudio(audio) {
    // Release a previous object URL to avoid leaks.
    if (state.audio && state.audio.url) URL.revokeObjectURL(state.audio.url);
    state.audio = audio;
    if (!audio) { els.audioBox.classList.add("is-hidden"); return; }
    els.audioPlayer.src = audio.url;
    els.audioDownload.href = audio.url;
    const s = state.currentSurah ? state.currentSurah.number : "x";
    const a = state.currentAyah ? state.currentAyah.number : "x";
    els.audioDownload.download = `quranverse_${s}_${a}.wav`;
    els.audioMeta.textContent = `المدة ${formatDuration(audio.durationSec)}`;
    els.audioBox.classList.remove("is-hidden");
  }

  function onRecordState(active) {
    els.recordBtn.classList.toggle("recording", active);
    els.recordBtn.setAttribute("aria-pressed", String(active));
    els.recordLabel.textContent = active ? "إيقاف التسجيل" : "تسجيل صوتي";
    els.recDot.classList.toggle("is-hidden", !active);
    els.recStatus.classList.remove("error");
    els.recStatus.textContent = active ? "جارٍ الاستماع…" : "";
    if (!active) setInterim("");
  }

  async function toggleRecording() {
    if (!window.Speech || !window.Speech.isSupported()) return;

    // ---- Stop ----
    if (window.Speech.isActive()) {
      window.Speech.stop();
      if (window.Recorder && window.Recorder.isActive()) {
        els.recStatus.textContent = "جارٍ معالجة التسجيل…";
        try {
          const audio = await window.Recorder.stop();
          showAudio(audio);
          els.recStatus.textContent = audio ? "تم حفظ التسجيل الصوتي ✓" : "";
        } catch (e) {
          els.recStatus.textContent = "تعذّر حفظ الصوت";
          els.recStatus.classList.add("error");
        }
      }
      return;
    }

    // ---- Start ----
    // Capture existing text so dictation appends rather than overwrites.
    state.speechBase = els.transcriptionInput.value.trim();

    // Start audio capture (best-effort — dictation still works without it).
    if (window.Recorder && window.Recorder.isSupported()) {
      try { await window.Recorder.start(); }
      catch (e) { console.warn("[recorder] start failed:", e.message); }
    }

    window.Speech.start({
      onState: onRecordState,
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        state.speechBase = (state.speechBase ? state.speechBase + " " : "") + text;
        els.transcriptionInput.value = state.speechBase;
        setInterim("");
      },
      onError: (err) => {
        els.recStatus.textContent = SPEECH_ERRORS[err] || ("خطأ: " + err);
        els.recStatus.classList.add("error");
        setInterim("");
        if (window.Recorder && window.Recorder.isActive()) window.Recorder.cancel();
      }
    });
  }

  // ---- Statistics dashboard ----
  function escapeHtmlStat(s) { return escapeHtml(s); }

  /** Render an inline SVG line chart of accuracy over saved entries. */
  function renderChart(entries) {
    if (!entries.length) {
      els.stChart.innerHTML = `<div class="stats-empty">احفظ نسختين أو أكثر لعرض المنحنى.</div>`;
      return;
    }

    const W = 640, H = 180, padX = 34, padY = 18;
    const innerW = W - padX * 2, innerH = H - padY * 2;
    const n = entries.length;
    const threshold = window.APP_CONFIG?.PASS_THRESHOLD ?? 90;

    // X positions (evenly spaced; single point centered).
    const xOf = (i) => n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW;
    const yOf = (acc) => padY + (1 - acc / 100) * innerH;

    // Horizontal gridlines + labels at 0/50/100.
    const grid = [0, 50, 100].map((v) => {
      const y = yOf(v);
      return `<line class="chart-grid" x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}"/>` +
             `<text class="chart-label" x="${padX - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
    }).join("");

    const thY = yOf(threshold);
    const thresholdLine =
      `<line class="chart-threshold" x1="${padX}" y1="${thY}" x2="${W - padX}" y2="${thY}"/>` +
      `<text class="chart-label" x="${W - padX}" y="${thY - 5}" text-anchor="end">حد القبول ${threshold}%</text>`;

    const pts = entries.map((e, i) => [xOf(i), yOf(e.accuracy)]);
    const linePath = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const areaPath = `${linePath} L ${pts[n - 1][0].toFixed(1)} ${yOf(0)} L ${pts[0][0].toFixed(1)} ${yOf(0)} Z`;

    const dots = entries.map((e, i) =>
      `<circle class="chart-dot ${e.passed ? "" : "fail"}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="4">` +
      `<title>${e.accuracy}% — ${escapeHtmlStat(e.surahName || "")} آية ${e.ayah ?? "—"}</title></circle>`
    ).join("");

    els.stChart.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="منحنى الدقة عبر الزمن" preserveAspectRatio="xMidYMid meet">
        ${grid}
        ${n > 1 ? `<path class="chart-area" d="${areaPath}"/>` : ""}
        ${n > 1 ? `<path class="chart-line" d="${linePath}"/>` : ""}
        ${thresholdLine}
        ${dots}
      </svg>`;
  }

  /** Trigger a client-side file download from a string. */
  function downloadFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!window.Stats.all().length) { toast("لا يوجد سجل للتصدير"); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`quranverse_history_${stamp}.csv`, window.Stats.toCSV(), "text/csv;charset=utf-8");
  }
  function exportJson() {
    if (!window.Stats.all().length) { toast("لا يوجد سجل للتصدير"); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`quranverse_history_${stamp}.json`, window.Stats.toJSON(), "application/json");
  }

  function renderStats() {
    const sum = window.Stats.summary();
    els.stTotal.textContent = sum.total;
    els.stAvg.textContent = sum.avgAccuracy + "%";
    els.stPass.textContent = sum.passRate + "%";
    els.stAudio.textContent = sum.withAudio;

    // Accuracy-over-time chart (chronological, capped to last 40 points).
    renderChart(window.Stats.all().slice(-40));

    // Per-surah breakdown.
    if (!sum.bySurah.length) {
      els.stBySurah.innerHTML = `<div class="stats-empty">لا توجد بيانات بعد.</div>`;
    } else {
      els.stBySurah.innerHTML = sum.bySurah.map((g) => `
        <div class="stats-row">
          <span class="sr-name">${escapeHtmlStat(g.name || ("سورة " + (g.surah ?? "—")))}</span>
          <span class="sr-count">${g.count} نسخة</span>
          <span class="sr-avg">${g.avg}%</span>
        </div>`).join("");
    }

    // Recent entries (newest first, up to 12).
    const recent = window.Stats.all().slice(-12).reverse();
    if (!recent.length) {
      els.stRecent.innerHTML = `<div class="stats-empty">احفظ نسخة لتظهر هنا.</div>`;
    } else {
      els.stRecent.innerHTML = recent.map((e) => {
        const when = new Date(e.ts).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
        const cls = e.passed ? "ri-pass" : "ri-fail";
        return `
          <div class="recent-item">
            <span class="ri-acc ${cls}">${e.accuracy}%</span>
            <span class="ri-verse">${escapeHtmlStat(e.surahName || "")} · آية ${e.ayah ?? "—"}${e.hasAudio ? " 🎤" : ""}</span>
            <span class="ri-when">${escapeHtmlStat(when)}</span>
          </div>`;
      }).join("");
    }
  }

  function openStats() {
    renderStats();
    els.statsOverlay.classList.remove("is-hidden");
  }
  function closeStats() { els.statsOverlay.classList.add("is-hidden"); }
  function clearStats() {
    window.Stats.clear();
    renderStats();
    toast("مُسح السجل");
  }

  // ---- Settings ----
  function openSettings() {
    els.apiUrlInput.value = window.APP_CONFIG.API_BASE_URL;
    els.useBackendToggle.checked = window.APP_CONFIG.USE_BACKEND;
    els.connStatus.textContent = "—";
    els.connStatus.className = "badge badge-muted";
    els.settingsOverlay.classList.remove("is-hidden");
  }
  function closeSettings() { els.settingsOverlay.classList.add("is-hidden"); }

  async function testConnection() {
    // Apply the typed URL temporarily for the test.
    const prev = window.APP_CONFIG.API_BASE_URL;
    window.APP_CONFIG.API_BASE_URL = els.apiUrlInput.value.trim() || prev;
    els.connStatus.textContent = "جارٍ الاختبار…";
    els.connStatus.className = "badge badge-muted";
    const ok = await window.Api.ping();
    els.connStatus.textContent = ok ? "متصل ✓" : "فشل الاتصال";
    els.connStatus.className = "badge " + (ok ? "badge-pass" : "badge-fail");
    window.APP_CONFIG.API_BASE_URL = prev; // restore until saved
  }

  async function saveSettings() {
    window.saveConfig({
      API_BASE_URL: els.apiUrlInput.value.trim() || window.APP_CONFIG.API_BASE_URL,
      USE_BACKEND: els.useBackendToggle.checked
    });
    closeSettings();
    toast("حُفظت الإعدادات — إعادة تحميل البيانات");
    await loadSurahs();
  }

  // ---- Events ----
  function bind() {
    els.surahSelect.addEventListener("change", (e) => loadAyahs(e.target.value));
    els.ayahSearch.addEventListener("input", renderAyahList);
    els.verifyBtn.addEventListener("click", runVerify);
    els.clearBtn.addEventListener("click", () => {
      if (window.Speech && window.Speech.isActive()) window.Speech.stop();
      if (window.Recorder && window.Recorder.isActive()) window.Recorder.cancel();
      els.transcriptionInput.value = "";
      state.speechBase = "";
      setInterim("");
      showAudio(null);
      els.resultCard.classList.add("is-hidden");
      els.saveBtn.disabled = true;
    });
    els.recordBtn.addEventListener("click", toggleRecording);

    els.statsBtn.addEventListener("click", openStats);
    els.closeStatsBtn.addEventListener("click", closeStats);
    els.clearStatsBtn.addEventListener("click", clearStats);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.exportJsonBtn.addEventListener("click", exportJson);
    els.statsOverlay.addEventListener("click", (e) => {
      if (e.target === els.statsOverlay) closeStats();
    });
    els.saveBtn.addEventListener("click", saveTranscription);
    els.loadRefBtn.addEventListener("click", () => {
      if (state.currentAyah) els.transcriptionInput.value = state.currentAyah.text;
    });

    els.settingsBtn.addEventListener("click", openSettings);
    els.closeSettingsBtn.addEventListener("click", closeSettings);
    els.settingsOverlay.addEventListener("click", (e) => {
      if (e.target === els.settingsOverlay) closeSettings();
    });
    els.testConnBtn.addEventListener("click", testConnection);
    els.saveSettingsBtn.addEventListener("click", saveSettings);

    // Ctrl/Cmd + Enter to verify
    els.transcriptionInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runVerify();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeSettings(); closeStats(); }
    });
  }

  // ---- Init ----
  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    initSpeech();
    await loadSurahs();
  });
})();
