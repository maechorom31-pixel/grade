/* 성취평가 분할점수 종합관리 — v6 엑셀 골든 테스트
 * 웹 코어(CutCore)의 계산이 v6 엑셀의 실제 계산 결과와 일치하는지 검증한다.
 * 실행: SAMPLE_V6=<v6.xlsx 경로> node cutscore.golden.test.js  (미지정 시 합성값 검증만)
 */
'use strict';
var K = require('./cutcore.js');
var fs = require('fs');

var pass = 0, fail = 0, failures = [];
function T(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function approx(a, b, tol) { return a !== null && b !== null && Math.abs(a - b) <= (tol || 1e-6); }
function section(t) { console.log('\n■ ' + t); }

/* ═══ 1. Angoff 분할점수 (v6 종합 시트 13~23행 값) ═══ */
section('1. Angoff 예측 분할점수');
var angoff1 = [
  { part: '선택형', diff: '쉬움',   points: 24,   rates: [75, 65, 65, 60, 55] },
  { part: '선택형', diff: '보통',   points: 28.8, rates: [70, 65, 60, 55, 50] },
  { part: '선택형', diff: '어려움', points: 27.2, rates: [60, 55, 50, 45, 40] },
  { part: '서답형', diff: '쉬움',   points: 4,    rates: [75, 70, 65, 60, 55] },
  { part: '서답형', diff: '보통',   points: 10,   rates: [70, 65, 60, 55, 50] },
  { part: '서답형', diff: '어려움', points: 6,    rates: [65, 60, 55, 50, 45] }
];
var pred1 = K.angoffCuts(angoff1);
T('1차 예측 A/B = 68.38', approx(pred1[0], 68.38, 0.005), 'got ' + pred1[0]);
T('1차 예측 B/C = 62.18', approx(pred1[1], 62.18, 0.005), 'got ' + pred1[1]);
T('1차 예측 C/D = 58.38', approx(pred1[2], 58.38, 0.005));
T('1차 예측 D/E = 53.38', approx(pred1[3], 53.38, 0.005));
T('1차 예측 미도달 = 48.38', approx(pred1[4], 48.38, 0.005));

var angoff2 = [
  { part: '선택형', diff: '쉬움',   points: 10.4, rates: [90, 80, 70, 55, 40] },
  { part: '선택형', diff: '보통',   points: 37.6, rates: [80, 70, 55, 40, 30] },
  { part: '선택형', diff: '어려움', points: 32,   rates: [65, 55, 50, 35, 20] },
  { part: '서답형', diff: '쉬움',   points: null, rates: [null,null,null,null,null] },
  { part: '서답형', diff: '보통',   points: null, rates: [null,null,null,null,null] },
  { part: '서답형', diff: '어려움', points: 20,   rates: [60, 50, 40, 30, 10] }
];
var pred2 = K.angoffCuts(angoff2);
T('2차 예측 A/B = 72.24 (빈 행 무시)', approx(pred2[0], 72.24, 0.005), 'got ' + pred2[0]);
T('2차 예측 미도달 = 23.84', approx(pred2[4], 23.84, 0.005));

/* ═══ 2. 사용 분할점수 (실제 > 예측, 빈칸 = 등급 없음) ═══ */
section('2. 사용 분할점수 규칙');
var actual1 = [66.56, 61.56, 56.56, 51.56, null];
var used1 = K.usedCuts(pred1, actual1);
T('실제 입력 시 실제 우선 (A/B 66.56)', approx(used1[0], 66.56));
T('실제 행의 빈칸은 등급 없음 (미도달 null)', used1[4] === null);
T('감지된 등급 체계 = 5등급 A~E', JSON.stringify(K.gradeSystem(used1)) === JSON.stringify(['A','B','C','D','E']));
var usedPredOnly = K.usedCuts(pred1, [null,null,null,null,null]);
T('실제 전부 비면 예측 사용', approx(usedPredOnly[0], 68.38, 0.005));

/* ═══ 3. 누적 분할점수 (v6 45행: 75.64 / 65.14 / 54.556 / 42.856) ═══ */
section('3. 누적 분할점수 (30:30:40 가중)');
var used2 = K.usedCuts(pred2, [72.24, 62.24, 51.96, 37.96, null]);
var perfCuts = [85, 70, 55, 40, null];
var comps = [
  { id: 'c1', kind: 'exam', ratio: 30, cuts: used1 },
  { id: 'c2', kind: 'exam', ratio: 30, cuts: used2 },
  { id: 'p1', kind: 'perf', ratio: 40, fallback: 90, cuts: perfCuts }
];
var cum = K.cumulativeCuts(comps);
T('누적 A/B = 75.64', approx(cum.cuts[0], 75.64, 0.005), 'got ' + cum.cuts[0]);
T('누적 B/C = 65.14', approx(cum.cuts[1], 65.14, 0.005));
T('누적 C/D = 54.556', approx(cum.cuts[2], 54.556, 0.005));
T('누적 D/E = 42.856', approx(cum.cuts[3], 42.856, 0.005));
T('누적 미도달 = 등급 없음(null)', cum.cuts[4] === null);

// 단계 적응: 1차만 분할 존재 → 누적 = 1차 그대로
var cumStage1 = K.cumulativeCuts([
  { id: 'c1', kind: 'exam', ratio: 30, cuts: used1 },
  { id: 'c2', kind: 'exam', ratio: 30, cuts: [null,null,null,null,null] },
  { id: 'p1', kind: 'perf', ratio: 40, cuts: [null,null,null,null,null] }
]);
T('1차만 입력 시 누적 = 1차 분할 (66.56)', approx(cumStage1.cuts[0], 66.56));
// 1+2차 → 30:30 가중
var cumStage2 = K.cumulativeCuts([
  { id: 'c1', kind: 'exam', ratio: 30, cuts: used1 },
  { id: 'c2', kind: 'exam', ratio: 30, cuts: used2 },
  { id: 'p1', kind: 'perf', ratio: 40, cuts: [null,null,null,null,null] }
]);
T('1+2차 단계 누적 A/B = (66.56+72.24)/2 = 69.4', approx(cumStage2.cuts[0], 69.4, 0.005), 'got ' + cumStage2.cuts[0]);

/* ═══ 4. 등급 판정 ═══ */
section('4. 등급 판정');
T('75.64점 → A (경계 포함)', K.gradeOf(75.64, cum.cuts) === 'A');
T('75.63점 → B', K.gradeOf(75.63, cum.cuts) === 'B');
T('42.856 미만 → E (미도달 등급 없음)', K.gradeOf(10, cum.cuts) === 'E');
var withF = [70, 60, 50, 40, 30];
T('미도달 경계 있으면 30 미만 → 미도달', K.gradeOf(29.9, withF) === '미도달' && K.gradeOf(30, withF) === 'E');

/* ═══ 5. 학기말 점수 (가중합 반올림 정수 + Fallback + 재정규화) ═══ */
section('5. 학기말 점수');
var fsComps = [
  { kind: 'exam', ratio: 30, fallback: null },
  { kind: 'exam', ratio: 30, fallback: null },
  { kind: 'perf', ratio: 40, fallback: 90 }
];
T('전 요소 입력: round(59×.3+64×.3+80×.4) = 69', K.finalScore([59, 64, 80], fsComps) === 69);
T('수행 결측 → Fallback 90: round(59×.3+64×.3+90×.4) = 73', K.finalScore([59, 64, null], fsComps) === 73);
T('2차 결측 → 재정규화 (59×30+90×40)/70 = 77', K.finalScore([59, null, null], fsComps) === Math.round((59*30+90*40)/70));
T('지필 전부 결측 → null', K.finalScore([null, null, 80], fsComps) === null);

/* ═══ 6. v6 실데이터 골든 대조 ═══ */
var V6 = process.env.SAMPLE_V6;
if (V6 && fs.existsSync(V6)) {
  section('6. v6 엑셀 실데이터 대조');
  var XLSX = require('./xlsx.escaped.js');
  var wb = XLSX.read(fs.readFileSync(V6), { type: 'buffer' });
  function matrix(sheet) {
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, raw: true });
    var scores = [];
    for (var i = 4; i < rows.length; i++) {
      for (var c = 0; c < 12; c++) {
        var v = rows[i] ? rows[i][c] : null;
        if (typeof v === 'number') scores.push({ ban: c + 1, no: i - 3, v: v });
      }
    }
    return scores;
  }
  var s1 = matrix('1차고사 점수'), s2 = matrix('2차고사 점수');
  T('1차 점수 113명 적재', s1.length === 113, 'got ' + s1.length);

  // 1차 분포: v6 종합 51행 = A51 B7 C8 D8 E39 미도달0
  var d1 = K.distribution(s1.map(function (x) { return x.v; }), used1);
  T('1차 분포 A=51', d1.counts['A'] === 51, 'got ' + d1.counts['A']);
  T('1차 분포 B=7 C=8 D=8', d1.counts['B'] === 7 && d1.counts['C'] === 8 && d1.counts['D'] === 8);
  T('1차 분포 E=39 미도달=0', d1.counts['E'] === 39 && d1.counts['미도달'] === 0);
  var st1 = K.stats(s1.map(function (x) { return x.v; }));
  T('1차 평균 = 61.0389…', approx(st1.avg, 61.03893805309736, 1e-9), 'got ' + st1.avg);

  // 학기말 점수: 학기말 예측 시트와 전 학생 대조
  var byKey = {};
  s2.forEach(function (x) { byKey[x.ban + '-' + x.no] = x.v; });
  var finals = [], mismatch = 0;
  var predRows = XLSX.utils.sheet_to_json(wb.Sheets['학기말 예측'], { header: 1, defval: null, raw: true });
  s1.forEach(function (x) {
    var f = K.finalScore([x.v, byKey[x.ban + '-' + x.no] !== undefined ? byKey[x.ban + '-' + x.no] : null, null], fsComps);
    finals.push(f);
    var excelV = predRows[x.no + 3] ? predRows[x.no + 3][x.ban - 1] : null;
    if (typeof excelV === 'number' && f !== excelV) mismatch++;
  });
  T('학기말 점수 113명 전원 엑셀과 일치', mismatch === 0, mismatch + '명 불일치');

  // 누적 예측 분포: v6 종합 53행 = A52 B24 C27 D9 E1 미도달0
  var dc = K.distribution(finals, cum.cuts);
  T('누적 분포 A=52', dc.counts['A'] === 52, 'got ' + dc.counts['A']);
  T('누적 분포 B=24 C=27 D=9 E=1', dc.counts['B'] === 24 && dc.counts['C'] === 27 && dc.counts['D'] === 9 && dc.counts['E'] === 1,
    JSON.stringify(dc.counts));
  var stc = K.stats(finals);
  T('누적 예측 평균 = 72.5752…', approx(stc.avg, 72.57522123893806, 1e-9), 'got ' + stc.avg);

  // 반별 통계 (학기말 예측 시트 우측): 1반 18명 평균 69.222 A4 / 4반 21명 평균 74.571 A13
  function classStat(ban) {
    var xs = [];
    s1.forEach(function (x) {
      if (x.ban !== ban) return;
      xs.push(K.finalScore([x.v, byKey[x.ban + '-' + x.no] ?? null, null], fsComps));
    });
    var st = K.stats(xs);
    var a = xs.filter(function (v) { return K.gradeOf(v, cum.cuts) === 'A'; }).length;
    return { n: st.n, avg: st.avg, a: a };
  }
  var c1s = classStat(1), c4s = classStat(4);
  T('1반: 18명 · 평균 69.222 · A 4명', c1s.n === 18 && approx(c1s.avg, 69.22222222222223, 1e-9) && c1s.a === 4,
    JSON.stringify(c1s));
  T('4반: 21명 · 평균 74.571 · A 13명', c4s.n === 21 && approx(c4s.avg, 74.57142857142857, 1e-9) && c4s.a === 13,
    JSON.stringify(c4s));

  // 모니터링 지표: 지표1 A비율 46.0% > 40 → 경고, 지표2 72.6 < 75.6 양호, 지표4 75.6 ≥ 70 양호
  var aPct = dc.counts['A'] / dc.n * 100;
  T('지표1: A 비율 46.0% → 경고 (>40)', approx(aPct, 46.017699115044245, 1e-9) && aPct > 40);
  T('지표2: 평균 < A 분할 (72.6 < 75.6) → 양호', stc.avg < cum.cuts[0]);
  T('지표3: 평균 ≤ 80 → 양호', stc.avg <= 80);
  T('지표4: A 분할 ≥ 70 → 양호', cum.cuts[0] >= 70);
} else {
  console.log('\n(v6 엑셀 미지정 — SAMPLE_V6 환경변수로 지정하면 실데이터 골든 검증 수행)');
}

console.log('\n═══════════════════════════════');
console.log('통과 ' + pass + ' / 실패 ' + fail + ' (총 ' + (pass + fail) + ')');
if (fail) { failures.forEach(function (f) { console.log(' - ' + f); }); process.exit(1); }
