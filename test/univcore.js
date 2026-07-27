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

/* ────────── 전남대학교 · 학생부교과(일반) 일괄선발 ────────── */
    cnu: {
      id: 'cnu', name: '전남대학교', short: '전남대',
      types: '학생부교과(일반) 일괄선발',
      target: '국내 고교 졸업(예정)자 (2027년 2월 졸업예정자 포함)',
      formula: '석차등급산출과목(기본 660 + 실질 최대 225) + 진로선택과목(최대 15) · 출결 100점은 별도',
      ratioNote: '학년별 가중치 없음 · 1학년 1학기 ~ 3학년 1학기 (졸업자도 동일)',
      rawNote: '석차등급은 1등급 100점부터 8등급 65점 · 9등급 0점, 진로선택 성취도는 A 15 · B 9 · C 3',
      mode: 'base',
      scaleMax: 900,                 // 885(석차등급산출) + 15(진로선택). 출결 100점은 별도
      trunc: null,
      excludeCommon: false,
      careerAreaLimited: true,
      /* 진로선택에 석차등급이 기재되면 석차등급산출과목으로 반영한다 (요강 명시) */
      careerWithGradeToGeneral: true,
      gradeConv: [100, 95, 90, 85, 80, 75, 70, 65, 0],
      achPoint: { A: 15, B: 9, C: 3 },
      basePoints: 660,
      coef: 2.25,
      realMax: 225,
      careerTopN: 3,
      careerMax: 15,
      /* 진로선택 3과목 미만 → 석차등급산출과목 실질점수로 비교내신 (최저점 3) */
      compareCoef: 0.06666,
      compareMin: 3,
      /* 환산등급 상당치는 석차등급산출과목 평균으로 낸다 (총점에는 기본점수가 섞여 있다) */
      equivScale: [100, 95, 90, 85, 80, 75, 70, 65, 0],
      equivFrom: function (out) { return out.generalAvg; },

      variants: [
        { key: 'all', label: '전 모집단위 (예체능 계열 · 인문대학 제외)',
          areas: ['국어', '수학', '영어', '사회', '과학'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 사회 · 과학',
          includeForeignHanmun: false },
        { key: 'inmun', label: '인문대학 모집단위',
          areas: ['국어', '수학', '영어', '사회', '과학'],
          areaNote: '국어 · 영어 · 수학 · 한국사 · 사회 · 과학 + 제2외국어 / 한문',
          includeForeignHanmun: true },
        { key: 'arts', label: '예능 계열 · 체육교육과',
          areas: ['국어', '영어', '사회'],
          areaNote: '국어 · 영어 · 한국사 · 사회 (수학 · 과학 · 제2외국어 / 한문 미반영)',
          includeForeignHanmun: false }
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
          { title: '석차등급 등급점수', head: ['석차등급', '등급점수'], rows: rows },
          { title: '진로선택 성취도별 등급점수 (상위 3과목만)',
            head: ['성취도', '등급점수'],
            rows: ['A', 'B', 'C'].map(function (k) {
              return [{ v: k, strong: true }, { v: sp.achPoint[k], num: true }]; }) },
          { title: '전형요소별 반영점수 — 학생부교과(일반) 일괄선발',
            head: ['전형요소', '기본점수', '실질점수', '배점'],
            rows: [
              [{ v: '석차등급산출과목' }, { v: 660, num: true }, { v: 225, num: true }, { v: 885, num: true }],
              [{ v: '진로선택과목' }, { v: 0, num: true }, { v: 15, num: true }, { v: 15, num: true }],
              [{ v: '출결 (산출 제외)' }, { v: 90, num: true }, { v: 10, num: true }, { v: 100, num: true }],
              [{ v: '합계', strong: true }, { v: 750, num: true }, { v: 250, num: true }, { v: 1000, num: true }]
            ] }
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
    var items = records.map(function (r) { return evalRecord(r, spec, opt); });
    var inc = items.filter(function (it) { return it.included; });
    var out = {
      items: items, included: inc,
      excluded: items.filter(function (it) { return !it.included; }),
      warns: items.filter(function (it) { return it.warn; }),
      groups: null, renormalized: false,
      artsPe: computeArtsPe(items)
    };

    if (spec.mode === 'base') {
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
        cScore = round3(cs / spec.careerTopN);
      } else {
        compare = true;
        cScore = gReal === null ? null
               : Math.max(round2(gReal * spec.compareCoef), spec.compareMin);
      }

      out.generalItems = gi; out.generalAvg = gAvg;
      out.generalReal = gReal; out.generalScore = gScore;
      out.careerItems = ci; out.careerTop = top; out.careerCount = ci.length;
      out.careerScore = cScore; out.careerCompare = compare;
      out.credits = gd; out.weighted = gn;
      out.scoreMax = spec.basePoints + spec.realMax + spec.careerMax;
      out.score = (gScore === null || cScore === null) ? null : round3(gScore + cScore);
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
      out.score = spec.trunc ? truncDiv(num, den, spec.trunc) : (den > 0 ? num / den : null);
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
    computeArtsPe: computeArtsPe, ARTS_PE_POINT: ARTS_PE_POINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.UnivCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
