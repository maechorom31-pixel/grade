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

  /* 과목명 정규화 — 공백·가운뎃점 제거, 로마자 표기 통일.
     나이스 출력이 '물리학Ⅰ' / '물리학I' / '물리학 I' 로 갈리므로 모두 '물리학1'로 모은다. */
  function normSubj(s) {
    return String(s || '')
      .replace(/[\s·・ㆍ]/g, '')
      .replace(/Ⅷ/g, '8').replace(/Ⅶ/g, '7').replace(/Ⅵ/g, '6').replace(/Ⅴ/g, '5')
      .replace(/Ⅳ/g, '4').replace(/Ⅲ/g, '3').replace(/Ⅱ/g, '2').replace(/Ⅰ/g, '1')
      .replace(/III$/, '3').replace(/II$/, '2').replace(/I$/, '1');
  }

  /* ═══════════════ 2015 개정 교육과정 보통 교과 과목표 ═══════════════
     교육부 고시 제2015-74호 [별표 3] · 제2020-236호 개정 반영.
     구분 — common 공통과목 / general 일반선택과목 / career 진로선택과목

     이 표가 있으면 과목명만으로 교육과정상 구분이 확정되므로,
       · 공통과목을 반영하지 않는 대학(가천대)의 판정이 정확해지고
       · 나이스 「교과」 열이 비었을 때도 교과영역을 정확히 알 수 있으며
         (교양 '실용 경제'를 과목명만 보고 사회로 넣는 사고를 막는다)
       · 생기부 기재값과 어긋나는 기록을 찾아낼 수 있다.                      */
  var CURRICULUM_2015 = {
    '국어': { area: '국어',
      common: ['국어'],
      general: ['화법과 작문', '독서', '언어와 매체', '문학'],
      career: ['실용 국어', '심화 국어', '고전 읽기'] },
    '수학': { area: '수학',
      common: ['수학'],
      general: ['수학Ⅰ', '수학Ⅱ', '미적분', '확률과 통계'],
      career: ['기본 수학', '실용 수학', '인공지능 수학', '기하', '경제 수학', '수학과제 탐구'] },
    '영어': { area: '영어',
      common: ['영어'],
      general: ['영어 회화', '영어Ⅰ', '영어 독해와 작문', '영어Ⅱ'],
      career: ['기본 영어', '실용 영어', '영어권 문화', '진로 영어', '영미 문학 읽기'] },
    '한국사': { area: '사회',
      common: ['한국사'], general: [], career: [] },
    '사회(역사/도덕 포함)': { area: '사회',
      common: ['통합사회'],
      general: ['한국지리', '세계지리', '세계사', '동아시아사', '경제', '정치와 법',
                '사회·문화', '생활과 윤리', '윤리와 사상'],
      career: ['여행지리', '사회문제 탐구', '고전과 윤리'] },
    '과학': { area: '과학',
      /* 과학탐구실험도 공통과목이다. 다만 석차등급 없이 성취도 3단계만 산출한다. */
      common: ['통합과학', '과학탐구실험'],
      general: ['물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ'],
      career: ['물리학Ⅱ', '화학Ⅱ', '생명과학Ⅱ', '지구과학Ⅱ', '과학사', '생활과 과학', '융합과학'] },
    '체육': { area: '체예', achOnly: true,
      common: [],
      general: ['체육', '운동과 건강'],
      career: ['스포츠 생활', '체육 탐구'] },
    '예술': { area: '체예', achOnly: true,
      common: [],
      general: ['음악', '미술', '연극'],
      career: ['음악 연주', '음악 감상과 비평', '미술 창작', '미술 감상과 비평'] },
    '기술·가정': { area: '기타',
      common: [],
      general: ['기술·가정', '정보'],
      career: ['농업 생명 과학', '공학 일반', '창의 경영', '해양 문화와 기술', '가정과학',
               '지식 재산 일반', '인공지능 기초'] },
    '제2외국어': { area: '기타',
      common: [],
      general: ['독일어Ⅰ', '일본어Ⅰ', '프랑스어Ⅰ', '러시아어Ⅰ', '스페인어Ⅰ', '아랍어Ⅰ',
                '중국어Ⅰ', '베트남어Ⅰ'],
      career: ['독일어Ⅱ', '일본어Ⅱ', '프랑스어Ⅱ', '러시아어Ⅱ', '스페인어Ⅱ', '아랍어Ⅱ',
               '중국어Ⅱ', '베트남어Ⅱ'] },
    '한문': { area: '기타',
      common: [], general: ['한문Ⅰ'], career: ['한문Ⅱ'] },
    '교양': { area: '기타', passOnly: true,
      common: [],
      general: ['철학', '논리학', '심리학', '교육학', '종교학', '진로와 직업',
                '보건', '환경', '실용 경제', '논술'],
      career: [] }
  };

  /* 과목명 → {group 교과(군), area, curr, expect} 조회표
     expect: 그 과목에서 원래 나와야 할 성적 산출 방식
       'grade' 석차등급 · 'ach' 성취도만 · 'pass' 이수(P)만 */
  var SUBJ_INDEX = (function () {
    var idx = {};
    Object.keys(CURRICULUM_2015).forEach(function (group) {
      var g = CURRICULUM_2015[group];
      ['common', 'general', 'career'].forEach(function (curr) {
        (g[curr] || []).forEach(function (name) {
          var expect = curr === 'career' ? 'ach'
                     : g.passOnly ? 'pass'
                     : g.achOnly ? 'ach' : 'grade';
          if (group === '과학' && normSubj(name) === '과학탐구실험') expect = 'ach';
          idx[normSubj(name)] = { group: group, area: g.area, curr: curr,
                                  name: name, expect: expect };
        });
      });
    });
    return idx;
  })();
  function lookupSubject(subject) { return SUBJ_INDEX[normSubj(subject)] || null; }

  /* ═══════════════ 교과영역 판정 ═══════════════
     ① 수동 지정 → ② 나이스 「교과」 열 → ③ 교육과정 표 → ④ 과목명 추론
     나이스 교과 열은 학교가 실제로 기록한 값이라 전문교과·자체 개설 과목까지 담고,
     교육과정 표는 교과 열이 비었을 때 과목명만으로 정확히 짚어 준다.
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
  function areaFromCategory(category) {
    var c = String(category || '').trim();
    if (!c) return null;
    for (var i = 0; i < CAT_RULES.length; i++) if (CAT_RULES[i][0].test(c)) return CAT_RULES[i][1];
    return null;
  }
  /* → {area, guess, byCat, byCur} guess=true면 과목명 추론까지 내려간 것 */
  function areaOf(category, subject) {
    var byCat = areaFromCategory(category);
    var cur = lookupSubject(subject);
    var byCur = cur ? cur.area : null;
    if (byCat) return { area: byCat, guess: false, byCat: byCat, byCur: byCur };
    if (byCur) return { area: byCur, guess: false, byCat: null, byCur: byCur };
    return { area: C.inferArea(subject), guess: true, byCat: null, byCur: null };
  }

  /* ═══════════════ 성적 산출 방식 판정 ═══════════════
     생기부 기재값이 근거다.
       석차등급(1~9) 있음      → general
       성취도 A~E 만 있음      → career
       P                       → pass
       둘 다 없음              → none */
  function kindOf(rec) {
    if (rec.grade !== null && rec.grade >= 1 && rec.grade <= 9) return 'general';
    if (rec.ach === 'P') return 'pass';
    if (/^[A-E]$/.test(rec.ach || '')) return 'career';
    return 'none';
  }

  /* 교육과정 표를 우선하되, 표가 기대하는 자료가 실제로 없으면 기재값을 따른다.
     (진로선택인데 성취도가 없고 석차등급만 있는 기록 등 — 이상 기록은 경고로 남긴다) */
  function effectiveKind(rec, cur) {
    var data = kindOf(rec);
    if (!cur) return { kind: data, mismatch: false };
    var hasGrade = rec.grade !== null && rec.grade >= 1 && rec.grade <= 9;
    var hasAch = /^[A-E]$/.test(rec.ach || '');
    var want = cur.expect === 'grade' ? 'general' : cur.expect === 'ach' ? 'career' : 'pass';
    if (want === 'general' && hasGrade) return { kind: 'general', mismatch: false };
    if (want === 'career' && hasAch)    return { kind: 'career', mismatch: false };
    if (want === 'pass' && rec.ach === 'P') return { kind: 'pass', mismatch: false };
    /* 기대와 다르면 실제 기재값을 쓰되 확인 대상으로 표시 */
    return { kind: data, mismatch: data !== 'none' };
  }

  /* ═══════════════ 공통과목 판정 ═══════════════
     공통과목을 반영하지 않는 대학(가천대 등)을 위한 것.
     교육과정 표가 우선이고, 표에 없는 과목은 규격이 명시한 목록으로 대조한다. */
  var COMMON_2015 = ['국어', '수학', '영어', '통합사회', '통합과학', '한국사', '과학탐구실험'];
  function isCommon(subject, list) {
    var cur = lookupSubject(subject);
    if (cur) return cur.curr === 'common';
    var arr = list || COMMON_2015, n = normSubj(subject);
    for (var i = 0; i < arr.length; i++) if (normSubj(arr[i]) === n) return true;
    return false;
  }
  /* 교육과정 자동 분류 라벨 */
  function currLabel(subject) {
    var cur = lookupSubject(subject);
    if (!cur) return '교육과정 표에 없음 — 기재값으로 판정';
    return '2015 ' + cur.group + ' · ' +
           (cur.curr === 'common' ? '공통과목' : cur.curr === 'general' ? '일반선택' : '진로선택');
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
  /* 요강이 지정한 자리에서 반올림 */
  function round2(v) { return v === null ? null : Math.round(v * 100) / 100; }
  function round3(v) { return v === null ? null : Math.round(v * 1000) / 1000; }
  function roundTo(v, d) {
    if (v === null || v === undefined) return null;
    var p = Math.pow(10, d);
    return Math.round(v * p) / p;
  }
  /* 절사 (값판). 그룹 가중합처럼 정수 나눗셈으로 환원하기 어려울 때 쓴다. */
  function truncTo(v, digits) {
    if (v === null || v === undefined) return null;
    var p = Math.pow(10, digits);
    return Math.floor(v * p + 1e-9) / p;
  }

  /* 환산점수 → 등급 상당치 (참고 지표). 등급환산표를 역으로 선형보간.
     등급 척도로 환원하는 게 의미 없는 규격(가천대 등)은 equivScale이 없어 null.
     equivDiv가 있으면 점수를 그 값으로 나눠 표의 척도에 맞춘다
     (숭실대는 100점 만점 총점을 10점 척도 등급점수표에 대입). */
  function equivGrade(score, spec) {
    var G = spec && spec.equivScale;
    if (!G || score === null || score === undefined) return null;
    if (spec.equivDiv) score = score / spec.equivDiv;
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
      /* 동점자 처리 기준 — 교과 점수에는 안 들어가지만 실제 선발에 쓰인다 */
      tiebreakers: [
        { key: 'artsPe', label: '체육·예술 성취도 평균', better: 'high',
          note: '동점자 처리 1단계 · 성취도 배점 A 3점 · B 2점 · C 1점' }
      ],
      tiebreakSteps: [
        '출결 우수자 (미인정 합이 낮은 자) — 미인정 결석 3점 · 지각/조퇴/결과 각 1점',
        '체육 · 예술교과 성취도 평균 우수자 — A 3점 · B 2점 · C 1점',
        '반영된 진로선택과목의 성취도 「A」 부여 비율 평균이 낮은 자'
      ],
      tiebreakUnsupported: ['출결', '진로선택과목의 성취도 「A」 부여 비율'],

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
    },

    /* ────────── 숭실대학교 · 교과우수자 / 논술우수자 / 예체능우수인재 ────────── */
    ssu: {
      id: 'ssu', name: '숭실대학교', short: '숭실대',
      types: '교과우수자 · 논술우수자 · 예체능우수인재',
      target: '지원자 전원 (2024년 및 이전 졸업자는 비교평가 대상)',
      formula: '(공통과목·일반선택 환산점수 + 진로선택 환산점수) × 전형별 학생부 교과 반영비율',
      ratioNote: '학년별 가중치 없이 전 학년 성적 반영 · 교과별 가중치는 계열마다 다름',
      rawNote: '공통·일반선택은 석차등급, 진로선택은 성취도를 등급으로 바꿔(A=1, B=2, C=3) 같은 점수표를 적용',
      mode: 'weighted',
      scaleMax: 100,
      trunc: null,
      excludeCommon: false,
      careerAreaLimited: true,
      /* 석차등급 및 성취도 점수표 (index = 등급-1) */
      gradeConv: [10.0, 9.5, 9.0, 8.5, 8.0, 7.0, 5.0, 3.0, 0],
      achGrade: { A: 1, B: 2, C: 3 },
      /* 진로선택 최대 취득 비율 — [이수 과목 수 하한, 상한(%)] 내림차순.
         상한이 줄면 총점 만점 자체가 96·98점으로 내려간다 (재정규화가 아니다). */
      careerCaps: [[3, 20], [2, 18], [1, 16]],
      /* 100점 만점 총점을 10점 척도 등급점수표에 대입해 등급 상당치를 낸다 */
      equivScale: [10.0, 9.5, 9.0, 8.5, 8.0, 7.0, 5.0, 3.0, 0],
      equivDiv: 10,

      /* 계열마다 반영교과와 가중치가 다르다 */
      variants: [
        { key: 'inmun', label: '인문계열',
          areas: ['국어', '수학', '영어', '사회'], areaNote: '국어 · 수학 · 영어 · 사회(한국사 포함)',
          weights: { '국어': 35, '수학': 15, '영어': 35, '사회': 15 }, generalPct: 80, careerPct: 20 },
        { key: 'gyeongsang', label: '경상계열',
          areas: ['국어', '수학', '영어', '사회'], areaNote: '국어 · 수학 · 영어 · 사회(한국사 포함)',
          weights: { '국어': 20, '수학': 30, '영어': 35, '사회': 15 }, generalPct: 80, careerPct: 20 },
        { key: 'jayu-in', label: '자유전공학부(인문)',
          areas: ['국어', '수학', '영어', '사회'], areaNote: '국어 · 수학 · 영어 · 사회(한국사 포함)',
          weights: { '국어': 30, '수학': 20, '영어': 30, '사회': 20 }, generalPct: 80, careerPct: 20 },
        { key: 'jayeon', label: '자연계열 · 자유전공학부(자연)',
          areas: ['국어', '수학', '영어', '과학'], areaNote: '국어 · 수학 · 영어 · 과학 (사회 · 한국사 미반영)',
          weights: { '국어': 15, '수학': 35, '영어': 25, '과학': 25 }, generalPct: 80, careerPct: 20 },
        { key: 'yeche', label: '예체능우수인재 (인문계열 가중치)',
          areas: ['국어', '수학', '영어', '사회'], areaNote: '국어 · 수학 · 영어 · 사회(한국사 포함)',
          weights: { '국어': 35, '수학': 15, '영어': 35, '사회': 15 }, generalPct: 100, careerPct: 0 }
      ],

      detail: [
        { h: '적용 등급', get: function (it) {
            return it.kind === 'career' ? it.convGrade : it.grade; } }
      ],

      convert: function (it, spec) {
        if (it.kind === 'career') {
          if (spec.careerPct <= 0) { it.reason = '이 전형은 진로선택 미반영'; return; }
          var g = spec.achGrade[it.ach];
          if (!g) {
            it.reason = '성취도 ' + it.ach + ' 환산 기준 없음';
            it.warn = (it.warn ? it.warn + ' / ' : '') + '요강 환산표에 없는 성취도입니다 — 확인 필요';
            return;
          }
          it.convGrade = g;
          it.use = spec.gradeConv[g - 1];
          it.basis = '성취도 ' + it.ach + ' → ' + g + '등급';
        } else {
          if (!(it.grade >= 1 && it.grade <= 9)) { it.reason = '석차등급 없음'; return; }
          it.use = spec.gradeConv[it.grade - 1];
          it.basis = it.grade + '등급';
        }
      },

      specTables: function (sp) {
        var rows = [];
        for (var g = 1; g <= 9; g++)
          rows.push([{ v: g, grade: g }, { v: sp.gradeConv[g - 1], num: true }]);
        var AREAS4 = ['국어', '수학', '영어', '사회', '과학'];
        return [
          { title: '석차등급 및 성취도 점수표',
            head: ['등급', '점수'], rows: rows },
          { title: '계열별 교과 가중치 — 공통·일반선택 ' + sp.generalPct + '%',
            head: ['계열'].concat(AREAS4.map(function (a) { return a + '교과'; })).concat(['진로선택']),
            rows: sp.variants.map(function (v) {
              return [{ v: v.label, strong: v.key === sp.variantKey }].concat(
                AREAS4.map(function (a) {
                  return { v: v.weights[a] === undefined ? '–' : v.weights[a], num: v.weights[a] !== undefined };
                })).concat([{ v: v.careerPct ? v.careerPct + '%' : '미반영' }]);
            }) },
          { title: '진로선택 최대 취득 비율 (이수 과목 수 기준)',
            head: ['이수 과목 수', '최대 취득 비율'],
            rows: sp.careerCaps.map(function (c, i) {
              return [{ v: i === 0 ? c[0] + '과목 이상' : c[0] + '과목' },
                      { v: c[1] + '%' }]; })
              .concat([[{ v: '0과목' }, { v: '0%' }]]) }
        ];
      }
    },

/* ────────── 전남대학교 · 학생부교과 · 예체능 실기 · 실기/실적 ────────── */
    cnu: {
      id: 'cnu', name: '전남대학교', short: '전남대',
      types: '학생부교과 · 예체능 실기 · 실기/실적',
      target: '국내 고교 졸업(예정)자 (2027년 2월 졸업예정자 포함)',
      formula: '석차등급산출과목(기본점수 + 이수단위 가중평균 등급점수 × 계수) + 진로선택과목(성취도 상위 3과목) + 출결',
      ratioNote: '학년별 가중치 없음 · 1학년 1학기 ~ 3학년 1학기 (졸업자도 동일)',
      rawNote: '석차등급은 1등급 100점부터 8등급 65점 · 9등급 0점, 진로선택 성취도는 A 15 · B 9 · C 3 (배점 비율은 전형별로 축소)',
      mode: 'base',
      trunc: null,
      excludeCommon: false,
      careerAreaLimited: true,
      /* 진로선택에 석차등급이 기재되면 석차등급산출과목으로 반영한다 (요강 명시).
         이때 그 진로선택 과목의 성적은 비교내신으로 처리된다 — 아래 careerCompareNote 참고 */
      careerWithGradeToGeneral: true,
      gradeConv: [100, 95, 90, 85, 80, 75, 70, 65, 0],
      /* 2022 개정 교육과정(내신 5등급 체계) 등급점수 — 표시용.
         본 계산기는 생기부에 기재된 9등급 체계를 그대로 쓴다. */
      gradeConv5: [100, 90, 80, 70, 0],
      /* 성취도 등급점수표는 전형과 무관하게 한 벌이고, 전형별 축소는 계수로 건다.
         (상위 3과목 등급점수의 합 ÷ 3) × 계수 — 계수 1 / 0.8 / 0.3, 총점 15 / 12 / 4.5.
         계수를 C점수 3에 곱하면 3 / 2.4 / 0.9로, 요강의 비교내신 최저점과 일치한다. */
      achPoint: { A: 15, B: 9, C: 3 },
      careerTopN: 3,
      /* 석차등급이 산출되지 않는 소인수 학교 — Z점수로 석차등급을 매긴다 */
      zToGrade: true,
      /* 환산등급 상당치는 석차등급산출과목 평균으로 낸다 (총점에는 기본점수·출결이 섞여 있다) */
      equivScale: [100, 95, 90, 85, 80, 75, 70, 65, 0],
      equivFrom: function (out) { return out.generalAvg; },
      compareNote: '비교내신은 진로선택 3과목 미만 외에도 2021년 2월 이전 졸업자, ' +
        '검정고시 · 국외고 출신자, 국내 1~9등급 이외 성적체계 지원자에게 적용됩니다 — ' +
        '생기부 교과 자료만으로는 판정할 수 없어 이 계산기는 「3과목 미만」만 자동 적용합니다.',

      /* 전형별로 기본점수 · 계수 · 진로선택 총점 · 출결 배점이 통째로 다르다.
         반영교과(계열)까지 같이 갈리므로 두 축을 묶어 한 벌로 제공한다. */
      variants: [
        { key: 'ilgwal', label: '학생부교과(일반) 일괄선발 · 전 모집단위',
          areas: ['국어', '수학', '영어', '사회', '과학'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 사회 · 과학',
          includeForeignHanmun: false,
          basePoints: 660, coef: 2.25, realMax: 225, careerMax: 15,
          careerCoef: 1,
          compareCoef: 0.06666, compareMin: 3,
          attend: { base: 90, real: 10, coef: 0.04444 },
          scaleMax: 1000 },
        { key: 'ilgwal-inmun', label: '학생부교과(일반) 일괄선발 · 인문대학',
          areas: ['국어', '수학', '영어', '사회', '과학'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 사회 · 과학 + 제2외국어 / 한문',
          includeForeignHanmun: true,
          basePoints: 660, coef: 2.25, realMax: 225, careerMax: 15,
          careerCoef: 1,
          compareCoef: 0.06666, compareMin: 3,
          attend: { base: 90, real: 10, coef: 0.04444 },
          scaleMax: 1000 },
        { key: 'dangye', label: '단계선발 · 특수교육대상자 (전 모집단위)',
          areas: ['국어', '수학', '영어', '사회', '과학'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 사회 · 과학',
          includeForeignHanmun: false,
          basePoints: 528, coef: 1.8, realMax: 180, careerMax: 12,
          careerCoef: 0.8,
          compareCoef: 0.06666, compareMin: 2.4,
          attend: { base: 72, real: 8, coef: 0.04444 },
          scaleMax: 800 },
        { key: 'yeche', label: '단계선발 · 예체능 실기 (예능 계열 · 체육교육과)',
          areas: ['국어', '영어', '사회'],
          areaNote: '국어 · 영어 · 한국사 · 사회 (수학 · 과학 · 제2외국어 / 한문 미반영)',
          includeForeignHanmun: false,
          basePoints: 528, coef: 1.8, realMax: 180, careerMax: 12,
          careerCoef: 0.8,
          compareCoef: 0.06666, compareMin: 2.4,
          attend: { base: 72, real: 8, coef: 0.04444 },
          scaleMax: 800 },
        { key: 'siljeok', label: '실기 · 실적 전형 (예능 계열 · 체육교육과)',
          areas: ['국어', '영어', '사회'],
          areaNote: '국어 · 영어 · 한국사 · 사회 (수학 · 과학 · 제2외국어 / 한문 미반영)',
          includeForeignHanmun: false,
          basePoints: 193.5, coef: 0.72, realMax: 72, careerMax: 4.5,
          careerCoef: 0.3,
          /* 요강이 최저점 0.9만 밝힌 구간 — 계수는 다른 전형과 같은 규칙
             (진로선택 총점 ÷ 실질점수 만점 = 4.5 ÷ 72)으로 두었다 */
          compareCoef: 0.0625, compareMin: 0.9,
          attend: { base: 27, real: 3, coef: 0.04166 },
          scaleMax: 300 }
      ],

      /* 제2외국어/한문 교과군은 인문대학 모집단위만 반영 — 교육과정 표의 교과(군)로 가른다.
         (나이스 교과 열이 '기술・가정/제2외국어/한문/교양'처럼 묶여 나오는 학교가 많다) */
      areaOk: function (it, spec) {
        if (spec.areas.indexOf(it.area) >= 0) return true;
        if (spec.includeForeignHanmun && (it.group === '제2외국어' || it.group === '한문')) return true;
        return false;
      },

      detail: [
        { h: '등급점수', get: function (it) { return it.use; } }
      ],

      convert: function (it, spec) {
        if (it.kind === 'career') {
          var v = spec.achPoint[it.ach];
          if (v === undefined) {
            it.reason = '성취도 ' + it.ach + ' 환산 기준 없음';
            it.warn = (it.warn ? it.warn + ' / ' : '') + '요강 환산표에 없는 성취도입니다 — 확인 필요';
            return;
          }
          it.use = v; it.convGrade = it.ach;
          it.basis = '성취도 ' + it.ach;
        } else {
          var g = it.grade;
          if (!(g >= 1 && g <= 9)) {
            /* 소인수 학교 — 석차등급이 없으면 Z점수로 등급을 매긴다 */
            var z = spec.zToGrade ? zScore(it.rec) : null;
            g = z === null ? null : cnuZGrade(z);
            if (!g) { it.reason = '석차등급 없음'; return; }
            it.zScore = z;
            it.zGrade = g;
            it.basis = 'Z ' + roundHalfUp(z, 100) + ' → ' + g + '등급';
          } else {
            it.basis = g + '등급';
          }
          it.convGrade = g;
          it.use = spec.gradeConv[g - 1];
        }
      },

      specTables: function (sp) {
        var rows = [];
        for (var g = 1; g <= 9; g++)
          rows.push([{ v: g, grade: g }, { v: sp.gradeConv[g - 1], num: true }]);
        var ZLABEL = ['1.76 이상', '1.23 ~ 1.75', '0.74 ~ 1.22', '0.26 ~ 0.73',
                      '-0.25 ~ 0.25', '-0.73 ~ -0.26', '-1.22 ~ -0.74',
                      '-1.75 ~ -1.23', '-1.76 이하'];
        return [
          { title: '석차등급 등급점수 (9등급 체계)', head: ['석차등급', '등급점수'], rows: rows },
          { title: '석차등급 등급점수 (2022 개정 · 내신 5등급 체계 — 참고)',
            head: ['석차등급', '등급점수'],
            rows: sp.gradeConv5.map(function (v, i) {
              return [{ v: i + 1, grade: i + 1 }, { v: v, num: true }]; }) },
          { title: '진로선택 성취도별 등급점수 (성취도 상위 ' + sp.careerTopN + '과목만)',
            head: ['성취도', '등급점수'],
            rows: ['A', 'B', 'C'].map(function (k) {
              return [{ v: k, strong: true }, { v: sp.achPoint[k], num: true }]; }) },
          { title: '전형별 반영점수 — 현재 선택: ' + sp.variant.label,
            head: ['전형', '석차등급산출 기본', '실질점수 계수', '진로선택 계수', '진로선택', '출결', '총점'],
            rows: sp.variants.map(function (v) {
              return [{ v: v.label, strong: v.key === sp.variantKey },
                      { v: v.basePoints, num: true },
                      { v: '× ' + v.coef + ' (최대 ' + v.realMax + ')' },
                      { v: '× ' + v.careerCoef },
                      { v: v.careerMax, num: true },
                      { v: v.attend.base + v.attend.real, num: true },
                      { v: v.scaleMax, num: true }];
            }) },
          { title: '진로선택 비교내신 — 3과목 미만일 때',
            head: ['전형', '석차등급산출 실질점수 × 계수', '최저점'],
            rows: sp.variants.map(function (v) {
              return [{ v: v.label, strong: v.key === sp.variantKey },
                      { v: '× ' + v.compareCoef },
                      { v: v.compareMin, num: true }];
            }) },
          { title: '소인수 학교 Z점수 → 석차등급 (석차등급 미산출 과목)',
            head: ['Z점수', '석차등급'],
            rows: ZLABEL.map(function (t, i) {
              return [{ v: t }, { v: i + 1, grade: i + 1 }]; }) }
        ];
      }
    },

    /* ────────── 명지대학교 · 학생부교과(특성화고교전형) 외 ────────── */
    mju: {
      id: 'mju', name: '명지대학교', short: '명지대',
      types: '학생부교과(학교장추천 · 교과면접 · 기회균형 · 만학도 · 특수교육대상자) · 실기/실적',
      target: '학생부교과(특성화고교전형)는 산식이 달라 수록하지 않음',
      formula: 'Σ(등급별 환산점수 × 이수학점) ÷ Σ(이수학점) + 가산점(반영교과 내 모든 이수학점 합 × 0.05)',
      ratioNote: '학년별 가중치 없음 · 지원자 전체 3학년 1학기까지 성적 반영',
      rawNote: '석차등급 1→100 · 2→99 · 3→98 · 4→94 · 5→90 · 6→80 · 7→60 · 8→30 · 9→0, 진로선택 성취도는 A=1등급 · B=2등급 · C=4등급',
      mode: 'pooled',
      scaleMax: 100,
      trunc: null,
      round: 3,                    // 소수점 넷째자리에서 반올림
      bonusPerCredit: 0.05,        // 이수학점 가산점
      excludeCommon: false,
      careerAreaLimited: true,
      gradeConv: [100, 99, 98, 94, 90, 80, 60, 30, 0],
      /* 성취평가 점수 행: 1등급 A · 2등급 B · 4등급 C · 8등급 D · 9등급 E */
      achGrade: { A: 1, B: 2, C: 4, D: 8, E: 9 },
      /* 등급 상당치는 가산점을 뺀 순수 가중평균으로 낸다 (가산점은 이수량이라 등급이 아니다) */
      equivScale: [100, 99, 98, 94, 90, 80, 60, 30, 0],
      equivFrom: function (out) { return out.base; },

      variants: [
        { key: 'inmun', label: '인문사회계열',
          areas: ['국어', '수학', '영어', '사회'],
          areaNote: '국어 · 수학 · 영어 · 사회(한국사 포함)' },
        { key: 'jayeon', label: '자연공학계열',
          areas: ['국어', '수학', '영어', '과학'],
          areaNote: '국어 · 수학 · 영어 · 과학' },
        { key: 'yeche', label: '예체능계열 (스포츠 · 예술대학)',
          areas: ['국어', '영어'],
          areaNote: '국어 · 영어' }
      ],

      detail: [
        { h: '적용 등급', get: function (it) {
            return it.kind === 'career' ? it.convGrade : it.grade; } }
      ],

      convert: function (it, spec) {
        if (it.kind === 'career') {
          var g = spec.achGrade[it.ach];
          if (!g) {
            it.reason = '성취도 ' + it.ach + ' 환산 기준 없음';
            it.warn = (it.warn ? it.warn + ' / ' : '') + '요강 환산표에 없는 성취도입니다 — 확인 필요';
            return;
          }
          it.convGrade = g;
          it.use = spec.gradeConv[g - 1];
          it.basis = '성취도 ' + it.ach + ' → ' + g + '등급';
        } else {
          if (!(it.grade >= 1 && it.grade <= 9)) { it.reason = '석차등급 없음'; return; }
          it.use = spec.gradeConv[it.grade - 1];
          it.basis = it.grade + '등급';
        }
      },

      specTables: function (sp) {
        var rows = [];
        for (var g = 1; g <= 9; g++)
          rows.push([{ v: g, grade: g }, { v: sp.gradeConv[g - 1], num: true }]);
        return [
          { title: '석차등급별 환산점수', head: ['석차등급', '환산점수'], rows: rows },
          { title: '진로선택 성취도 → 등급', head: ['성취도', '등급', '환산점수'],
            rows: ['A', 'B', 'C'].map(function (k) {
              var g = sp.achGrade[k];
              return [{ v: k, strong: true }, { v: g + '등급' },
                      { v: sp.gradeConv[g - 1], num: true }]; }) },
          { title: '전형별 교과성적 환산점수 (산출식 결과값 기준)',
            head: ['전형', '환산', '총점'],
            rows: [
              [{ v: '학생부교과(학교장추천 · 기회균형)' }, { v: '결과값 × 10' }, { v: 1000, num: true }],
              [{ v: '학생부교과(교과면접 등) 1단계' }, { v: '결과값 × 10' }, { v: 1000, num: true }],
              [{ v: '학생부교과(교과면접 등) 2단계' }, { v: '결과값 × 7' }, { v: 700, num: true }],
              [{ v: '실기/실적(실기우수자 등)' }, { v: '결과값 × 2' }, { v: 200, num: true }],
              [{ v: '실기/실적(특기자 일부)' }, { v: '결과값 × 1' }, { v: 100, num: true }]
            ] }
        ];
      }
    },

    /* ────────── 가천대학교 · 학생부우수자전형 ────────── */
    gachonS: {
      id: 'gachonS', name: '가천대학교', short: '가천대(우수자)',
      types: '학생부우수자전형',
      target: '전 학년 반영 · 2가지 유형 중 유리한 것 적용',
      formula: '유형1(변환등급 평균)과 유형2(석차등급 우수 10과목 평균) 중 높은 쪽 채택 · 둘 다 이수단위 가중',
      ratioNote: '전 학년 반영 · 학년별 가중치 없음',
      rawNote: '유형1은 1·2등급 A · 3·4등급 B · 5등급 C · 6·7등급 D · 8·9등급 E (A 100 · B 99.5 · C 99 · D 90 · E 70), 유형2는 석차등급을 배점으로 직접 환산',
      mode: 'best',
      scaleMax: 100,
      trunc: null,
      round: 4,
      excludeCommon: false,        // 지역균형과 달리 공통과목을 반영한다
      careerAreaLimited: true,
      /* 반영교과는 계열별로 갈린다. 그 안에서 공통과목·일반선택과목 전체를 쓰고
         진로선택은 반영하지 않는다. */
      variants: [
        { key: 'inmun', label: '인문계열',
          areas: ['국어', '수학', '영어', '사회'],
          areaNote: '국어 · 수학 · 영어 · 사회' },
        { key: 'jayeon', label: '자연계열',
          areas: ['국어', '수학', '영어', '과학'],
          areaNote: '국어 · 수학 · 영어 · 과학' },
        { key: 'med', label: '의예과 · 한의예과 · 약학과',
          areas: ['국어', '수학', '영어', '과학'],
          areaNote: '국어 · 수학 · 영어 · 과학' }
      ],

      alternatives: [
        { key: 't1', label: '유형1 · 변환등급 적용',
          note: '1·2등급 A · 3·4등급 B · 5등급 C · 6·7등급 D · 8·9등급 E → A 100 · B 99.5 · C 99 · D 90 · E 70',
          bands: [[1, 2, 'A'], [3, 4, 'B'], [5, 5, 'C'], [6, 7, 'D'], [8, 9, 'E']],
          pointOf: { A: 100, B: 99.5, C: 99, D: 90, E: 70 } },
        { key: 't2', label: '유형2 · 석차등급 우수 10과목',
          note: '1등급 100 · 2등급 99.5 · 3등급 99 · 4등급 98.5 · 5등급 98 · 6등급 97.5 · 7등급 85 · 8등급 60 · 9등급 30',
          gradeConv: [100, 99.5, 99, 98.5, 98, 97.5, 85, 60, 30], topN: 10 }
      ],

      /* 두 유형 모두 공통·일반선택만 쓴다 — 진로선택은 반영하지 않는다 */
      equivScale: null,
      tiebreakers: [
        { key: 'artsPe', label: '체육·예술 성취도 평균', better: 'high',
          note: '참고 지표 — 학생부우수자전형의 동점자 기준은 요강에서 따로 확인해야 합니다' }
      ],

      detail: [
        { h: '변환등급', get: function (it) { return it.convGrade; } },
        { h: '유형1', get: function (it) { return it.altUse ? it.altUse.t1 : null; } },
        { h: '유형2', get: function (it) {
            if (!it.altUse) return null;
            return (it.altTop && it.altTop.t2) ? it.altUse.t2 : '제외'; } }
      ],

      convert: function (it, spec) {
        /* 두 유형 모두 석차등급으로만 계산한다. 성취도로 산출되는 과목은
           진로선택이든 체육·예술 일반선택이든 똑같이 반영 대상이 아니다. */
        if (it.kind === 'career') { it.reason = '성취도 산출 과목 (석차등급만 반영)'; return; }
        if (!(it.grade >= 1 && it.grade <= 9)) { it.reason = '석차등급 없음'; return; }
        it.altUse = {};
        spec.alternatives.forEach(function (alt) {
          it.altUse[alt.key] = alt.bands
            ? alt.pointOf[fromBands(alt.bands, it.grade)]
            : alt.gradeConv[it.grade - 1];
          if (alt.bands) it.convGrade = fromBands(alt.bands, it.grade);
        });
        it.use = it.altUse[spec.alternatives[0].key];
        it.basis = it.grade + '등급 → ' + it.convGrade;
      },

      specTables: function (sp) {
        var t1 = sp.alternatives[0], t2 = sp.alternatives[1];
        var rows1 = t1.bands.map(function (b) {
          return [{ v: b[0] === b[1] ? b[0] + '등급' : b[0] + '·' + b[1] + '등급' },
                  { v: b[2], strong: true }, { v: t1.pointOf[b[2]], num: true }]; });
        var rows2 = [];
        for (var g = 1; g <= 9; g++)
          rows2.push([{ v: g, grade: g }, { v: t2.gradeConv[g - 1], num: true }]);
        return [
          { title: '유형1 — 변환등급 배점 (공통 · 일반선택 전체)',
            head: ['석차등급', '변환등급', '배점'], rows: rows1 },
          { title: '유형2 — 석차등급 배점 (우수 10과목만)',
            head: ['석차등급', '배점'], rows: rows2 }
        ];
      }
    },

    /* ────────── 연세대학교 서울캠퍼스 · 학생부교과전형[추천형] 정량평가 ────────── */
    yonsei: {
      id: 'yonsei', name: '연세대학교', short: '연세대',
      types: '학생부교과전형[추천형] 정량평가',
      target: '전 과목 반영 (반영과목 A · B로 구분)',
      formula: '반영과목 A(공통 30% + 일반선택 50% + 진로선택 20%) − 반영과목 B 감점(최대 5점)',
      ratioNote: '학년별 비율 미적용 · 전 과목 반영',
      rawNote: '공통·일반선택은 등급점수 50% + Z점수 환산점수 50%, 진로선택(전문교과 포함)은 A 20 · B 15 · C 10',
      mode: 'yonsei',
      scaleMax: 100,
      trunc: null,
      round: 4,
      excludeCommon: false,
      /* 반영과목 A 교과. 나머지는 전부 반영과목 B로 가고 감점 산정에만 쓰인다 */
      areas: ['국어', '수학', '영어', '사회', '과학', '체예', '기타'],
      areasA: ['국어', '수학', '영어', '사회', '과학'],
      areaNote: '반영과목 A — 국어 · 수학 · 영어 · 사회(한국사 · 역사 · 도덕 포함) · 과학 / 반영과목 B — 그 외 전 과목(감점)',
      groupWeight: { common: 0.3, general: 0.5, career: 1.0 },
      /* 진로선택 A20/B15/C10은 이미 100점 중 20점 척도라 가중치 1.0 */
      gradeConv: [100, 95, 87.5, 75, 60, 40, 25, 12.5, 5],
      penaltyMax: 5,
      equivScale: null,

      detail: [
        { h: '등급점수', get: function (it) { return it.ysGradeScore; } },
        { h: 'Z점수', get: function (it) {
            return it.ysZ === null || it.ysZ === undefined ? null : it.ysZ.toFixed(3); } },
        { h: '석차백분율', get: function (it) {
            return it.ysPct === null || it.ysPct === undefined ? null
                 : it.ysPct.toFixed(4) + (it.ysCapped ? ' (상한)' : ''); } },
        { h: 'Z환산', get: function (it) {
            return it.ysZScore === null || it.ysZScore === undefined ? null
                 : Math.round(it.ysZScore * 100) / 100; } }
      ],

      convert: function (it, spec) {
        var cur = lookupSubject(it.subject);
        var inA = spec.areasA.indexOf(it.area) >= 0;

        /* 반영과목 B — 점수 산출이 아니라 감점 판정에만 쓴다.
           등급·성취도로 표기되지 않은 과목(이수/미이수 등)은 아예 반영하지 않는다. */
        if (!inA) {
          var hasG = it.grade >= 1 && it.grade <= 9;
          var hasA = /^[A-E]$/.test(it.ach || '');
          if (!hasG && !hasA) { it.reason = '등급·성취도 미표기 (반영하지 않음)'; return; }
          it.ysGroup = 'B';
          it.use = 0;
          it.basis = '반영과목 B' +
            (it.grade === 9 ? ' · 9등급 감점' : (it.ach === 'C' && !hasG) ? ' · 성취도 C 감점' : '');
          return;
        }

        /* 전문교과(교육과정 표에 없는 과목)는 진로선택으로 분류한다 (요강 명시) */
        var group = cur ? (cur.curr === 'common' ? 'common'
                        : cur.curr === 'general' ? 'general' : 'career')
                        : 'career';

        if (group === 'career') {
          var five = !cur;                       // 전문교과는 5단계 평가로 본다
          var abc = yonseiCareerABC(it.rec, five);
          if (!abc) { it.reason = '등급·원점수·성취도 없음'; return; }
          it.ysGroup = 'career';
          it.convGrade = abc.abc;
          it.use = abc.point;
          it.basis = abc.basis + ' → ' + abc.abc;
          return;
        }

        /* 공통 · 일반선택 — 등급점수 50% + Z환산점수 50% */
        if (!(it.grade >= 1 && it.grade <= 9)) {
          it.reason = '석차등급 없음 (등급점수·Z점수 산출 불가)';
          if (it.ach) it.warn = (it.warn ? it.warn + ' / ' : '') +
            '성취도만 기재된 반영교과 과목입니다 — 요강에 처리 규정이 없어 뺐습니다';
          return;
        }
        it.ysGradeScore = spec.gradeConv[it.grade - 1];
        var z = zScore(it.rec);
        if (z === null) {
          it.reason = 'Z점수 산출 불가 (원점수 · 평균 · 표준편차 필요)';
          return;
        }
        it.ysZ = Math.round(z * 1000) / 1000;
        var pct = ysPercentile(z);
        var cap = (it.grade >= 1 && it.grade <= GRADE_PCT_CAP.length)
                ? GRADE_PCT_CAP[it.grade - 1] : null;
        if (cap !== null && pct > cap) { it.ysPct = cap; it.ysCapped = true; it.ysPctRaw = pct; }
        else { it.ysPct = pct; it.ysCapped = false; it.ysPctRaw = pct; }
        it.ysZScore = 100 * (1 - it.ysPct);
        it.ysGroup = group;
        it.use = it.ysGradeScore * 0.5 + it.ysZScore * 0.5;
        it.basis = it.grade + '등급 ' + it.ysGradeScore + ' × 50% + Z환산 ' +
                   (Math.round(it.ysZScore * 100) / 100) + ' × 50%';
      },

      specTables: function (sp) {
        var rows = [];
        for (var g = 1; g <= 9; g++)
          rows.push([{ v: g, grade: g }, { v: sp.gradeConv[g - 1], num: true },
                     { v: g <= 8 ? GRADE_PCT_CAP[g - 1] : '—' }]);
        return [
          { title: '반영과목 A 배점',
            head: ['구분', '반영 교과', '배점'],
            rows: [
              [{ v: '공통과목' }, { v: '국 · 수 · 영 · 사 · 과' }, { v: '30%' }],
              [{ v: '일반선택과목' }, { v: '국 · 수 · 영 · 사 · 과' }, { v: '50%' }],
              [{ v: '진로선택과목 (전문교과 포함)' }, { v: '국 · 수 · 영 · 사 · 과' }, { v: '20%' }],
              [{ v: '반영과목 B', strong: true }, { v: 'A를 제외한 기타 과목' }, { v: '최대 5점 감점' }]
            ] },
          { title: '등급점수 · 석차백분율 상한',
            head: ['교과등급', '등급점수', '석차백분율 상한'], rows: rows },
          { title: '진로선택(전문교과 포함) A/B/C — 두 기준 중 높은 점수',
            head: ['구분', 'A (20점)', 'B (15점)', 'C (10점)'],
            rows: [
              [{ v: '등급 기준' }, { v: '1~3등급' }, { v: '4~6등급' }, { v: '7~9등급' }],
              [{ v: '원점수 기준' }, { v: '80점 이상' }, { v: '60 이상 80 미만' }, { v: '60점 미만' }]
            ] }
        ];
      }
    },

/* ────────── 건국대학교 · 학생부 교과 (전 학년 · 석차등급 · 이수단위) ────────── */
    konkuk: {
      id: 'konkuk', name: '건국대학교', short: '건국대',
      types: '학생부교과 (인문 · 자연 · 예체능 · KU자유전공학부)',
      target: '졸업예정자 및 졸업자 모두 3학년 1학기까지의 성적을 반영',
      formula: 'Σ(반영과목 기준점수 × 이수단위) ÷ Σ(반영과목 이수단위) × 100',
      ratioNote: '전 학년 반영 · 학년별 가중치 없음 · 일반 · 공통 · 진로선택을 구분하지 않음',
      rawNote: '기준점수는 1등급 10 · 2등급 9.5 · 3등급 9 · 4등급 8.5 · 5등급 8 · 6등급 7 · 7등급 6 · 8등급 4 · 9등급 0',
      mode: 'pooled',
      scaleMax: 1000,
      trunc: null,
      round: 4,
      excludeCommon: false,
      careerAreaLimited: true,
      gradeConv: [10, 9.5, 9, 8.5, 8, 7, 6, 4, 0],
      scoreMul: 100,                 // 가중평균(0~10)에 100을 곱해 1,000점 척도로
      /* 반영 이수단위가 70단위 이하면 점수를 깎는다 (요강) */
      creditFloor: { units: 70, coef: 0.96, per: 0.002 },
      /* 환산등급 상당치는 100을 곱하기 전 가중평균(기준점수 척도)으로 낸다 */
      equivScale: [10, 9.5, 9, 8.5, 8, 7, 6, 4, 0],
      equivFrom: function (out) { return out.base; },

      variants: [
        { key: 'inmun', label: '인문계 · 예체능계',
          areas: ['국어', '영어', '수학', '사회'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 사회(역사 / 도덕 포함) 교과군 전 과목' },
        { key: 'jayeon', label: '자연계',
          areas: ['국어', '영어', '수학', '과학'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 과학 교과군 전 과목 (한국사 외 사회 미반영)' },
        { key: 'ku', label: '광역제 (KU자유전공학부)',
          areas: ['국어', '영어', '수학', '사회', '과학'],
          areaNote: '인문계 반영 성적(A)과 자연계 반영 성적(B) 중 우수한 쪽을 반영',
          bestOf: ['inmun', 'jayeon'] }
      ],

      /* 한국사는 계열과 무관하게 반영한다. 나이스 교과 열에서도 교육과정 표에서도
         한국사는 사회 교과군으로 잡히므로, 자연계에서 사회를 뺄 때 따로 살려 둔다. */
      areaOk: function (it, spec) {
        if (it.group === '한국사' || normSubj(it.subject) === '한국사') return true;
        return spec.areas.indexOf(it.area) >= 0;
      },

      detail: [
        { h: '적용 등급', get: function (it) { return it.convGrade; } },
        { h: '기준점수', get: function (it) { return it.use; } }
      ],

      convert: function (it, spec) {
        var g = null;
        if (it.kind === 'career') {
          /* 성취도만 산출되는 공통 · 일반선택 과목(과학탐구실험 등)은 요강이
             변환 방법을 정하지 않았다 — 진로선택 규정을 끌어 쓰지 않고 뺀다. */
          if (it.curr === 'common' || it.curr === 'general') {
            it.reason = '성취도만 산출되는 ' +
              (it.curr === 'common' ? '공통' : '일반선택') + '과목 (요강 미규정)';
            return;
          }
          if (it.ach === 'A') {
            g = 1;
            it.basis = '성취도 A → 1등급';
          } else if (it.ach === 'B' || it.ach === 'C') {
            var d = it.rec.dist;
            if (!d) {
              it.reason = '성취도별 학생비율 없음';
              it.warn = (it.warn ? it.warn + ' / ' : '') +
                '진로선택 성취도 ' + it.ach + '는 성취도별 학생비율로 등급을 매기는데 ' +
                '생기부에 비율이 없어 반영하지 못했습니다';
              return;
            }
            var pct = it.ach === 'B' ? (d.B || 0) + (d.C || 0) : (d.C || 0);
            g = kuRatioGrade(pct);
            it.ratioPct = pct;
            it.basis = '성취도 ' + it.ach + ' · 등급비율 ' +
                       (Math.round(pct * 10) / 10) + '% → ' + g + '등급';
          } else {
            it.reason = '성취도 ' + it.ach + ' 환산 기준 없음';
            it.warn = (it.warn ? it.warn + ' / ' : '') +
              '요강은 진로선택 성취도를 A · B · C로만 규정합니다 — 확인 필요';
            return;
          }
        } else {
          if (!(it.grade >= 1 && it.grade <= 9)) { it.reason = '석차등급 없음'; return; }
          g = it.grade;
          it.basis = g + '등급';
        }
        it.convGrade = g;
        it.use = spec.gradeConv[g - 1];
      },

      specTables: function (sp) {
        var rows = [];
        for (var g = 1; g <= 9; g++)
          rows.push([{ v: g, grade: g }, { v: sp.gradeConv[g - 1], num: true }]);
        var RLABEL = ['100% 이상', '96% 이상 ~ 100% 미만', '89% 이상 ~ 96% 미만',
                      '77% 이상 ~ 89% 미만', '60% 이상 ~ 77% 미만', '40% 이상 ~ 60% 미만',
                      '23% 이상 ~ 40% 미만', '11% 이상 ~ 23% 미만', '11% 미만'];
        return [
          { title: '등급별 기준점수', head: ['석차등급', '기준점수'], rows: rows },
          { title: '계열별 반영교과',
            head: ['계열', '국어', '영어', '수학', '한국사', '사회', '과학'],
            rows: [
              [{ v: '인문계 · 예체능계', strong: sp.variantKey === 'inmun' },
               { v: '○' }, { v: '○' }, { v: '○' }, { v: '○' }, { v: '○' }, { v: '–' }],
              [{ v: '자연계', strong: sp.variantKey === 'jayeon' },
               { v: '○' }, { v: '○' }, { v: '○' }, { v: '○' }, { v: '–' }, { v: '○' }],
              [{ v: '광역제 (KU자유전공학부)', strong: sp.variantKey === 'ku' },
               { v: '인문계 성적(A)과 자연계 성적(B) 중 우수한 쪽', span: 6 }]
            ] },
          { title: '진로선택 — 성취도별 등급비율로 석차등급 부여',
            head: ['성취도', '등급비율'],
            rows: [
              [{ v: 'A', strong: true }, { v: '학생비율과 관계없이 1등급' }],
              [{ v: 'B', strong: true }, { v: 'B의 학생비율 + C의 학생비율' }],
              [{ v: 'C', strong: true }, { v: 'C의 학생비율' }]
            ] },
          { title: '등급비율에 따른 석차등급',
            head: ['등급비율', '석차등급'],
            rows: RLABEL.map(function (t, i) {
              return [{ v: t }, { v: i + 1, grade: i + 1 }]; }) },
          { title: '이수단위 ' + sp.creditFloor.units + '단위 이하일 때 감점',
            head: ['반영 이수단위', '적용 계수'],
            rows: [70, 60, 50, 40, 30].map(function (u) {
              return [{ v: u + '단위' },
                      { v: '× ' + (sp.creditFloor.coef -
                           (sp.creditFloor.units - u) * sp.creditFloor.per).toFixed(3) }];
            }).concat([[{ v: '71단위 이상' }, { v: '감점 없음 (× 1)' }]]) }
        ];
      }
    }
  };

  /* ═══════════════ 규격 확정 ═══════════════
     계열·전형에 따라 반영교과와 가중치가 달라지는 대학이 있어,
     선택한 변형(variant)을 규격 위에 덮어 하나의 평면 규격으로 만든다. */
  function resolve(univId, variantKey) {
    var base = UNIVS[univId] || UNIVS.hufs;
    if (!base.variants || !base.variants.length) return base;
    var v = null;
    for (var i = 0; i < base.variants.length; i++)
      if (base.variants[i].key === variantKey) v = base.variants[i];
    if (!v) v = base.variants[0];
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(v).forEach(function (k) {
      if (k !== 'key' && k !== 'label') out[k] = v[k];
    });
    out.variant = v;
    out.variantKey = v.key;
    out.types = base.types + ' — ' + v.label;
    return out;
  }

  /* ═══════════════ 과목 1건 평가 ═══════════════
     opt: { semFrom, semTo, kindOverride:{과목명:'general'|'career'|'skip'},
            areaOverride:{과목명:'국어'|…} } */
  function evalRecord(rec, spec, opt) {
    opt = opt || {};
    var ao = (opt.areaOverride || {})[rec.subject];
    var a = ao ? { area: ao, guess: false, byCat: null, byCur: null }
               : areaOf(rec.category, rec.subject);
    var cur = lookupSubject(rec.subject);
    var ko = (opt.kindOverride || {})[rec.subject];
    var eff = effectiveKind(rec, cur);
    var kind = ko || eff.kind;

    var it = {
      rec: rec, subject: rec.subject, category: rec.category,
      year: rec.year, sem: rec.sem, credit: rec.credit || 0,
      grade: rec.grade, raw: rec.raw, ach: rec.ach,
      area: a.area, areaGuess: a.guess, kind: kind,
      curr: cur ? cur.curr : null, group: cur ? cur.group : null,
      autoLabel: currLabel(rec.subject),
      common: isCommon(rec.subject, spec.commonSubjects),
      gConv: null, rConv: null, aConv: null, convGrade: null,
      use: null, basis: '', included: false, reason: '', warn: ''
    };
    function addWarn(w) { it.warn = it.warn ? it.warn + ' / ' + w : w; }

    /* 교육과정 표가 기대하는 자료와 생기부 기재값이 어긋나면 확인 대상으로 표시 */
    if (!ko && eff.mismatch) {
      var wantTxt = cur.expect === 'grade' ? '석차등급' : cur.expect === 'ach' ? '성취도' : '이수(P)';
      addWarn('교육과정상 ' + currLabel(rec.subject).replace(/^2015 /, '') +
              '이라 ' + wantTxt + '이 나와야 하는데 생기부에는 ' +
              (kind === 'general' ? '석차등급' : kind === 'career' ? '성취도' : '이수(P)') +
              '이 기재돼 있습니다 — 기재값대로 처리했습니다');
    }
    if (!ao && a.byCat && a.byCur && a.byCat !== a.byCur)
      addWarn('나이스 교과("' + rec.category + '" → ' + a.byCat + ')와 교육과정 표(' + a.byCur +
              ')가 다릅니다 — 나이스 교과를 따랐습니다');
    if (a.guess)
      addWarn('교과' + (String(rec.category || '').trim() ? '("' + rec.category + '")' : ' 미기재') +
              '와 교육과정 표 어디에도 없어 과목명으로 추론했습니다');

    var sv = semVal(rec);
    if (sv === null) { it.reason = '학년·학기 미상'; return it; }
    if (opt.semFrom && sv < opt.semFrom) { it.reason = '반영 학기 밖'; return it; }
    if (opt.semTo && sv > opt.semTo) { it.reason = '반영 학기 밖'; return it; }

    if (kind === 'skip') { it.reason = '수동 제외'; return it; }
    if (kind === 'pass') { it.reason = '이수(P) 과목'; return it; }
    /* 소인수 학교(전남대) — 석차등급 칸이 비어도 원점수·과목평균·표준편차가 있으면
       석차등급산출과목으로 보고 Z점수로 등급을 매긴다. 규격의 convert가 실제 변환을 한다. */
    if (kind === 'none' && spec.zToGrade && !ko &&
        (!cur || cur.expect === 'grade') && zScore(rec) !== null) { it.kind = kind = 'general'; }
    if (kind === 'none') { it.reason = '등급·성취도 없음'; return it; }
    if (spec.excludeCommon && it.common) { it.reason = '공통과목 미반영'; return it; }

    /* 진로선택에 석차등급이 기재되면 석차등급산출과목으로 반영하는 규격(전남대) */
    if (kind === 'career' && spec.careerWithGradeToGeneral &&
        rec.grade >= 1 && rec.grade <= 9) { it.kind = kind = 'general'; }

    /* 반영교과 판정 — 규격이 areaOk를 주면 그것을 쓴다
       (전남대는 제2외국어/한문 교과군을 인문대학 모집단위에만 더한다) */
    var areaOk = spec.areaOk ? spec.areaOk(it, spec) : spec.areas.indexOf(it.area) >= 0;
    if (kind === 'career' && spec.careerAreaLimited === false) areaOk = true;
    if (!areaOk) { it.reason = '반영교과 아님 (' + it.area + ')'; return it; }
    if (!(it.credit > 0)) { it.reason = '학점 0'; return it; }

    spec.convert(it, spec);
    if (it.reason) return it;
    if (it.use === null || it.use === undefined) { it.reason = '환산 불가'; return it; }
    it.included = true;
    return it;
  }

  /* ═══════════════ Z점수 계열 유틸 (연세대) ═══════════════
     생기부의 원점수 / 과목평균(표준편차)에서 Z점수를 내고,
     표준정규분포로 석차백분율(상위 누적비율)을 구한 뒤 환산점수로 바꾼다.
       Z            = (원점수 − 과목평균) ÷ 표준편차
       석차백분율   = 1 − Φ(Z)
       환산점수     = 100 × (1 − 석차백분율)
     단, Z로 산출한 석차백분율이 그 과목 석차등급의 백분율 상한을 넘으면 상한값을 쓴다. */

  /* 오차함수 (Abramowitz–Stegun 7.1.26, 오차 ~1.5e-7) */
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, pp = 0.3275911;
    var t = 1 / (1 + pp * x);
    var y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }
  function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  /* 석차백분율 = 나보다 위에 있는 비율 */
  function zToPercentile(z) {
    if (z === null || z === undefined || !isFinite(z)) return null;
    return 1 - normCdf(z);
  }
  function zScore(rec) {
    if (rec.raw === null || rec.avg === null || rec.std === null) return null;
    if (!(rec.std > 0)) return null;
    return (rec.raw - rec.avg) / rec.std;
  }
  /* 9등급제 누적비율 — 요강의 「교과등급별 석차백분율」 표와 같다 (9등급은 상한 없음) */
  var GRADE_PCT_CAP = [0.04, 0.11, 0.23, 0.40, 0.60, 0.77, 0.89, 0.96];
  /* Z로 낸 석차백분율에 등급 상한을 씌운다 → {pct, capped} */
  function cappedPercentile(z, grade) {
    var pct = zToPercentile(z);
    if (pct === null) return { pct: null, capped: false, raw: null };
    var cap = (grade >= 1 && grade <= GRADE_PCT_CAP.length) ? GRADE_PCT_CAP[grade - 1] : null;
    if (cap !== null && pct > cap) return { pct: cap, capped: true, raw: pct };
    return { pct: pct, capped: false, raw: pct };
  }
  function pctToScore(pct) { return pct === null ? null : 100 * (1 - pct); }

  /* 진로선택(전문교과 포함) A/B/C 판정 — 등급 기준과 원점수 기준 중 높은 점수를 쓴다.
       등급 기준   1~3등급 A · 4~6등급 B · 7~9등급 C
       원점수 기준 80점 이상 A · 60점 이상 80점 미만 B · 60점 미만 C
       점수        A 20 · B 15 · C 10
     성취도만 있는 과목은 3단계 A/B/C를 그대로, 5단계는 A·B→A, C·D→B, E→C로 접는다. */
  var YS_ABC_POINT = { A: 20, B: 15, C: 10 };
  function abcByGrade(g) {
    if (!(g >= 1 && g <= 9)) return null;
    return g <= 3 ? 'A' : g <= 6 ? 'B' : 'C';
  }
  function abcByRaw(raw) {
    if (raw === null || raw === undefined) return null;
    return raw >= 80 ? 'A' : raw >= 60 ? 'B' : 'C';
  }
  function abcByAch(ach, fiveLevel) {
    if (!/^[A-E]$/.test(ach || '')) return null;
    if (!fiveLevel) return /^[ABC]$/.test(ach) ? ach : null;
    return (ach === 'A' || ach === 'B') ? 'A' : (ach === 'C' || ach === 'D') ? 'B' : 'C';
  }
  /* → {abc, point, byGrade, byRaw, byAch, basis} 중 가장 높은 점수를 채택 */
  function yonseiCareerABC(rec, fiveLevel) {
    var cands = [];
    var g = abcByGrade(rec.grade);
    if (g) cands.push({ abc: g, basis: '등급 기준' });
    var r = abcByRaw(rec.raw);
    if (r) cands.push({ abc: r, basis: '원점수 기준' });
    /* 등급이 표기되지 않은 과목은 성취도로 판정한다 */
    if (!g) {
      var a = abcByAch(rec.ach, fiveLevel);
      if (a) cands.push({ abc: a, basis: fiveLevel ? '성취도(5단계)' : '성취도' });
    }
    if (!cands.length) return null;
    var best = null;
    cands.forEach(function (c) {
      c.point = YS_ABC_POINT[c.abc];
      if (!best || c.point > best.point) best = c;
    });
    return { abc: best.abc, point: best.point, basis: best.basis, candidates: cands };
  }

  /* 요강이 실은 Z점수 → 석차백분율 표 (0.1 단위, Z=3.0부터 -3.0까지 61칸).
     표준정규 상위누적확률과 같은 값이지만, 요강이 표를 명시했으므로 표를 그대로 쓴다. */
  var YS_Z_TABLE = [0.0013, 0.0019, 0.0026, 0.0035, 0.0047, 0.0062, 0.0082, 0.0107, 0.0139, 0.0179, 0.0228, 0.0287, 0.0359, 0.0446, 0.0548, 0.0668, 0.0808, 0.0968, 0.1151, 0.1357, 0.1587, 0.1841, 0.2119, 0.242, 0.2743, 0.3085, 0.3446, 0.3821, 0.4207, 0.4602, 0.5, 0.5398, 0.5793, 0.6179, 0.6554, 0.6915, 0.7257, 0.758, 0.7881, 0.8159, 0.8413, 0.8643, 0.8849, 0.9032, 0.9192, 0.9332, 0.9452, 0.9554, 0.9641, 0.9713, 0.9772, 0.9821, 0.9861, 0.9893, 0.9918, 0.9938, 0.9953, 0.9965, 0.9974, 0.9981, 0.9987];
  /* Z점수 → 석차백분율. Z는 소수 셋째 자리 반올림, ±3.0 밖은 ±3.0으로 간주,
     표 조회는 0.1 단위로 반올림한다(요강에 조회 방법 명시가 없어 최근접 값을 쓴다). */
  /* 0.5는 절댓값 기준으로 올린다 (1.25 → 1.3, -1.25 → -1.3).
     자바스크립트 Math.round는 -1.25를 -1.2로 올려 음수에서 비대칭이 된다. */
  function roundHalfUp(v, scale) {
    var sign = v < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(v) * scale) / scale;
  }
  function ysPercentile(z) {
    if (z === null || z === undefined || !isFinite(z)) return null;
    var zz = roundHalfUp(z, 1000);             // 요강: Z는 소수 셋째 자리 반올림
    if (zz > 3) zz = 3;
    if (zz < -3) zz = -3;
    var z1 = roundHalfUp(zz, 10);              // 표가 0.1 단위라 최근접 칸으로
    var idx = Math.round((3 - z1) * 10);
    return YS_Z_TABLE[Math.max(0, Math.min(YS_Z_TABLE.length - 1, idx))];
  }

  /* ═══════════════ Z점수 → 석차등급 (전남대 소인수 학교) ═══════════════
     학년 인원이 적어 석차등급이 산출되지 않는 학교는 원점수·과목평균·표준편차로
     Z점수를 내고 아래 구간표로 석차등급을 매긴다 (요강 명시).
     [하한 Z, 등급] — 위에서부터 처음 만족하는 칸, 어디에도 안 걸리면 9등급. */
  var CNU_Z_GRADE = [
    [1.76, 1], [1.23, 2], [0.74, 3], [0.26, 4],
    [-0.25, 5], [-0.73, 6], [-1.22, 7], [-1.75, 8]
  ];
  function cnuZGrade(z) {
    if (z === null || z === undefined || !isFinite(z)) return null;
    var zz = roundHalfUp(z, 100);            // 구간 경계가 소수 둘째 자리
    for (var i = 0; i < CNU_Z_GRADE.length; i++)
      if (zz >= CNU_Z_GRADE[i][0]) return CNU_Z_GRADE[i][1];
    return 9;
  }

  /* ═══════════════ 등급비율 → 석차등급 (건국대 진로선택) ═══════════════
     진로선택 과목은 생기부의 성취도별 학생비율로 석차등급을 매긴다 (요강 명시).
       성취도 A → 학생비율과 관계없이 1등급
       성취도 B → 등급비율 = B의 학생비율 + C의 학생비율
       성취도 C → 등급비율 = C의 학생비율
     등급비율은 「나보다 아래(같은 등급 포함)에 있는 누적 비율」이라 값이 클수록 상위다.
     [하한 %, 등급] — 위에서부터 처음 만족하는 칸. */
  var KU_RATIO_GRADE = [
    [100, 1], [96, 2], [89, 3], [77, 4], [60, 5], [40, 6], [23, 7], [11, 8], [4, 9]
  ];
  function kuRatioGrade(pct) {
    if (pct === null || pct === undefined || !isFinite(pct)) return null;
    for (var i = 0; i < KU_RATIO_GRADE.length; i++)
      if (pct >= KU_RATIO_GRADE[i][0]) return KU_RATIO_GRADE[i][1];
    return 9;                                // 4% 미만도 최하 구간과 같이 9등급
  }

  /* ═══════════════ 체육·예술 교과 성취도 평균 ═══════════════
     교과 점수에는 안 들어가지만 동점자 처리에 쓰이는 보조 지표다.
     (가천대 동점자 처리 1단계 — 성취도 배점 A 3점 · B 2점 · C 1점)
     반영 학기 범위는 교과 점수와 같게 보되, 반영교과가 아니라는 이유로 빠진 것은 그대로 센다. */
  var ARTS_PE_POINT = { A: 3, B: 2, C: 1 };
  var OUT_OF_SCOPE = ['반영 학기 밖', '학년·학기 미상', '수동 제외'];
  function computeArtsPe(items) {
    var picked = items.filter(function (it) {
      if (it.area !== '체예') return false;
      if (OUT_OF_SCOPE.indexOf(it.reason) >= 0) return false;
      return ARTS_PE_POINT[it.ach] !== undefined;
    });
    var sum = 0, cSum = 0, cr = 0, dist = { A: 0, B: 0, C: 0 };
    picked.forEach(function (it) {
      var p = ARTS_PE_POINT[it.ach];
      sum += p; dist[it.ach]++;
      cSum += p * (it.credit || 0); cr += it.credit || 0;
    });
    return {
      items: picked, count: picked.length, credits: cr, dist: dist,
      avg: picked.length ? sum / picked.length : null,          // 과목 단위 평균 (요강 문언)
      avgByCredit: cr > 0 ? cSum / cr : null                    // 이수단위 가중 평균 (참고)
    };
  }

  /* ═══════════════ 학생 1명 · 대학 1곳 산출 ═══════════════ */
  function computeUniv(records, spec, opt) {
    /* 반영교과가 통째로 다른 두 산출을 각각 내고 유리한 쪽을 채택한다
       (건국대 광역제 — 인문계 반영 성적 A와 자연계 반영 성적 B 중 우수한 성적).
       배점만 갈리는 'best' 모드와 달리 반영과목 자체가 달라 규격째 다시 계산한다. */
    if (spec.bestOf && spec.bestOf.length) {
      var subs = spec.bestOf.map(function (k) {
        var sp = resolve(spec.id, k);
        var o = computeUniv(records, sp, opt);
        o.key = k; o.label = sp.variant.label; o.subSpec = sp;
        return o;
      });
      var bestSub = null;
      subs.forEach(function (o) {
        if (o.score !== null && (!bestSub || o.score > bestSub.score)) bestSub = o;
      });
      subs.forEach(function (o) { o.chosen = !!(bestSub && o.key === bestSub.key); });
      var pick = bestSub || subs[0];
      var merged = {};
      Object.keys(pick).forEach(function (k) { merged[k] = pick[k]; });
      merged.subs = subs;
      merged.bestKey = bestSub ? bestSub.key : null;
      merged.bestLabel = bestSub ? bestSub.label : null;
      return merged;
    }

    /* 전남대 소인수 학교 규정은 「전 과목에서 석차등급이 없고 표준편차가 표기된 경우」다.
       한 과목이라도 석차등급이 있으면 일반 학교이므로, 석차등급 없는 소인수·공동교육과정
       과목은 요강대로 그냥 반영하지 않는다 (Z 변환을 쓰지 않는다). */
    var zSchool = false;
    if (spec.zToGrade) {
      var anyGrade = records.some(function (r) { return r.grade >= 1 && r.grade <= 9; });
      zSchool = !anyGrade;
      if (anyGrade) {
        var s2 = {};
        Object.keys(spec).forEach(function (k) { s2[k] = spec[k]; });
        s2.zToGrade = false;
        spec = s2;
      }
    }
    var items = records.map(function (r) { return evalRecord(r, spec, opt); });
    var inc = items.filter(function (it) { return it.included; });
    var out = {
      items: items, included: inc,
      excluded: items.filter(function (it) { return !it.included; }),
      warns: items.filter(function (it) { return it.warn; }),
      groups: null, renormalized: false,
      zSchool: zSchool,
      artsPe: computeArtsPe(items)
    };

    if (spec.mode === 'yonsei') {
      /* 반영과목 A — 공통 30% + 일반선택 50% + 진로선택 20%(A20/B15/C10 척도 그대로).
         공통·일반선택 과목점수 = 등급점수 50% + Z환산점수 50%.
         반영과목 B — A를 뺀 기타 과목. 9등급 또는 성취도 C인 이수단위 비율 × 5를 감점. */
      function pool(key) {
        return inc.filter(function (it) { return it.ysGroup === key; });
      }
      function wavg(list) {
        var n = 0, d = 0;
        list.forEach(function (it) { n += it.credit * it.use; d += it.credit; });
        return { items: list, credits: d, weighted: n, avg: d > 0 ? n / d : null };
      }
      var gCommon = wavg(pool('common'));
      var gGeneral = wavg(pool('general'));
      var gCareer = wavg(pool('career'));
      gCommon.label = '공통과목'; gCommon.weight = spec.groupWeight.common;
      gGeneral.label = '일반선택과목'; gGeneral.weight = spec.groupWeight.general;
      gCareer.label = '진로선택과목 (전문교과 포함)'; gCareer.weight = spec.groupWeight.career;
      var groups = [gCommon, gGeneral, gCareer];
      groups.forEach(function (g) {
        g.contrib = g.avg === null ? null : g.avg * g.weight;
      });

      /* 세 영역 중 하나라도 산출 불가면 요강상 비교평가 대상이다 */
      var missing = groups.filter(function (g) { return g.avg === null; });
      var scoreA = missing.length ? null
                 : groups.reduce(function (t, g) { return t + g.contrib; }, 0);

      /* 반영과목 B 감점 — 등급·성취도로 표기되지 않은 과목은 분모에서도 뺀다 */
      var bAll = items.filter(function (it) { return it.ysGroup === 'B'; });
      var bCr = 0, bBadCr = 0, bBad = [];
      bAll.forEach(function (it) {
        bCr += it.credit;
        if (it.grade === 9 || (it.ach === 'C' && !(it.grade >= 1 && it.grade <= 9))) {
          bBadCr += it.credit; bBad.push(it);
        }
      });
      var penalty = bCr > 0 ? bBadCr / bCr * spec.penaltyMax : 0;

      out.groups = groups;
      out.missingGroups = missing;
      out.compare = missing.length > 0;
      out.scoreA = scoreA;
      out.bItems = bAll; out.bCredits = bCr;
      out.bBadItems = bBad; out.bBadCredits = bBadCr;
      out.penalty = penalty;
      out.credits = groups.reduce(function (t, g) { return t + g.credits; }, 0);
      out.weighted = groups.reduce(function (t, g) { return t + g.weighted; }, 0);
      out.score = scoreA === null ? null : scoreA - penalty;
      if (spec.round && out.score !== null) out.score = roundTo(out.score, spec.round);
    } else if (spec.mode === 'best') {
      /* 여러 산출 유형을 각각 계산해 유리한(높은) 쪽을 채택한다.
         과목별 유형별 배점은 convert()가 it.altUse에 미리 담아 둔다. */
      var pool = inc.filter(function (it) { return it.kind !== 'career'; });
      var alts = spec.alternatives.map(function (alt) {
        var cand = pool.filter(function (it) {
          return it.altUse && it.altUse[alt.key] !== undefined && it.altUse[alt.key] !== null;
        });
        var picked = cand;
        if (alt.topN) {
          /* 석차등급이 우수한 상위 N과목. 등급이 같으면 이수단위가 큰 과목을 먼저 담는다
             (요강 미규정 구간 — 등급이 같으면 배점도 같아 순서가 평균에 영향을 준다). */
          picked = cand.slice().sort(function (a, b) {
            return a.grade - b.grade || b.credit - a.credit;
          }).slice(0, alt.topN);
        }
        var pk = {};
        picked.forEach(function (it) { pk[it.subject + '|' + it.year + '-' + it.sem] = 1; });
        cand.forEach(function (it) {
          it.altTop = it.altTop || {};
          it.altTop[alt.key] = !!pk[it.subject + '|' + it.year + '-' + it.sem];
        });
        var n = 0, d = 0;
        picked.forEach(function (it) { n += it.credit * it.altUse[alt.key]; d += it.credit; });
        return { key: alt.key, label: alt.label, note: alt.note, topN: alt.topN || null,
                 items: picked, candidates: cand.length,
                 credits: d, weighted: n, avg: d > 0 ? n / d : null };
      });
      var live = alts.filter(function (a) { return a.avg !== null; });
      var best = null;
      live.forEach(function (a) { if (!best || a.avg > best.avg) best = a; });
      alts.forEach(function (a) { a.chosen = !!(best && a.key === best.key); });
      out.alts = alts;
      out.best = best;
      out.bestKey = best ? best.key : null;
      out.credits = best ? best.credits : 0;
      out.weighted = best ? best.weighted : 0;
      out.score = best ? best.avg : null;
      if (spec.round && out.score !== null) out.score = roundTo(out.score, spec.round);
    } else if (spec.mode === 'base') {
      /* 석차등급산출과목 — 기본점수 + (이수단위 가중평균 등급점수 × 계수) */
      var gi = inc.filter(function (it) { return it.kind !== 'career'; });
      var gn = 0, gd = 0;
      gi.forEach(function (it) { gn += it.credit * it.use; gd += it.credit; });
      var gAvg = gd > 0 ? gn / gd : null;
      var gReal = gAvg === null ? null : round3(gAvg * spec.coef);   // 실질점수
      var gScore = gAvg === null ? null : spec.basePoints + gReal;

      /* 진로선택 — 성취도 등급점수가 높은 상위 N과목의 합 ÷ N.
         N과목 미만이면 석차등급산출과목 실질점수로 비교내신을 적용한다. */
      var ci = inc.filter(function (it) { return it.kind === 'career'; })
                  .slice().sort(function (a, b) { return b.use - a.use; });
      var top = ci.slice(0, spec.careerTopN);
      var cScore = null, compare = false;
      if (ci.length >= spec.careerTopN) {
        var cs = 0;
        top.forEach(function (it) { cs += it.use; });
        /* 요강 산식: (상위 N과목 등급점수의 합 ÷ N) × 전형별 계수, 소수 넷째 자리에서 반올림 */
        cScore = round3(cs / spec.careerTopN * (spec.careerCoef === undefined ? 1 : spec.careerCoef));
      } else {
        compare = true;
        cScore = gReal === null ? null
               : Math.max(round2(gReal * spec.compareCoef), spec.compareMin);
      }

      /* 출결 — 생기부 교과학습발달상황에는 출결 자료가 없어 결석 0일(만점)로 둔다.
         전원 같은 값이라 석차는 달라지지 않지만, 총점은 요강 만점과 맞는다. */
      var att = spec.attend || null;
      var attScore = att ? att.base + att.real : null;   // 결석 0일 → 기본 + 실질 만점

      out.generalItems = gi; out.generalAvg = gAvg;
      out.generalReal = gReal; out.generalScore = gScore;
      out.careerItems = ci; out.careerTop = top; out.careerCount = ci.length;
      out.careerScore = cScore; out.careerCompare = compare;
      out.attendScore = attScore; out.attendAssumed = !!att;
      out.credits = gd; out.weighted = gn;
      out.scoreMax = spec.basePoints + spec.realMax + spec.careerMax + (att ? att.base + att.real : 0);
      out.score = (gScore === null || cScore === null) ? null
                : round3(gScore + cScore + (attScore || 0));
    } else if (spec.mode === 'weighted') {
      /* 공통·일반선택 — 교과별로 이수단위 가중평균한 뒤 교과 가중치로 합산.
         이수 과목이 하나도 없는 교과는 가중치에서 빼고 나머지로 재정규화한다
         (요강 미규정 구간 — 공통과목이 있어 실제로는 거의 발생하지 않는다). */
      var W = spec.weights || {};
      var areaGroups = Object.keys(W).map(function (a) {
        var gi = inc.filter(function (it) { return it.kind !== 'career' && it.area === a; });
        var n = 0, d = 0;
        gi.forEach(function (it) { n += it.credit * it.use; d += it.credit; });
        return { key: a, label: a + '교과', weight: W[a], items: gi,
                 credits: d, weighted: n, avg: d > 0 ? n / d : null };
      });
      var liveA = areaGroups.filter(function (g) { return g.avg !== null; });
      var wsumA = 0, accA = 0;
      liveA.forEach(function (g) { wsumA += g.weight; accA += g.avg * g.weight; });
      var genAvg = wsumA > 0 ? accA / wsumA : null;                 // 0~10 척도
      var genScore = genAvg === null ? null : genAvg / 10 * spec.generalPct;

      /* 진로선택 — 교과 구분 없이 한 덩어리. 이수 과목 수가 상한을 정한다. */
      var careerItems = inc.filter(function (it) { return it.kind === 'career'; });
      var cCount = careerItems.length, cap = 0;
      if (spec.careerPct > 0) {
        for (var ci = 0; ci < spec.careerCaps.length; ci++)
          if (cCount >= spec.careerCaps[ci][0]) { cap = spec.careerCaps[ci][1]; break; }
      }
      var cN = 0, cD = 0;
      careerItems.forEach(function (it) { cN += it.credit * it.use; cD += it.credit; });
      var cAvg = cD > 0 ? cN / cD : null;
      var cScore = (cAvg === null || cap === 0) ? 0 : cAvg / 10 * cap;

      out.areaGroups = areaGroups;
      out.generalAvg = genAvg; out.generalScore = genScore;
      out.careerItems = careerItems; out.careerCount = cCount;
      out.careerCap = cap; out.careerAvg = cAvg; out.careerScore = cScore;
      /* 진로선택 상한이 줄면 총점 만점 자체가 내려간다 */
      out.scoreMax = spec.generalPct + cap;
      out.renormalized = liveA.length > 0 && Math.abs(wsumA - 100) > 1e-9;
      out.credits = 0; out.weighted = 0;
      inc.forEach(function (it) { out.credits += it.credit; out.weighted += it.credit * it.use; });
      out.score = genScore === null ? null : genScore + cScore;
      if (spec.trunc) out.score = truncTo(out.score, spec.trunc);
    } else if (spec.mode === 'grouped') {
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
      out.base = spec.trunc ? truncDiv(num, den, spec.trunc) : (den > 0 ? num / den : null);
      out.score = out.base;
      /* 기준점수 가중평균에 척도 배수를 곱한다 (건국대 × 100 → 1,000점 척도) */
      if (spec.scoreMul && out.score !== null) out.score *= spec.scoreMul;
      /* 반영 이수단위가 기준에 못 미치면 계수를 곱해 깎는다.
         요강: 「점수 × 0.96 − (70단위에 미달하는 단위 수 × 0.002)」 —
         0.96과 0.002를 같은 계수로 보고 점수 × {0.96 − 미달단위 × 0.002}로 읽었다. */
      if (spec.creditFloor && out.score !== null) {
        var cf = spec.creditFloor;
        out.creditShort = den <= cf.units ? cf.units - den : 0;
        out.creditCoef = den <= cf.units ? cf.coef - out.creditShort * cf.per : 1;
        if (out.creditCoef < 0) out.creditCoef = 0;
        out.scoreBeforeFloor = out.score;
        out.score *= out.creditCoef;
      }
      /* 이수학점 가산점 — 반영교과 안에서 이수한 모든 과목의 학점 합에 비례한다.
         환산점수를 못 매기는 과목(이수 P 등)도 '이수과목'이라 학점 합에는 들어간다.
         가산점 때문에 총점이 척도 최고점을 넘을 수 있다 (요강 명시). */
      if (spec.bonusPerCredit) {
        var bc = 0;
        items.forEach(function (it) {
          if (OUT_OF_SCOPE.indexOf(it.reason) >= 0) return;
          if (!(spec.areaOk ? spec.areaOk(it, spec) : spec.areas.indexOf(it.area) >= 0)) return;
          if (!(it.credit > 0)) return;
          bc += it.credit;
        });
        out.bonusCredits = bc;
        out.bonus = bc * spec.bonusPerCredit;
        if (out.score !== null) out.score += out.bonus;
      }
      if (spec.round && out.score !== null) out.score = roundTo(out.score, spec.round);
    }
    out.equiv = equivGrade(spec.equivFrom ? spec.equivFrom(out) : out.score, spec);
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
      convCount: { career: {}, general: {} },
      /* weighted 전용 */
      areaGroups: null, generalAvg: null, generalScore: null,
      careerCount: 0, careerCap: 0, careerScore: null, capLoss: 0,
      scoreMax: null, weightSum: 0
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

    if (spec.mode === 'weighted') {
      a.areaGroups = u.areaGroups;
      a.generalAvg = u.generalAvg; a.generalScore = u.generalScore;
      a.careerCount = u.careerCount; a.careerCap = u.careerCap;
      a.careerAvg = u.careerAvg; a.careerScore = u.careerScore;
      a.scoreMax = u.scoreMax;
      /* 진로선택 상한 때문에 잃은 점수 — 3과목 이상이었다면 받을 수 있었던 만점과의 차 */
      a.capLoss = (spec.careerPct || 0) - (u.careerCap || 0);
      /* 교과별 기여도: 가중치 × 평균 ÷ 가중치합 × generalPct/10 */
      var wsum = (u.areaGroups || []).reduce(function (s, g) {
        return s + (g.avg === null ? 0 : g.weight); }, 0);
      (u.areaGroups || []).forEach(function (g) {
        g.contrib = (g.avg === null || !wsum) ? 0
                  : g.avg * g.weight / wsum / 10 * spec.generalPct;
      });
      a.weightSum = wsum;
    } else if (spec.mode === 'pooled') {
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
    UNIVS: UNIVS, COMMON_2015: COMMON_2015, CURRICULUM_2015: CURRICULUM_2015,
    resolve: resolve,
    areaOf: areaOf, kindOf: kindOf, isCommon: isCommon, normSubj: normSubj,
    lookupSubject: lookupSubject, effectiveKind: effectiveKind, currLabel: currLabel,
    fromTable: fromTable, fromBands: fromBands,
    truncDiv: truncDiv, truncTo: truncTo, equivGrade: equivGrade,
    evalRecord: evalRecord, computeUniv: computeUniv, computePlain: computePlain,
    rankList: rankList, verdict: verdict, analyze: analyze, computeAll: computeAll,
    computeArtsPe: computeArtsPe, ARTS_PE_POINT: ARTS_PE_POINT,
    erf: erf, normCdf: normCdf, zScore: zScore, zToPercentile: zToPercentile,
    GRADE_PCT_CAP: GRADE_PCT_CAP, cappedPercentile: cappedPercentile,
    pctToScore: pctToScore, YS_ABC_POINT: YS_ABC_POINT,
    abcByGrade: abcByGrade, abcByRaw: abcByRaw, abcByAch: abcByAch,
    yonseiCareerABC: yonseiCareerABC,
    YS_Z_TABLE: YS_Z_TABLE, ysPercentile: ysPercentile,
    CNU_Z_GRADE: CNU_Z_GRADE, cnuZGrade: cnuZGrade, roundHalfUp: roundHalfUp,
    KU_RATIO_GRADE: KU_RATIO_GRADE, kuRatioGrade: kuRatioGrade
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.UnivCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
