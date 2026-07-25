/* ===== 대학별 학생부 교과 환산점수 산출 핵심 로직 (브라우저/Node 공용) =====
   대상: 2015 개정 교육과정(현 고3)
     · 공통과목 / 일반선택과목 → 석차등급 + 원점수
     · 진로선택과목            → 성취도 + 원점수 (석차등급 없음)
     · 체육·예술, 교양 등 성취도만 산출되는 과목도 성취도 계열로 취급

   대학마다 산식의 '구조'가 다르므로 규격을 데이터로 기술한다.
     mode 'pooled'  — 반영 과목 전체를 한 덩어리로 학점 가중평균 (예: 한국외대)
     mode 'grouped' — 그룹별로 각각 학점 가중평균한 뒤 그룹 비율로 가중합 (예: 가천대)
   과목 1건의 점수 환산은 각 규격의 convert()가 맡는다.

   단순 평균등급(학점×등급 합 ÷ 총 이수학점)과 대학별 환산점수를 각각 산출하고
   같은 모집단 안에서의 석차·백분위를 비교해 유·불리를 판정한다. */
(function (global) {
  'use strict';

  var C = (global && global.SimCore) ||
          (typeof require === 'function' ? require('./simcore.js') : null);

  /* ═══════════════ 교과영역 판정 ═══════════════
     나이스 생기부 '교과' 열이 최우선. 교과명이 비어 있을 때만 과목명으로 추론한다.
     (교과가 '교양'인 '실용 경제'를 과목명만 보고 사회로 넣는 사고를 막기 위함)
     ※ 순서 주의: '제2외국어'에는 '국어'가, '기술·가정/정보'에는 '정보'가 부분 일치하므로
       반영교과가 아닌 교과를 먼저 걸러낸 뒤 국어·수학·영어를 판정한다. */
  var CAT_RULES = [
    [/한국사/, '사회'],
    [/기술|가정|정보|외국어|한문|교양|보건|전문/, '기타'],
    [/체육|예술|음악|미술/, '체예'],
    [/사회|역사|도덕/, '사회'],
    [/국어/, '국어'],
    [/수학/, '수학'],
    [/영어/, '영어'],
    [/과학/, '과학']
  ];
  /* → {area, guess} guess=true면 교과명으로 확정하지 못하고 과목명으로 추론한 것 */
  function areaOf(category, subject) {
    var c = String(category || '').trim();
    if (c) {
      for (var i = 0; i < CAT_RULES.length; i++) {
        if (CAT_RULES[i][0].test(c)) return { area: CAT_RULES[i][1], guess: false };
      }
      return { area: C.inferArea(subject), guess: true };
    }
    return { area: C.inferArea(subject), guess: true };
  }

  /* ═══════════════ 과목 계열 판정 ═══════════════
     생기부 실제 기재값이 근거다.
       석차등급(1~9) 있음      → general (공통·일반선택)
       성취도 A~E 만 있음      → career  (진로선택·체예·교양 등 성취도 산출 과목)
       P                       → pass    (이수 과목, 산출 제외)
       둘 다 없음              → none */
  function kindOf(rec) {
    if (rec.grade !== null && rec.grade >= 1 && rec.grade <= 9) return 'general';
    if (rec.ach === 'P') return 'pass';
    if (/^[A-E]$/.test(rec.ach || '')) return 'career';
    return 'none';
  }

  /* ═══════════════ 2015 공통과목 ═══════════════
     공통과목을 반영에서 빼는 대학(가천대 등)을 위한 판정. */
  function normSubj(s) {
    return String(s || '').replace(/[\s·]/g, '').replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2');
  }
  var COMMON_2015 = ['국어', '수학', '영어', '통합사회', '통합과학', '한국사'];
  function isCommon(subject, list) {
    var n = normSubj(subject);
    var arr = list || COMMON_2015;
    for (var i = 0; i < arr.length; i++) if (normSubj(arr[i]) === n) return true;
    return false;
  }

  /* ═══════════════ 환산 유틸 ═══════════════ */
  /* [하한(이상), 값] 내림차순 표에서 값 찾기. 어느 구간에도 못 미치면 dflt */
  function fromTable(tbl, v, dflt) {
    if (dflt === undefined) dflt = null;
    if (v === null || v === undefined) return dflt;
    for (var i = 0; i < tbl.length; i++) if (v >= tbl[i][0]) return tbl[i][1];
    return dflt;
  }
  /* [하한, 상한, 값] 구간표에서 값 찾기 (석차등급처럼 낮을수록 좋은 지표용) */
  function fromBands(bands, v) {
    if (v === null || v === undefined) return null;
    for (var i = 0; i < bands.length; i++) if (v >= bands[i][0] && v <= bands[i][1]) return bands[i][2];
    return null;
  }

  /* 소수점 이하 digits자리 미만 절사 (나눗셈판).
     학점·환산점수가 모두 유한소수이므로 정수 나눗셈으로 정확히 계산한다
     (부동소수 오차로 …999999가 한 자리 깎이는 일이 없도록). */
  function truncDiv(num, den, digits) {
    if (!den) return null;
    var p = Math.pow(10, digits);
    var n = Math.round(num * 1000), d = Math.round(den * 1000);
    if (!d) return null;
    return Math.floor(n * p / d) / p;
  }
  /* 절사 (값판). 그룹 가중합처럼 정수 나눗셈으로 환원하기 어려울 때 쓴다. */
  function truncTo(v, digits) {
    if (v === null || v === undefined) return null;
    var p = Math.pow(10, digits);
    return Math.floor(v * p + 1e-9) / p;
  }

  /* 환산점수 → 등급 상당치 (참고 지표). 등급환산표를 역으로 선형보간.
     등급 척도로 환원하는 게 의미 없는 규격(가천대 등)은 equivScale이 없어 null. */
  function equivGrade(score, spec) {
    var G = spec && spec.equivScale;
    if (!G || score === null || score === undefined) return null;
    if (score >= G[0]) return 1;
    for (var i = 0; i < G.length - 1; i++) {
      if (score <= G[i] && score >= G[i + 1]) {
        var span = G[i] - G[i + 1];
        return (i + 1) + (span > 0 ? (G[i] - score) / span : 0);
      }
    }
    return G.length;
  }

  function semVal(rec) {
    var y = parseInt(rec.year, 10), s = parseInt(rec.sem, 10);
    if (!y || !s) return null;
    return y * 10 + s;
  }

  /* ═══════════════ 대학별 산출 규격 ═══════════════ */
  var UNIVS = {

    /* ────────── 한국외국어대학교 · 학교장추천전형 / 논술전형 ────────── */
    hufs: {
      id: 'hufs', name: '한국외국어대학교', short: '외대',
      types: '학교장추천전형 · 논술전형(동점자 처리 시)',
      target: '지원자 전원 (논술전형 비교내신 적용 대상자 제외)',
      formula: '[{학점수 × (등급환산점수 또는 원점수환산점수 중 상윗값)} + (학점수 × 성취도환산점수)]의 합 ÷ 총 학점수',
      ratioNote: '교과별 · 학년별 반영 비율 동일',
      areas: ['국어', '수학', '영어', '사회', '과학'],
      areaNote: '국어 · 수학 · 영어 · 사회(역사 · 도덕 · 한국사 포함) · 과학',
      excludeCommon: false,
      mode: 'pooled',
      trunc: 6,
      scaleMax: 1000,
      equivScale: [1000, 960, 890, 770, 600, 400, 230, 110, 0],

      gradeConv: [1000, 960, 890, 770, 600, 400, 230, 110, 0],
      achConv: { A: 1000, B: 960, C: 890 },
      /* 원점수환산점수 — [하한(이상), 환산점수] 내림차순. 수학만 별도 기준 */
      rawTable: {
        '수학': [[90, 1000], [80, 960], [70, 890], [60, 770], [50, 600], [40, 400], [30, 230], [20, 110]],
        '기본': [[90, 1000], [85, 960], [80, 890], [75, 770], [70, 600], [60, 400], [50, 230], [40, 110]]
      },
      rawNote: '국어 · 영어 · 사회 · 과학 · 한국사는 90 / 85 / 80 / 75 / 70 / 60 / 50 / 40, 수학은 90 / 80 / 70 / 60 / 50 / 40 / 30 / 20 기준',
      careerAreaLimited: true,

      /* 상세표 열 구성 (UI가 그대로 쓴다) */
      detail: [
        { h: '등급환산', get: function (it) { return it.gConv; } },
        { h: '원점수환산', get: function (it) { return it.rConv; } }
      ],

      /* 「산출 기준」 화면이 그대로 그리는 요강 원문 표 */
      specTables: function (sp) {
        function band(tbl, g) {
          if (g === 1) return tbl[0][0] + '점 이상';
          if (g === 9) return tbl[7][0] + '점 미만';
          return tbl[g - 1][0] + '점 이상 ~ ' + tbl[g - 2][0] + '점 미만';
        }
        var rows = [];
        for (var g = 1; g <= 9; g++) {
          rows.push([{ v: g, grade: g }, { v: sp.gradeConv[g - 1], num: true },
                     { v: band(sp.rawTable['기본'], g) }, { v: band(sp.rawTable['수학'], g) }]);
        }
        return [
          { title: '공통과목 · 일반선택과목',
            head: ['등급', '환산점수', '국어 · 영어 · 사회 · 과학 · 한국사 원점수', '수학 원점수'],
            rows: rows },
          { title: '진로선택과목', head: ['성취도', '환산점수'],
            rows: ['A', 'B', 'C'].map(function (k) {
              return [{ v: k, strong: true }, { v: sp.achConv[k], num: true }]; }) }
        ];
      },

      convert: function (it, spec) {
        if (it.kind === 'general') {
          it.gConv = (it.grade >= 1 && it.grade <= 9) ? spec.gradeConv[it.grade - 1] : null;
          it.rConv = it.raw === null ? null
                   : fromTable(spec.rawTable[it.area] || spec.rawTable['기본'], it.raw, 0);
          if (it.gConv === null && it.rConv === null) { it.reason = '등급·원점수 없음'; return; }
          if (it.gConv === null)      { it.use = it.rConv; it.basis = '원점수'; }
          else if (it.rConv === null) { it.use = it.gConv; it.basis = '등급'; }
          else if (it.rConv > it.gConv) { it.use = it.rConv; it.basis = '원점수'; }
          else if (it.rConv < it.gConv) { it.use = it.gConv; it.basis = '등급'; }
          else                          { it.use = it.gConv; it.basis = '동일'; }
        } else {
          var v = spec.achConv[it.ach];
          if (v === undefined) {
            it.reason = '성취도 ' + it.ach + ' 환산 기준 없음';
            it.warn = (it.warn ? it.warn + ' / ' : '') + '요강 환산표에 없는 성취도입니다 — 확인 필요';
            return;
          }
          it.aConv = v; it.use = v; it.basis = '성취도';
        }
      }
    },

    /* ────────── 가천대학교 · 지역균형전형 ────────── */
    gachon: {
      id: 'gachon', name: '가천대학교', short: '가천대',
      types: '지역균형전형 (전체 모집단위)',
      target: '지원자 전원',
      formula: '진로선택과목 변환배점 평균 × 60% + 일반선택과목 변환배점 평균 × 40% (각 평균은 이수단위 가중)',
      ratioNote: '진로선택과목 60% + 일반선택과목 40% · 이수단위 적용',
      areas: ['국어', '수학', '영어', '사회', '과학'],
      areaNote: '국어 · 수학 · 영어 · 사회 · 과학',
      /* 공통과목(국어, 수학, 영어, 통합사회, 통합과학, 한국사)은 반영하지 않음 */
      excludeCommon: true,
      commonSubjects: COMMON_2015,
      mode: 'grouped',
      groups: [
        { key: 'career', label: '진로선택과목', weight: 0.6, kinds: ['career'] },
        { key: 'general', label: '일반선택과목', weight: 0.4, kinds: ['general'] }
      ],
      trunc: null,
      scaleMax: 100,
      equivScale: null,

      /* 변환등급 및 배점 */
      careerTable: [[70, 'A'], [50, 'B']],                     // 진로선택 = 원점수 하한(이상), 미달은 E
      careerFloor: 'E',
      generalBands: [[1, 5, 'A'], [6, 7, 'B'], [8, 9, 'E']],   // 일반선택 = 석차등급 구간
      pointOf: { A: 100, B: 99.5, E: 70 },
      rawNote: '진로선택은 원점수 70 이상 A / 50 이상 70 미만 B / 50 미만 E, 일반선택은 석차등급 1~5 A / 6~7 B / 8~9 E',
      careerAreaLimited: true,

      detail: [
        { h: '변환등급', get: function (it) { return it.convGrade; } }
      ],

      specTables: function (sp) {
        var P = sp.pointOf;
        return [
          { title: '진로선택과목 — 원점수 기준 (반영비율 60%)',
            head: ['원점수', '변환등급', '배점'],
            rows: [['70점 이상', 'A'], ['50점 이상 ~ 70점 미만', 'B'], ['50점 미만', 'E']]
              .map(function (r) {
                return [{ v: r[0] }, { v: r[1], strong: true }, { v: P[r[1]], num: true }]; }) },
          { title: '일반선택과목 — 석차등급 기준 (반영비율 40%)',
            head: ['석차등급', '변환등급', '배점'],
            rows: sp.generalBands.map(function (b) {
              return [{ v: b[0] === b[1] ? b[0] + '등급' : b[0] + '~' + b[1] + '등급' },
                      { v: b[2], strong: true }, { v: P[b[2]], num: true }]; }) }
        ];
      },

      convert: function (it, spec) {
        if (it.kind === 'career') {
          if (it.raw === null || it.raw === undefined) {
            it.reason = '진로선택 원점수 없음';
            return;
          }
          it.convGrade = fromTable(spec.careerTable, it.raw, spec.careerFloor);
          it.basis = '원점수 → ' + it.convGrade;
        } else {
          if (!(it.grade >= 1 && it.grade <= 9)) { it.reason = '석차등급 없음'; return; }
          it.convGrade = fromBands(spec.generalBands, it.grade);
          it.basis = it.grade + '등급 → ' + it.convGrade;
        }
        it.use = spec.pointOf[it.convGrade];
      }
    }
  };

  /* ═══════════════ 과목 1건 평가 ═══════════════
     opt: { semFrom, semTo, kindOverride:{과목명:'general'|'career'|'skip'},
            areaOverride:{과목명:'국어'|…} } */
  function evalRecord(rec, spec, opt) {
    opt = opt || {};
    var ao = (opt.areaOverride || {})[rec.subject];
    var a = ao ? { area: ao, guess: false } : areaOf(rec.category, rec.subject);
    var ko = (opt.kindOverride || {})[rec.subject];
    var kind = ko || kindOf(rec);
    var cls = C.classifySubject(rec.subject);

    var it = {
      rec: rec, subject: rec.subject, category: rec.category,
      year: rec.year, sem: rec.sem, credit: rec.credit || 0,
      grade: rec.grade, raw: rec.raw, ach: rec.ach,
      area: a.area, areaGuess: a.guess, kind: kind,
      autoLabel: cls.label, common: isCommon(rec.subject, spec.commonSubjects),
      gConv: null, rConv: null, aConv: null, convGrade: null,
      use: null, basis: '', included: false, reason: '', warn: ''
    };

    /* 과목명 기반 교육과정 분류와 실제 기재값이 어긋나면 확인 대상으로 표시 */
    if (kind === 'general' && cls.type === 'ach')
      it.warn = '과목명으로는 진로선택·성취도 과목인데 석차등급이 기재돼 있습니다';
    else if (kind === 'career' && cls.type === '9')
      it.warn = '과목명으로는 공통·일반선택인데 석차등급이 없습니다';
    if (a.guess && String(rec.category || '').trim())
      it.warn = (it.warn ? it.warn + ' / ' : '') + '교과("' + rec.category + '")를 인식하지 못해 과목명으로 추론했습니다';

    var sv = semVal(rec);
    if (sv === null) { it.reason = '학년·학기 미상'; return it; }
    if (opt.semFrom && sv < opt.semFrom) { it.reason = '반영 학기 밖'; return it; }
    if (opt.semTo && sv > opt.semTo) { it.reason = '반영 학기 밖'; return it; }

    if (kind === 'skip') { it.reason = '수동 제외'; return it; }
    if (kind === 'pass') { it.reason = '이수(P) 과목'; return it; }
    if (kind === 'none') { it.reason = '등급·성취도 없음'; return it; }
    if (spec.excludeCommon && it.common) { it.reason = '공통과목 미반영'; return it; }

    /* 진로선택을 반영교과로 제한하지 않는 대학을 위한 확장 지점 */
    var areaOk = spec.areas.indexOf(it.area) >= 0;
    if (kind === 'career' && spec.careerAreaLimited === false) areaOk = true;
    if (!areaOk) { it.reason = '반영교과 아님 (' + it.area + ')'; return it; }
    if (!(it.credit > 0)) { it.reason = '학점 0'; return it; }

    spec.convert(it, spec);
    if (it.reason) return it;
    if (it.use === null || it.use === undefined) { it.reason = '환산 불가'; return it; }
    it.included = true;
    return it;
  }

  /* ═══════════════ 학생 1명 · 대학 1곳 산출 ═══════════════ */
  function computeUniv(records, spec, opt) {
    var items = records.map(function (r) { return evalRecord(r, spec, opt); });
    var inc = items.filter(function (it) { return it.included; });
    var out = {
      items: items, included: inc,
      excluded: items.filter(function (it) { return !it.included; }),
      warns: items.filter(function (it) { return it.warn; }),
      groups: null, renormalized: false
    };

    if (spec.mode === 'grouped') {
      var groups = spec.groups.map(function (g) {
        var gi = inc.filter(function (it) { return g.kinds.indexOf(it.kind) >= 0; });
        var num = 0, den = 0;
        gi.forEach(function (it) { num += it.credit * it.use; den += it.credit; });
        return { key: g.key, label: g.label, weight: g.weight, items: gi,
                 credits: den, weighted: num, avg: den > 0 ? num / den : null };
      });
      var live = groups.filter(function (g) { return g.avg !== null; });
      var wsum = 0, acc = 0;
      live.forEach(function (g) { wsum += g.weight; acc += g.avg * g.weight; });
      out.groups = groups;
      out.renormalized = live.length > 0 && Math.abs(wsum - 1) > 1e-9;
      out.credits = groups.reduce(function (s, g) { return s + g.credits; }, 0);
      out.weighted = groups.reduce(function (s, g) { return s + g.weighted; }, 0);
      out.score = wsum > 0 ? acc / wsum : null;
      if (spec.trunc) out.score = truncTo(out.score, spec.trunc);
    } else {
      var num = 0, den = 0;
      inc.forEach(function (it) { num += it.credit * it.use; den += it.credit; });
      out.weighted = num; out.credits = den;
      out.score = spec.trunc ? truncDiv(num, den, spec.trunc) : (den > 0 ? num / den : null);
    }
    out.equiv = equivGrade(out.score, spec);
    return out;
  }

  /* ═══════════════ 단순 평균등급 ═══════════════
     학점×등급 합 ÷ 총 이수학점. 석차등급이 산출된 과목만.
     scope: 'all' 전 교과 | 'reflect' 해당 대학이 실제로 반영하는 과목만 */
  function computePlain(records, opt, spec) {
    opt = opt || {};
    var scope = opt.plainScope || 'all';
    var items = [], num = 0, den = 0;
    records.forEach(function (rec) {
      var ao = (opt.areaOverride || {})[rec.subject];
      var area = ao || areaOf(rec.category, rec.subject).area;
      var ko = (opt.kindOverride || {})[rec.subject];
      var kind = ko || kindOf(rec);
      var sv = semVal(rec);
      var it = { rec: rec, subject: rec.subject, year: rec.year, sem: rec.sem,
                 credit: rec.credit || 0, grade: rec.grade, area: area,
                 included: false, reason: '' };
      if (sv === null) it.reason = '학년·학기 미상';
      else if (opt.semFrom && sv < opt.semFrom) it.reason = '반영 학기 밖';
      else if (opt.semTo && sv > opt.semTo) it.reason = '반영 학기 밖';
      else if (kind === 'skip') it.reason = '수동 제외';
      else if (kind !== 'general') it.reason = '석차등급 미산출';
      else if (!(it.credit > 0)) it.reason = '학점 0';
      else if (scope === 'reflect' && spec && spec.areas.indexOf(area) < 0) it.reason = '반영교과 아님';
      else if (scope === 'reflect' && spec && spec.excludeCommon &&
               isCommon(rec.subject, spec.commonSubjects)) it.reason = '공통과목 미반영';
      else it.included = true;
      if (it.included) { num += it.credit * rec.grade; den += it.credit; }
      items.push(it);
    });
    return { items: items, weighted: num, credits: den, gpa: den > 0 ? num / den : null };
  }

  /* ═══════════════ 석차 산출 ═══════════════
     동점은 같은 석차(경쟁 순위). 백분위는 중간석차 기준으로 계산해
     동점 집단이 서로 다른 백분위를 갖지 않도록 한다. */
  function rankList(entries, higherBetter) {
    var live = entries.filter(function (e) { return e.value !== null && e.value !== undefined; });
    var n = live.length;
    var sorted = live.slice().sort(function (a, b) {
      return higherBetter ? b.value - a.value : a.value - b.value;
    });
    var out = {}, i = 0;
    while (i < sorted.length) {
      var j = i;
      while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
      var rank = i + 1, tie = j - i, mid = rank + (tie - 1) / 2;
      for (var k = i; k < j; k++) {
        out[sorted[k].id] = { rank: rank, tie: tie, mid: mid,
                              pct: n > 0 ? mid / n * 100 : null, n: n, value: sorted[k].value };
      }
      i = j;
    }
    return { n: n, byId: out };
  }

  /* ═══════════════ 유·불리 판정 ═══════════════ */
  function verdict(plainPct, univPct, eps) {
    if (plainPct === null || univPct === null) return { delta: null, tag: 'n/a', label: '비교 불가' };
    var d = plainPct - univPct;             // +면 환산에서 상위권으로 이동
    var e = eps === undefined ? 0.5 : eps;
    if (d > e)  return { delta: d, tag: 'up',   label: '대학 환산이 유리' };
    if (d < -e) return { delta: d, tag: 'down', label: '대학 환산이 불리' };
    return { delta: d, tag: 'flat', label: '차이 미미' };
  }

  /* ═══════════════ 요인 분석 ═══════════════
     환산점수가 단순 평균등급과 갈리는 지점을 분해한다. 규격 구조에 따라 달라진다. */
  function analyze(u, spec) {
    var a = {
      mode: spec.mode,
      totalCredits: u.credits || 0,
      groups: u.groups,
      /* 공통 — 반영교과 밖으로 빠진 '등급 있는' 과목 */
      offItems: [], offCredits: 0, offGrade: null,
      /* 공통 — 공통과목 미반영으로 빠진 과목 */
      commonItems: [], commonCredits: 0, commonGrade: null,
      inGrade: null,
      /* pooled 전용 */
      rawWin: [], rawWinCredits: 0, rawGainPoint: 0,
      career: [], careerCredits: 0, careerAvg: null, achCount: { A: 0, B: 0, C: 0 },
      generalCredits: 0, generalAvg: null,
      /* grouped 전용 */
      convCount: { career: {}, general: {} }
    };

    var offCr = 0, offWt = 0;
    var comCr = 0, comWt = 0;
    u.excluded.forEach(function (it) {
      var hasG = it.grade >= 1 && it.grade <= 9 && it.credit > 0;
      if (it.reason.indexOf('반영교과 아님') === 0) {
        a.offItems.push(it);
        if (hasG) { offCr += it.credit; offWt += it.credit * it.grade; }
      } else if (it.reason === '공통과목 미반영') {
        a.commonItems.push(it);
        if (hasG) { comCr += it.credit; comWt += it.credit * it.grade; }
      }
    });
    a.offCredits = offCr; a.offGrade = offCr > 0 ? offWt / offCr : null;
    a.commonCredits = comCr; a.commonGrade = comCr > 0 ? comWt / comCr : null;

    var inCr = 0, inWt = 0;
    u.included.forEach(function (it) {
      if (it.kind === 'career') return;
      if (!(it.grade >= 1 && it.grade <= 9)) return;
      inCr += it.credit; inWt += it.credit * it.grade;
    });
    a.inGrade = inCr > 0 ? inWt / inCr : null;

    if (spec.mode === 'pooled') {
      var rawGain = 0;
      a.rawWin = u.included.filter(function (it) { return it.basis === '원점수'; });
      a.rawWin.forEach(function (it) {
        rawGain += it.credit * (it.rConv - it.gConv);
        a.rawWinCredits += it.credit;
      });
      a.rawGainPoint = a.totalCredits > 0 ? rawGain / a.totalCredits : 0;

      var cCr = 0, cWt = 0, gCr = 0, gWt = 0;
      u.included.forEach(function (it) {
        if (it.kind === 'career') {
          a.career.push(it); cCr += it.credit; cWt += it.credit * it.use;
          if (a.achCount[it.ach] !== undefined) a.achCount[it.ach]++;
        } else { gCr += it.credit; gWt += it.credit * it.use; }
      });
      a.careerCredits = cCr; a.careerAvg = cCr > 0 ? cWt / cCr : null;
      a.generalCredits = gCr; a.generalAvg = gCr > 0 ? gWt / gCr : null;
    } else {
      (u.groups || []).forEach(function (g) {
        var cnt = {};
        g.items.forEach(function (it) { cnt[it.convGrade] = (cnt[it.convGrade] || 0) + it.credit; });
        a.convCount[g.key] = cnt;
      });
    }
    return a;
  }

  /* ═══════════════ 모집단 일괄 산출 ═══════════════ */
  function computeAll(students, spec, opt) {
    var rows = students.map(function (st) {
      return { id: st.id, ban: st.ban, no: st.no, name: st.name, sid: st.sid,
               univ: computeUniv(st.records, spec, opt),
               plain: computePlain(st.records, opt, spec) };
    });
    var rU = rankList(rows.map(function (r) { return { id: r.id, value: r.univ.score }; }), true);
    var rP = rankList(rows.map(function (r) { return { id: r.id, value: r.plain.gpa }; }), false);
    rows.forEach(function (r) {
      r.univRank = rU.byId[r.id] || null;
      r.plainRank = rP.byId[r.id] || null;
      r.verdict = verdict(r.plainRank ? r.plainRank.pct : null,
                          r.univRank ? r.univRank.pct : null);
      r.rankDelta = (r.plainRank && r.univRank) ? r.plainRank.rank - r.univRank.rank : null;
    });
    return { rows: rows, nUniv: rU.n, nPlain: rP.n };
  }

  var api = {
    UNIVS: UNIVS, COMMON_2015: COMMON_2015,
    areaOf: areaOf, kindOf: kindOf, isCommon: isCommon, normSubj: normSubj,
    fromTable: fromTable, fromBands: fromBands,
    truncDiv: truncDiv, truncTo: truncTo, equivGrade: equivGrade,
    evalRecord: evalRecord, computeUniv: computeUniv, computePlain: computePlain,
    rankList: rankList, verdict: verdict, analyze: analyze, computeAll: computeAll
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.UnivCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
