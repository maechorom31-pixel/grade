/* 성취평가 시뮬레이션 코어 단위 테스트: 석차등급·혼합점수·역산 */
'use strict';
var K = require('./cutcore.js');
var pass = 0, fail = 0;
function T(n, c, d) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')); } }

// 5등급: 20명, 누적 10/34/66/90/100% → 2/7/13/18/20명
var e = []; for (var i = 0; i < 20; i++) e.push({ id: 's' + i, score: 100 - i });
var r = K.rankGrades(e, K.RATIOS5);
T('5등급 1등급 2명', ['s0', 's1'].every(function (id) { return r.byId[id].grade === 1; }) && r.byId.s2.grade === 2);
T('5등급 경계 7/8, 13/14, 18/19', r.byId.s6.grade === 2 && r.byId.s7.grade === 3 && r.byId.s12.grade === 3 && r.byId.s13.grade === 4 && r.byId.s17.grade === 4 && r.byId.s18.grade === 5);
// 동석차가 경계에 걸침: 2~3등 동점 → 중간석차 2.5 / 20 = 12.5% → 2등급
var e2 = e.map(function (x) { return { id: x.id, score: x.score }; }); e2[2].score = e2[1].score;
var r2 = K.rankGrades(e2, K.RATIOS5);
T('경계 동점 중간석차 → 2등급', r2.byId.s1.grade === 2 && r2.byId.s2.grade === 2 && r2.byId.s1.tie === 2);
T('null 점수 제외', K.rankGrades([{ id: 'a', score: null }, { id: 'b', score: 50 }]).n === 1);
// 9등급 100명
var e9 = []; for (var i = 0; i < 100; i++) e9.push({ id: i, score: 1000 - i });
var r9 = K.rankGrades(e9, K.RATIOS9);
T('9등급 4·11·23 경계', r9.byId[3].grade === 1 && r9.byId[4].grade === 2 && r9.byId[10].grade === 2 && r9.byId[11].grade === 3 && r9.byId[22].grade === 3 && r9.byId[23].grade === 4);

// 혼합 점수
T('단일 요소 원점수 유지', K.blendScore([67.5], [35]) === 67.5);
T('1차 70(35) + 수행 90(30) 재정규화 반올림', K.blendScore([70, null, 90], [35, 35, 30]) === Math.round((70 * 35 + 90 * 30) / 65));
T('v6 규정과 동일 (전 요소)', K.blendScore([70, 60, 90], [35, 35, 30]) === K.finalScore([70, 60, 90], [{ ratio: 35, kind: 'exam' }, { ratio: 35, kind: 'exam' }, { ratio: 30, kind: 'perf' }]));

// 역산: 1차 70(35) + 수행 90(30) 고정, 2차 x(35), 최종 ≥ 75.64
var need = K.requiredScore(70 * 35 + 90 * 30, 100, 35, 75.64);
T('역산 점수로 정확히 도달', K.blendScore([70, need, 90], [35, 35, 30]) >= 75.64 && K.blendScore([70, need - 0.01, 90], [35, 35, 30]) < 75.64, 'need=' + need);

console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
