
/* ═══════ 계산 코어 (브라우저/Node 공용) ═══════ */
(function (global) {
  'use strict';
  var LABELS = ['A', 'B', 'C', 'D', 'E', '미도달'];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  /* Angoff 예측 분할점수: cut_k = Σ(배점합 × 예상정답률_k / 100)
     행 전체에서 k열 정답률이 하나도 없으면 해당 경계 없음(null) */
  function angoffCuts(rows, nCuts) {
    var G = nCuts || 5;
    var cuts = [];
    for (var k = 0; k < G; k++) {
      var sum = 0, any = false;
      rows.forEach(function (r) {
        var p = num(r.points), rate = num(r.rates && r.rates[k]);
        if (p === null || rate === null) return;
        sum += p * rate / 100;
        any = true;
      });
      cuts.push(any ? sum : null);
    }
    return cuts;
  }

  /* 사용 분할점수: 실제 행에 값이 하나라도 있으면 실제 우선(빈 칸 = 해당 등급 없음),
     전부 비어 있으면 예측 사용 */
  function usedCuts(predicted, actual) {
    var anyActual = (actual || []).some(function (v) { return num(v) !== null; });
    var src = anyActual ? actual : (predicted || []);
    return (src || []).map(function (v) { return num(v); });
  }

  /* 누적 분할점수: 사용 분할점수가 있는(하나 이상 non-null) 요소들의 비율 가중평균.
     특정 경계는 참여 요소 전부가 값을 가질 때만 산출(아니면 해당 등급 없음) */
  function cumulativeCuts(comps) {
    var G = 0;
    comps.forEach(function (c) { G = Math.max(G, (c.cuts || []).length); });
    if (!G) G = 5;
    var active = comps.filter(function (c) {
      return c.ratio > 0 && (c.cuts || []).some(function (v) { return num(v) !== null; });
    });
    var totalR = 0;
    active.forEach(function (c) { totalR += c.ratio; });
    var cuts = [];
    for (var k = 0; k < G; k++) {
      if (!active.length || totalR <= 0) { cuts.push(null); continue; }
      var ok = true, sum = 0;
      active.forEach(function (c) {
        var v = num(c.cuts[k]);
        if (v === null) ok = false;
        else sum += v * c.ratio;
      });
      cuts.push(ok ? sum / totalR : null);
    }
    return { cuts: cuts, parts: active.map(function (c) { return c.id || c.name; }), totalRatio: totalR };
  }

  /* 등급 판정: 위 경계부터 비교, 마지막 유효 경계 아래는 그다음 등급 */
  function gradeOf(score, cuts) {
    var lastIdx = -1;
    for (var k = 0; k < cuts.length; k++) if (num(cuts[k]) !== null) lastIdx = k;
    if (lastIdx < 0) return null;
    for (var k = 0; k <= lastIdx; k++) {
      var c = num(cuts[k]);
      if (c !== null && score >= c - 1e-9) return LABELS[k];
    }
    return LABELS[lastIdx + 1];
  }
  function gradeSystem(cuts) {
    var lastIdx = -1;
    for (var k = 0; k < cuts.length; k++) if (num(cuts[k]) !== null) lastIdx = k;
    return lastIdx < 0 ? [] : LABELS.slice(0, lastIdx + 2);
  }

  /* 학기말 예측 점수: 가중합을 소수 첫째 자리에서 반올림한 정수 (v6 규정).
     comps: [{ratio, kind, fallback}], scores: 요소별 점수(null 가능)
     - 수행(kind perf) 점수 없음 → fallback 사용
     - 지필(kind exam) 점수 없음 → 입력된 요소만으로 비율 재정규화 */
  function finalScore(scores, comps) {
    var sum = 0, usedR = 0, any = false;
    comps.forEach(function (c, i) {
      var v = num(scores[i]);
      if (v === null && c.kind === 'perf') v = num(c.fallback);
      if (v === null) return;
      sum += v * c.ratio;
      usedR += c.ratio;
      if (c.kind === 'exam' && num(scores[i]) !== null) any = true;
    });
    if (!any || usedR <= 0) return null;
    // 비율 합 100 기준 sum/100과 동일하고, 요소 결측 시에는 입력분만으로 재정규화됨
    return Math.round(sum / usedR);
  }

  function distribution(scores, cuts) {
    var sys = gradeSystem(cuts);
    var counts = {};
    LABELS.forEach(function (L) { counts[L] = 0; });
    var n = 0;
    scores.forEach(function (s) {
      if (num(s) === null) return;
      var g = gradeOf(num(s), cuts);
      if (g) { counts[g]++; n++; }
    });
    return { counts: counts, n: n, system: sys };
  }

  function stats(scores) {
    var xs = scores.map(num).filter(function (v) { return v !== null; });
    if (!xs.length) return { n: 0, avg: null, max: null, min: null };
    var sum = 0; xs.forEach(function (v) { sum += v; });
    return { n: xs.length, avg: sum / xs.length,
             max: Math.max.apply(null, xs), min: Math.min.apply(null, xs) };
  }

  var api = { LABELS: LABELS, angoffCuts: angoffCuts, usedCuts: usedCuts,
              cumulativeCuts: cumulativeCuts, gradeOf: gradeOf, gradeSystem: gradeSystem,
              finalScore: finalScore, distribution: distribution, stats: stats, num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CutCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
