/**
 * verify.js — Arabic-aware transcription verification.
 *
 * Provides a local verification engine used when the backend is
 * unavailable, and the normalization helpers the UI uses to render a
 * word-by-word comparison between the reference verse and the user's
 * transcription.
 *
 * The algorithm is a classic word-level Levenshtein alignment that
 * classifies each token as: match | substitution | deletion | insertion.
 * Accuracy is reported as Word Accuracy = (matches / referenceWords) * 100.
 */

(function () {
  // Arabic diacritics (harakat, tanwin, shadda, sukun, madda, etc.)
  const DIACRITICS = /[ً-ٰٟۖ-ۭ࣓-ࣣ࣡-ࣿ]/g;
  const TATWEEL = /ـ/g;

  /** Strip diacritics/tatweel and normalize letter variants for fair comparison. */
  function normalizeWord(word) {
    return word
      .replace(DIACRITICS, "")
      .replace(TATWEEL, "")
      .replace(/[إأآا]/g, "ا")   // alef variants → bare alef
      .replace(/ى/g, "ي")        // alef maqsura → ya
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")        // ta marbuta → ha
      .replace(/[^ء-ي0-9]/g, "") // keep Arabic letters + digits
      .trim();
  }

  /** Split a verse/transcription into comparable tokens. */
  function tokenize(text) {
    return (text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  /**
   * Word-level Levenshtein alignment producing an operation list.
   * Returns { ops, matches, substitutions, deletions, insertions }.
   * ops entries: { type, ref, hyp } where ref/hyp may be null.
   */
  function align(refTokens, hypTokens) {
    const refN = refTokens.map(normalizeWord);
    const hypN = hypTokens.map(normalizeWord);
    const n = refN.length;
    const m = hypN.length;

    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = refN[i - 1] === hypN[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,        // deletion (missing in hypothesis)
          dp[i][j - 1] + 1,        // insertion (extra in hypothesis)
          dp[i - 1][j - 1] + cost  // match/substitution
        );
      }
    }

    // Backtrack.
    const ops = [];
    let i = n, j = m;
    let matches = 0, substitutions = 0, deletions = 0, insertions = 0;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && refN[i - 1] === hypN[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
        ops.push({ type: "match", ref: refTokens[i - 1], hyp: hypTokens[j - 1] });
        matches++; i--; j--;
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
        ops.push({ type: "substitution", ref: refTokens[i - 1], hyp: hypTokens[j - 1] });
        substitutions++; i--; j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        ops.push({ type: "deletion", ref: refTokens[i - 1], hyp: null });
        deletions++; i--;
      } else {
        ops.push({ type: "insertion", ref: null, hyp: hypTokens[j - 1] });
        insertions++; j--;
      }
    }

    ops.reverse();
    return { ops, matches, substitutions, deletions, insertions };
  }

  /**
   * Verify a transcription against a reference verse.
   * @returns {{accuracy:number, passed:boolean, ops:Array, stats:Object}}
   */
  function verifyLocal(referenceText, transcriptionText) {
    const refTokens = tokenize(referenceText);
    const hypTokens = tokenize(transcriptionText);
    const { ops, matches, substitutions, deletions, insertions } = align(refTokens, hypTokens);

    const refCount = refTokens.length || 1;
    const accuracy = Math.max(0, Math.round((matches / refCount) * 100));
    const passed = accuracy >= (window.APP_CONFIG?.PASS_THRESHOLD ?? 90);

    return {
      accuracy,
      passed,
      ops,
      stats: {
        referenceWords: refTokens.length,
        transcriptionWords: hypTokens.length,
        matches,
        substitutions,
        deletions,
        insertions,
        errors: substitutions + deletions + insertions
      }
    };
  }

  window.Verify = { normalizeWord, tokenize, align, verifyLocal };
})();
