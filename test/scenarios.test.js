/* 등급 시뮬레이터 예상 시나리오 검증 (Node)
 * 대상: SimCore (파서 4종 + 등급 엔진 + 통계 + GPA)
 */
'use strict';
var C = require('./simcore.js');

var pass = 0, fail = 0, failures = [];
function T(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n■ ' + t); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function approx(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9); }

/* ═══ 1. 과목 유형 자동 분류 (classifySubject) ═══ */
section('1. 교육과정·산출방식 자동 분류');
T('2015 일반선택 → 9등급 (미적분)', eq(C.classifySubject('미적분').type, '9'));
T('2015 일반선택 → 9등급 (확률과 통계, 공백 무시)', eq(C.classifySubject('확률과 통계').type, '9'));
T('2015 일반선택 → 9등급 (영어Ⅱ, 로마자 정규화)', eq(C.classifySubject('영어Ⅱ').type, '9'));
T('2015 진로선택 → 성취도 (기하)', eq(C.classifySubject('기하').type, 'ach'));
T('2015 체육예술 → 성취도 (운동과 건강)', eq(C.classifySubject('운동과 건강').type, 'ach'));
T('2022 공통 → 5등급 (공통국어1)', eq(C.classifySubject('공통국어1').type, '5'));
T('2022 융합선택 → 성취도 (윤리문제 탐구)', eq(C.classifySubject('윤리문제 탐구').type, 'ach'));
T('2015 진로선택 → 성취도 (프로그래밍)', eq(C.classifySubject('프로그래밍').type, 'ach')
  && eq(C.classifySubject('프로그래밍').curr, '2015'));
T('동명 과목은 2015 우선 (스포츠 생활 → 2015)', eq(C.classifySubject('스포츠 생활').curr, '2015'));
T('미등재 과목 → 인식 실패 라벨', C.classifySubject('알수없는과목').type === null
  && C.classifySubject('알수없는과목').label.indexOf('실패') >= 0);

/* ═══ 2. 교과영역 판별 ═══ */
section('2. 교과영역 판별');
T('나이스 교과 우선 (교과=사회, 과목=경제 수학 → 사회)', eq(C.categoryToArea('사회', '경제 수학'), '사회'));
T('교과 없으면 과목명 추론 (경제 수학 → 수학)', eq(C.categoryToArea('', '경제 수학'), '수학'));
T('언어와 매체 → 국어', eq(C.inferArea('언어와 매체'), '국어'));
T('물리학1 → 과학', eq(C.inferArea('물리학1'), '과학'));
T('음악연주 → 체예', eq(C.inferArea('음악연주'), '체예'));

/* ═══ 3. 9등급 산정 — 누적인원 반올림 ═══ */
section('3. 9등급 상대평가 — 누적비율 반올림');
function mk(scores) { return scores.map(function (s, i) { return { id: 'S' + i, score: s }; }); }

// n=100, 전원 서로 다른 점수 → 교과서적 배분 4/7/12/17/20/17/12/7/4
var e100 = mk(Array.from({ length: 100 }, function (_, i) { return 100 - i; }));
var r100 = C.computeGrades(e100, 100);
T('n=100 누적컷 [4,11,23,40,60,77,89,96,100]', eq(r100.cuts, [4, 11, 23, 40, 60, 77, 89, 96, 100]));
T('n=100 1위 → 1등급 / 5위 → 2등급', r100.byId['S0'].grade === 1 && r100.byId['S4'].grade === 2);
T('n=100 40위 → 4등급, 41위 → 5등급', r100.byId['S39'].grade === 4 && r100.byId['S40'].grade === 5);
T('n=100 100위 → 9등급', r100.byId['S99'].grade === 9);

// n=33 반올림: 4%→1.32→1, 11%→3.63→4, 23%→7.59→8, 40%→13.2→13, 60%→19.8→20, 77%→25.41→25, 89%→29.37→29, 96%→31.68→32
var e33 = mk(Array.from({ length: 33 }, function (_, i) { return 100 - i; }));
var r33 = C.computeGrades(e33, 33);
T('n=33 누적컷 [1,4,8,13,20,25,29,32,33]', eq(r33.cuts, [1, 4, 8, 13, 20, 25, 29, 32, 33]));
T('n=33 1위만 1등급, 2위는 2등급', r33.byId['S0'].grade === 1 && r33.byId['S1'].grade === 2);

/* ═══ 4. 동점 처리 — 중간석차백분율 ═══ */
section('4. 경계 동점 — 중간석차백분율 규정');
// n=100: 3~6위 4명 동점(97점) → 1·2등급 경계(누적 4)에 걸침
// 중간석차 = 3 + (4-1)/2 = 4.5 → 4.5% > 4% → 전원 2등급
var eTie = mk([100, 99]).concat([97, 97, 97, 97].map(function (s, i) { return { id: 'T' + i, score: s }; }))
  .concat(Array.from({ length: 94 }, function (_, i) { return { id: 'R' + i, score: 90 - i * 0.5 }; }));
var rTie = C.computeGrades(eTie, 100);
T('경계 걸친 동점 4명 → 중간석차 4.5% → 전원 2등급',
  rTie.byId['T0'].grade === 2 && rTie.byId['T3'].grade === 2);
T('경계 동점 플래그 표시', rTie.byId['T0'].boundaryTie === true);
T('중간석차백분율 = 4.5%', approx(rTie.byId['T0'].midPct, 4.5));

// 경계 안쪽 동점은 그대로: 1~4위 4명 동점 → 전원 1등급 (누적 4 이내)
var eTie2 = [100, 100, 100, 100].map(function (s, i) { return { id: 'T' + i, score: s }; })
  .concat(Array.from({ length: 96 }, function (_, i) { return { id: 'R' + i, score: 95 - i * 0.5 }; }));
var rTie2 = C.computeGrades(eTie2, 100);
T('경계 안 동점 4명(1~4위) → 전원 1등급, 플래그 없음',
  rTie2.byId['T0'].grade === 1 && rTie2.byId['T3'].grade === 1 && rTie2.byId['T0'].boundaryTie === false);

// 중간석차가 정확히 경계값이면 위 등급: 3~5위 3명 동점 → 중간석차 4.0% → 1등급
var eTie3 = mk([100, 99]).concat([97, 97, 97].map(function (s, i) { return { id: 'T' + i, score: s }; }))
  .concat(Array.from({ length: 95 }, function (_, i) { return { id: 'R' + i, score: 90 - i * 0.5 }; }));
var rTie3 = C.computeGrades(eTie3, 100);
T('중간석차 정확히 4.0% → 1등급 인정', rTie3.byId['T0'].grade === 1 && approx(rTie3.byId['T0'].midPct, 4));

// 대량 동점이 여러 등급을 관통: 1~60위 동점 → 중간석차 30.5% → 4등급 (23%<30.5%≤40%)
var eTie4 = Array.from({ length: 60 }, function (_, i) { return { id: 'T' + i, score: 80 }; })
  .concat(Array.from({ length: 40 }, function (_, i) { return { id: 'R' + i, score: 70 - i * 0.5 }; }));
var rTie4 = C.computeGrades(eTie4, 100);
T('1~60위 대량 동점 → 중간석차 30.5% → 4등급', rTie4.byId['T0'].grade === 4 && approx(rTie4.byId['T0'].midPct, 30.5));

/* ═══ 5. 5등급제 (2022 개정) ═══ */
section('5. 5등급 상대평가 (2022 개정)');
var e50 = mk(Array.from({ length: 50 }, function (_, i) { return 100 - i; }));
var r50 = C.computeGrades(e50, 50, C.CUM_RATIOS_5);
T('n=50 누적컷 [5,17,33,45,50] (10/34/66/90/100%)', eq(r50.cuts, [5, 17, 33, 45, 50]));
T('5위 → 1등급, 6위 → 2등급', r50.byId['S4'].grade === 1 && r50.byId['S5'].grade === 2);
T('50위 → 5등급', r50.byId['S49'].grade === 5);
T('밴드 수 = 5', r50.bands === 5);

/* ═══ 6. 수강자수 수기 보정 (결시생 포함) ═══ */
section('6. 수강자수 보정 (n 오버라이드)');
// 10명 점수 입력, 실제 수강 25명(결시 15명) → 컷은 25명 기준
var e10 = mk(Array.from({ length: 10 }, function (_, i) { return 100 - i * 2; }));
var rOv = C.computeGrades(e10, 25);
T('n=25 기준 컷 [1,3,6,10,15,19,22,24,25]', eq(rOv.cuts, [1, 3, 6, 10, 15, 19, 22, 24, 25]));
T('1위만 1등급 (25명의 4%=1명)', rOv.byId['S0'].grade === 1 && rOv.byId['S1'].grade === 2);
T('10위 → 4등급 (누적 10명 이내)', rOv.byId['S9'].grade === 4);

/* ═══ 7. 통계 (모표준편차) ═══ */
section('7. 기술통계');
var st = C.stats([70, 80, 90]);
T('평균 80', approx(st.avg, 80));
T('모표준편차 √(200/3)≈8.165', approx(st.std, Math.sqrt(200 / 3), 1e-9));
T('빈 배열 → null', C.stats([]) === null);

/* ═══ 8. 학급별 일람표 파서 (다중 페이지) ═══ */
section('8. 학급별 일람표 파서');
var rosterRows = [
  ['2026학년도 1학기 1차 시험 학급별 일람표', null, null, null, null],
  ['3학년 1반', null, null, null, null],
  ['번호', '학번', '성  명', '국어:화법과 작문(4)', '수학:미적분(4)'],
  [1, 30101, '김하늘', 92, 88],
  [2, 30102, '이서준', 85.5, 90],
  [3, 30103, '박지우', 77, null],
  ['응시생수', null, null, '3 명', '2 명'],
  ['학과응시생수', null, null, '120 명', '95 명'],
  // ─ 2페이지: 같은 학생, 다른 과목 열 ─
  ['번호', '학번', '성  명', '영어:영어Ⅱ(3)'],
  [1, 30101, '김하늘', 95],
  [2, 30102, '이서준', 63],
  [3, 30103, '박지우', 71],
  ['응시생수', null, null, '3 명']
];
var pr = C.parseRoster(rosterRows);
T('반·차수 인식 (1반, 1차)', pr && pr.ban === 1 && pr.exam === 1);
T('과목 3개 병합 인식 (페이지 넘김 포함)', pr.subjects.length === 3
  && eq(pr.subjects.map(function (s) { return s.key; }), ['화법과 작문', '미적분', '영어Ⅱ']));
T('교과·단위수 파싱 (수학:미적분(4))', pr.subjects[1].category === '수학' && pr.subjects[1].credit === 4);
T('학생 3명, 페이지 간 점수 병합', pr.students.length === 3
  && pr.students[0].scores['화법과 작문'] === 92 && pr.students[0].scores['영어Ⅱ'] === 95);
T('결시(빈칸)는 점수 미기록', pr.students[2].scores['미적분'] === undefined);
T('소수점 점수 유지 (85.5)', pr.students[1].scores['화법과 작문'] === 85.5);
T('푸터 응시생수/학과응시생수', pr.footer.attend['미적분'] === 2 && pr.footer.deptCount['화법과 작문'] === 120);
T('학번 문자열 보존', pr.students[0].sid === '30101');

/* ═══ 9. 교과목별 일람표 파서 ═══ */
section('9. 교과목별 일람표 파서');
var subjRows = [
  ['2026학년도 1학기 2차 시험 교과목별 일람표'],
  ['교과목 : 수학:미적분( 4 )'],
  [],
  ['반번호', 1, 2, 3],
  [1, 88, 92, null],
  [2, 75, null, 81],
  ['응시생수', '2 명', '1 명', '2 명'],
  ['총 평균', 81.5, 92, 81]
];
var ps = C.parseSubjectRoster(subjRows);
T('2차 시험·과목 인식', ps && ps.exam === 2 && ps.subject.key === '미적분' && ps.subject.credit === 4);
T('반×번호 매트릭스 → 4건 (결시 null 제외)', ps.scores.length === 4);
T('3반 2번 = 81', ps.scores.some(function (s) { return s.ban === 3 && s.no === 2 && s.score === 81; }));
T('반별 응시생수', ps.attend[1] === 2 && ps.attend[2] === 1);

/* ═══ 10. 생기부(교과학습발달상황) 파서 ═══ */
section('10. 생기부 파서');
var trRows = [
  ['교과학습발달상황 (3학년 2반)'],
  ['번호', '성명', '학년', '학기', '교과', '과목', '학점', '원점수/과목평균(표준편차)', '성취도(수강자수)', '석차등급'],
  [1, '김하늘', 1, 1, '국어', '국어', 4, '88/72.3(11.2)', 'A(230)', 2],
  [null, null, null, 2, '수학', '수학', 4, '95/68.1(15.0)', 'A(230)', 1],
  [null, null, 2, 1, '체육', '운동과 건강', 2, '90', 'A', null],
  [null, null, null, null, '교양', '진로와 직업', 1, '', 'P', 'P'],
  [2, '이서준', 1, 1, '국어', '국어', 4, '75/72.3(11.2)', 'B(230)', 4]
];
var pt = C.parseTranscript(trRows);
T('반 인식 (2반)', pt.ban === 2);
T('레코드 5건 (P 과목 포함)', pt.records.length === 5);
var r0 = pt.records[0];
T('원점수/평균/표준편차 분해', r0.raw === 88 && r0.avg === 72.3 && r0.std === 11.2);
T('성취도·석차등급', r0.ach === 'A' && r0.cnt === 230 && r0.grade === 2);
T('번호·학기 forward-fill (2행 → 김하늘 1-2)', pt.records[1].name === '김하늘' && pt.records[1].sem === 2);
T('학년 forward-fill (3행 → 2학년)', pt.records[2].year === 2);
T('원점수만 있는 행 (90)', pt.records[2].raw === 90 && pt.records[2].avg === null);
T('P(이수) → 등급 null', pt.records[3].grade === null && pt.records[3].ach === 'P');

/* ═══ 11. 명렬표 파서 ═══ */
section('11. 명렬표 파서');
var nlRows = [
  ['2026학년도 3학년 명렬표'],
  ['반', '번호', '성명', '학번'],
  [1, 1, '김하늘', 30101],
  [1, 2, '이서준', 30102],
  [2, 1, '박지우', 30201]
];
var pn = C.parseNamelist(nlRows);
T('3명 인식, 반 열 사용', pn.students.length === 3 && pn.students[2].ban === 2);
T('학번 보존', pn.students[0].sid === '30101');
var nlRows2 = [
  ['3학년 5반 명렬표'],
  ['번호', '이름'],
  [1, '정다은'], [2, '한지민'], [3, '오세훈']
];
var pn2 = C.parseNamelist(nlRows2);
T('반 열 없으면 제목의 반 사용 (5반)', pn2.students.length === 3 && pn2.students[0].ban === 5);

/* ═══ 12. 파일 종류 자동 판별 ═══ */
section('12. 파일 종류 자동 판별 (parseWorkbookRows)');
T('학급별 일람표 판별', C.parseWorkbookRows(rosterRows).kind === 'roster');
T('교과목별 일람표 판별', C.parseWorkbookRows(subjRows).kind === 'subjectRoster');
T('생기부 판별', C.parseWorkbookRows(trRows).kind === 'transcript');
T('명렬표 판별', C.parseWorkbookRows(nlRows).kind === 'namelist');
T('제목 없어도 폴백 판별 (일람표)', (function () {
  var r = C.parseWorkbookRows(rosterRows.slice(1)); // 제목 행만 제거, 반 정보는 유지
  return r && r.kind === 'roster';
})());
T('무관한 파일 → null', C.parseWorkbookRows([['아무 내용'], ['없는 파일']]) === null);

/* ═══ 13. 평균등급(GPA) 계산 ═══ */
section('13. 학기별·누적 평균등급');
var recs = [
  { year: 1, sem: 1, credit: 4, grade: 2 },
  { year: 1, sem: 1, credit: 2, grade: 4 },
  { year: 1, sem: 2, credit: 3, grade: 1 },
  { year: 2, sem: 1, credit: 3, grade: null },   // 성취도 과목 → 제외
  { year: 2, sem: 1, credit: 0, grade: 3 }       // 0학점 → 제외
];
var g = C.gpaFromRecords(recs);
T('1-1: (4×2+2×4)/6 ≈ 2.667', approx(g.perSem[0].gpa, 8 / 3 * 2 / 2, 1e-9) && approx(g.perSem[0].gpa, 16 / 6));
T('1-2: 1.00', approx(g.perSem[1].gpa, 1));
T('성취도·0학점 과목 제외 → 학기 2개만', g.perSem.length === 2);
T('누적: (16+3)/9 ≈ 2.111', approx(g.gpa, 19 / 9));
T('총 이수학점 9', g.credits === 9);

/* ═══ 14. 종합 시나리오 — 1·2차 합산 등급 산출 흐름 ═══ */
section('14. 종합 시나리오 (1·2차 합산 → 등급)');
// 6명, 1차:2차 = 40:60 합산 후 9등급 (실제 앱 combinedScore와 동일 공식)
var s1 = { A: 90, B: 80, C: 70, D: 95, E: 60, F: 85 };
var s2 = { A: 80, B: 95, C: 75, D: 90, E: 70, F: 85 };
var comb = Object.keys(s1).map(function (id) {
  return { id: id, score: (40 * s1[id] + 60 * s2[id]) / 100 };
});
var rc = C.computeGrades(comb, 6);
// 합산: A=84, B=89, C=73, D=92, E=66, F=85 → 순위 D>B>F>A>C>E
T('합산 점수 계산 (A=84)', approx(comb.find(function (e) { return e.id === 'A'; }).score, 84));
T('n=6 컷 [0,1,1,2,4,5,5,6,6]', eq(rc.cuts, [0, 1, 1, 2, 4, 5, 5, 6, 6]));
T('1위 D → 2등급 (6명의 4%=0명 → 1등급 정원 0)', rc.byId['D'].grade === 2);
// n=6: 8등급 누적컷 = round(6×0.96) = 6 → 6위는 8등급, 9등급 정원 0명 (규정상 올바름)
T('꼴찌 E → 8등급 (n=6은 9등급 정원 0)', rc.byId['E'].grade === 8);

/* ═══ 결과 ═══ */
console.log('\n═══════════════════════════════');
console.log('통과 ' + pass + ' / 실패 ' + fail + ' (총 ' + (pass + fail) + ')');
if (fail) { console.log('\n실패 목록:'); failures.forEach(function (f) { console.log(' - ' + f); }); process.exit(1); }
