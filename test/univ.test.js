/* 대학별 교과 환산점수 — 단위·시나리오 검증
   요강 표를 손으로 계산한 값과 대조한다. 실행: node univ.test.js */
'use strict';
const U = require('./univcore.js');
const HUFS = U.UNIVS.hufs;
const GACHON = U.UNIVS.gachon;

/* 규격 표에서 직접 조회하는 얇은 헬퍼 (요강 표를 그대로 대조하기 위함) */
const gradeConv = g => (g >= 1 && g <= 9) ? HUFS.gradeConv[g - 1] : null;
const rawConv = (area, s) => U.fromTable(HUFS.rawTable[area] || HUFS.rawTable['기본'], s, 0);
const achConv = a => HUFS.achConv[a] === undefined ? null : HUFS.achConv[a];

let pass = 0, fail = 0;
const failures = [];
function eq(label, got, want) {
  const ok = (typeof want === 'number' && typeof got === 'number')
    ? Math.abs(got - want) < 1e-9 : got === want;
  if (ok) pass++;
  else { fail++; failures.push(`${label}\n    기대: ${JSON.stringify(want)}\n    실제: ${JSON.stringify(got)}`); }
}
function near(label, got, want, tol) {
  const ok = got !== null && Math.abs(got - want) <= (tol || 1e-6);
  if (ok) pass++;
  else { fail++; failures.push(`${label}\n    기대: ${want} (±${tol || 1e-6})\n    실제: ${got}`); }
}
function section(t) { console.log('\n── ' + t); }

/* 생기부 레코드 만들기 */
function rec(o) {
  return Object.assign({ no: 1, name: '홍길동', year: 1, sem: 1, category: '', subject: '',
                         credit: 3, raw: null, avg: null, std: null, grade: null, ach: '', cnt: null }, o);
}
const OPT = { semFrom: 11, semTo: 31, plainScope: 'all', kindOverride: {}, areaOverride: {} };

/* ═════════ 1. 등급환산점수 ═════════ */
section('1. 등급환산점수 (공통·일반선택)');
[[1, 1000], [2, 960], [3, 890], [4, 770], [5, 600], [6, 400], [7, 230], [8, 110], [9, 0]]
  .forEach(([g, v]) => eq(`${g}등급 → ${v}`, gradeConv(g), v));
eq('등급 없음 → null', gradeConv(null), null);

/* ═════════ 2. 원점수환산점수 — 경계 ═════════ */
section('2. 원점수환산점수 경계 (이상 ~ 미만)');
const KOR = [[100, 1000], [90, 1000], [89.9, 960], [85, 960], [84.9, 890], [80, 890], [79.9, 770],
             [75, 770], [74.9, 600], [70, 600], [69.9, 400], [60, 400], [59.9, 230], [50, 230],
             [49.9, 110], [40, 110], [39.9, 0], [0, 0]];
KOR.forEach(([s, v]) => eq(`국어 ${s}점 → ${v}`, rawConv('국어', s), v));
['영어', '사회', '과학'].forEach(a => {
  eq(`${a} 85점 → 960`, rawConv(a, 85), 960);
  eq(`${a} 84.9점 → 890`, rawConv(a, 84.9), 890);
});
const MATH = [[90, 1000], [89.9, 960], [80, 960], [79.9, 890], [70, 890], [69.9, 770], [60, 770],
              [59.9, 600], [50, 600], [49.9, 400], [40, 400], [39.9, 230], [30, 230], [29.9, 110],
              [20, 110], [19.9, 0]];
MATH.forEach(([s, v]) => eq(`수학 ${s}점 → ${v}`, rawConv('수학', s), v));
eq('한국사는 국어와 같은 기준 (사회영역) 85점 → 960', rawConv('사회', 85), 960);
eq('수학 85점은 2등급 구간 → 960', rawConv('수학', 85), 960);
eq('국어 85점도 2등급 구간 → 960', rawConv('국어', 85), 960);
eq('국어 82점 → 890 / 수학 82점 → 960 (기준 다름)',
   [rawConv('국어', 82), rawConv('수학', 82)].join(','), '890,960');

/* ═════════ 3. 성취도환산점수 ═════════ */
section('3. 성취도환산점수 (진로선택)');
eq('A → 1000', achConv('A'), 1000);
eq('B → 960', achConv('B'), 960);
eq('C → 890', achConv('C'), 890);
eq('D → 기준 없음(null)', achConv('D'), null);

/* ═════════ 4. 상윗값 채택 ═════════ */
section('4. 등급환산 vs 원점수환산 중 상윗값');
function ev(o) { return U.evalRecord(rec(o), HUFS, OPT); }
let r;
r = ev({ category: '국어', subject: '문학', grade: 3, raw: 92, credit: 4 });
eq('국어 3등급(890) + 원점수 92(1000) → 1000 채택', r.use, 1000);
eq('  근거는 원점수', r.basis, '원점수');
r = ev({ category: '수학', subject: '미적분', grade: 2, raw: 85, credit: 4 });
eq('수학 2등급(960) + 원점수 85(960) → 960, 동일', r.use, 960);
eq('  근거는 동일', r.basis, '동일');
r = ev({ category: '수학', subject: '미적분', grade: 4, raw: 72, credit: 4 });
eq('수학 4등급(770) + 원점수 72(890) → 890 채택', r.use, 890);
r = ev({ category: '국어', subject: '독서', grade: 1, raw: 88, credit: 4 });
eq('국어 1등급(1000) + 원점수 88(960) → 1000 유지', r.use, 1000);
eq('  근거는 등급', r.basis, '등급');
r = ev({ category: '영어', subject: '영어Ⅰ', grade: 5, raw: null, credit: 4 });
eq('원점수 없음 → 등급환산만 (600)', r.use, 600);
r = ev({ category: '과학', subject: '물리학Ⅰ', grade: null, raw: 77, ach: 'B', credit: 3 });
eq('등급 없이 성취도만 → 진로선택 계열, 성취도 960', r.use, 960);
eq('  계열은 career', r.kind, 'career');

/* ═════════ 5. 교과영역 판정 ═════════ */
section('5. 교과영역 판정 (나이스 교과 우선)');
const A = (c, s) => U.areaOf(c, s).area;
eq("교과 '국어' → 국어", A('국어', '문학'), '국어');
eq("교과 '수학' → 수학", A('수학', '미적분'), '수학');
eq("교과 '영어' → 영어", A('영어', '영어독해와작문'), '영어');
eq("교과 '사회(역사/도덕 포함)' → 사회", A('사회(역사/도덕 포함)', '생활과 윤리'), '사회');
eq("교과 '한국사' → 사회", A('한국사', '한국사'), '사회');
eq("교과 '과학' → 과학", A('과학', '화학Ⅰ'), '과학');
eq("교과 '체육' → 체예 (제외)", A('체육', '운동과 건강'), '체예');
eq("교과 '예술' → 체예 (제외)", A('예술', '음악'), '체예');
eq("교과 '기술·가정' → 기타 (제외)", A('기술·가정', '기술·가정'), '기타');
eq("교과 '기술·가정/정보' → 기타 (제외)", A('기술·가정/정보', '정보'), '기타');
eq("교과 '제2외국어' → 기타 ('국어' 부분일치 회귀)", A('제2외국어', '일본어Ⅰ'), '기타');
eq("교과 '한문' → 기타", A('한문', '한문Ⅰ'), '기타');
eq("교과 '교양' + 과목 '실용 경제' → 기타 (과목명만 보면 사회)", A('교양', '실용 경제'), '기타');
eq("교과 없이 과목 '실용 경제' → 교육과정 표로 기타 (교양 교과)", A('', '실용 경제'), '기타');
eq("교과 없이 과목 '경제 수학' → 수학", A('', '경제 수학'), '수학');
eq("교과 없이 과목 '일본어Ⅰ' → 기타 (제2외국어)", A('', '일본어Ⅰ'), '기타');
eq("교과 없이 과목 '여행지리' → 사회 (진로선택)", A('', '여행지리'), '사회');
eq('교과 있으면 guess=false', U.areaOf('국어', '문학').guess, false);
eq('교과가 없어도 교육과정 표에 있으면 guess=false', U.areaOf('', '문학').guess, false);
eq('모르는 교과라도 교육과정 표에 있으면 표를 씀', U.areaOf('창의적체험', '문학').area, '국어');
eq('교과·표 어디에도 없으면 과목명 추론 + guess=true',
   U.areaOf('', '학교자율탐구').guess, true);
eq('나이스 교과와 교육과정 표가 다르면 나이스 교과 우선',
   U.areaOf('과학', '문학').area, '과학');

/* ═════════ 6. 반영 대상 제외 ═════════ */
section('6. 산출 제외 규칙');
eq('체육 교과 제외', ev({ category: '체육', subject: '체육', ach: 'A', credit: 2 }).reason, '반영교과 아님 (체예)');
eq('교양 교과 제외', ev({ category: '교양', subject: '실용 경제', ach: 'A', credit: 2 }).reason, '반영교과 아님 (기타)');
eq('P 과목 제외', ev({ category: '국어', subject: '고전 읽기', ach: 'P', credit: 3 }).reason, '이수(P) 과목');
eq('등급·성취도 모두 없음 제외', ev({ category: '국어', subject: '문학', credit: 3 }).reason, '등급·성취도 없음');
eq('학점 0 제외', ev({ category: '국어', subject: '문학', grade: 2, credit: 0 }).reason, '학점 0');
eq('반영 학기 밖 제외', ev({ category: '국어', subject: '문학', grade: 2, year: 3, sem: 2 }).reason, '반영 학기 밖');
eq('학년·학기 미상 제외', ev({ category: '국어', subject: '문학', grade: 2, year: null, sem: null }).reason, '학년·학기 미상');
r = ev({ category: '과학', subject: '과학탐구실험', ach: 'D', credit: 1 });
eq('성취도 D는 요강 환산표에 없어 제외', r.reason, '성취도 D 환산 기준 없음');
eq('  확인 경고 표시', r.warn.length > 0, true);
r = U.evalRecord(rec({ category: '국어', subject: '문학', grade: 2, credit: 4 }), HUFS,
                 Object.assign({}, OPT, { kindOverride: { '문학': 'skip' } }));
eq('수동 제외 override', r.reason, '수동 제외');
r = U.evalRecord(rec({ category: '교양', subject: '실용 경제', grade: 2, raw: 91, credit: 2 }), HUFS,
                 Object.assign({}, OPT, { areaOverride: { '실용 경제': '사회' } }));
eq('교과영역 override로 반영 전환', r.included, true);
eq('  원점수 91 → 1000 채택', r.use, 1000);

/* ═════════ 7. 절사 (소수점 이하 6자리 미만) ═════════ */
section('7. 절사 — 소수점 이하 6자리 미만 절사');
eq('6700 ÷ 7 = 957.142857142… → 957.142857', U.truncDiv(6700, 7, 6), 957.142857);
eq('2850 ÷ 3 = 950 (정확히 나눠떨어짐)', U.truncDiv(2850, 3, 6), 950);
eq('20070 ÷ 21 = 955.714285714… → 955.714285', U.truncDiv(20070, 21, 6), 955.714285);
eq('반올림이 아니라 절사임 (…9999998 → 내림)', U.truncDiv(29999999, 30000, 6), 999.999966);
eq('분모 0 → null', U.truncDiv(100, 0, 6), null);
eq('소수 학점도 처리 (1.5학점)', U.truncDiv(1000 * 1.5, 1.5, 6), 1000);

/* ═════════ 8. 환산등급 상당치 ═════════ */
section('8. 환산등급 상당치 (참고 지표)');
eq('1000점 → 1.00등급', U.equivGrade(1000, HUFS), 1);
eq('960점 → 2.00등급', U.equivGrade(960, HUFS), 2);
eq('0점 → 9.00등급', U.equivGrade(0, HUFS), 9);
near('925점 → 2.5등급 (960~890 중간)', U.equivGrade(925, HUFS), 2.5);
near('955.714285점 → 약 2.061등급', U.equivGrade(955.714285, HUFS), 2.0612245, 1e-6);

/* ═════════ 9. 종합 시나리오 — 손계산 대조 ═════════ */
section('9. 종합 시나리오 (손계산 대조)');
/*  학기 교과                과목        학점 원점수 등급 성취도   판정
    1-1 국어                국어          4    92    2    A     등급960 vs 원점수1000 → 1000
    1-1 수학                수학          4    78    3    B     등급890 vs 원점수890  →  890 (동일)
    1-1 영어                영어          4    88    3    B     등급890 vs 원점수960  →  960
    1-2 기술·가정/정보      정보          3    70    5    C     반영교과 아님 → 제외
    2-1 한국사              한국사        3    84    4    B     등급770 vs 원점수890  →  890
    2-2 과학                물리학Ⅰ      3    95    1    A     등급1000 vs 원점수1000 → 1000
    3-1 수학                기하          3     -    -    A     진로선택 → 1000
    3-1 교양                실용 경제     2    90    -    A     반영교과 아님 → 제외
    3-1 체육                운동과 건강   2     -    -    A     반영교과 아님 → 제외
    3-2 국어                심화 국어     3     -    -    A     반영 학기 밖 → 제외

    분자 = 4×1000 + 4×890 + 4×960 + 3×890 + 3×1000 + 3×1000 = 20070
    분모 = 4+4+4+3+3+3 = 21              → 20070/21 = 955.714285714… → 955.714285
    단순 평균등급(전 교과) = (4×2+4×3+4×3+3×5+3×4+3×1) / (4+4+4+3+3+3) = 62/21 = 2.952380…  */
const STU = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, raw: 92, grade: 2, ach: 'A' }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, raw: 78, grade: 3, ach: 'B' }),
  rec({ year: 1, sem: 1, category: '영어', subject: '영어', credit: 4, raw: 88, grade: 3, ach: 'B' }),
  rec({ year: 1, sem: 2, category: '기술·가정/정보', subject: '정보', credit: 3, raw: 70, grade: 5, ach: 'C' }),
  rec({ year: 2, sem: 1, category: '한국사', subject: '한국사', credit: 3, raw: 84, grade: 4, ach: 'B' }),
  rec({ year: 2, sem: 2, category: '과학', subject: '물리학Ⅰ', credit: 3, raw: 95, grade: 1, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '수학', subject: '기하', credit: 3, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '교양', subject: '실용 경제', credit: 2, raw: 90, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '체육', subject: '운동과 건강', credit: 2, ach: 'A' }),
  rec({ year: 3, sem: 2, category: '국어', subject: '심화 국어', credit: 3, ach: 'A' })
];
const u = U.computeUniv(STU, HUFS, OPT);
eq('반영 과목 수 = 6', u.included.length, 6);
eq('반영 학점 합 = 21', u.credits, 21);
eq('학점×환산 합 = 20070', u.weighted, 20070);
eq('교과 점수 = 955.714285', u.score, 955.714285);
near('환산등급 상당 ≈ 2.0612', u.equiv, 2.0612245, 1e-6);
eq('제외 과목에 정보·실용경제·운동과건강·심화국어 4개',
   u.excluded.filter(x => ['정보', '실용 경제', '운동과 건강', '심화 국어'].includes(x.subject)).length, 4);
eq('정보 제외 사유', u.excluded.find(x => x.subject === '정보').reason, '반영교과 아님 (기타)');
eq('심화 국어 제외 사유', u.excluded.find(x => x.subject === '심화 국어').reason, '반영 학기 밖');
eq('기하는 진로선택으로 반영', u.included.find(x => x.subject === '기하').basis, '성취도');

const p = U.computePlain(STU, OPT, HUFS);
eq('단순 평균등급 학점 합 = 21', p.credits, 21);
eq('단순 평균등급 학점×등급 합 = 62', p.weighted, 62);
near('단순 평균등급 = 2.95238', p.gpa, 62 / 21);
const pr = U.computePlain(STU, Object.assign({}, OPT, { plainScope: 'reflect' }), HUFS);
eq('반영교과만 단순 평균등급 학점 합 = 18', pr.credits, 18);
near('반영교과만 단순 평균등급 = 47/18', pr.gpa, 47 / 18);

section('9-b. 요인 분해');
const an = U.analyze(u, HUFS);
/* 국어 4×(1000-960)=160, 영어 4×(960-890)=280, 한국사 3×(890-770)=360 → 셋 다 원점수 채택 */
eq('원점수가 이긴 과목 = 국어·영어·한국사 3개', an.rawWin.length, 3);
eq('  그 목록', an.rawWin.map(x => x.subject).sort().join(','), '국어,영어,한국사');
eq('국어 채택 근거', u.included.find(x => x.subject === '국어').basis, '원점수');
eq('수학은 등급·원점수 동일이라 이득 없음', u.included.find(x => x.subject === '수학').basis, '동일');
near('원점수 채택 이득 = (160+280+360)/21', an.rawGainPoint, 800 / 21, 1e-9);
eq('진로선택 학점 = 3 (기하)', an.careerCredits, 3);
eq('진로선택 평균 환산 = 1000', an.careerAvg, 1000);
eq('반영교과 밖 등급 과목 = 정보 1개 (3학점)', an.offCredits, 3);
eq('  그 평균등급 = 5', an.offGrade, 5);
near('  반영된 공통·일반선택 평균등급 = 47/18', an.inGrade, 47 / 18);

/* ═════════ 10. 석차·백분위·판정 ═════════ */
section('10. 석차 · 백분위 · 유불리 판정');
let rl = U.rankList([{ id: 'a', value: 950 }, { id: 'b', value: 900 }, { id: 'c', value: 990 }], true);
eq('높을수록 상위: c=1위', rl.byId.c.rank, 1);
eq('  a=2위', rl.byId.a.rank, 2);
eq('  b=3위', rl.byId.b.rank, 3);
near('  a 백분위 = 2/3', rl.byId.a.pct, 200 / 3);
rl = U.rankList([{ id: 'a', value: 2.0 }, { id: 'b', value: 1.5 }, { id: 'c', value: 3.0 }], false);
eq('낮을수록 상위(등급): b=1위', rl.byId.b.rank, 1);
rl = U.rankList([{ id: 'a', value: 950 }, { id: 'b', value: 950 }, { id: 'c', value: 900 },
                 { id: 'd', value: 800 }], true);
eq('동점 2명은 같은 석차 1위', rl.byId.a.rank, 1);
eq('  b도 1위', rl.byId.b.rank, 1);
eq('  다음은 3위 (경쟁 순위)', rl.byId.c.rank, 3);
near('  동점 백분위는 중간석차 기준 1.5/4', rl.byId.a.pct, 37.5);
eq('  동점자 백분위 동일', rl.byId.a.pct, rl.byId.b.pct);
rl = U.rankList([{ id: 'a', value: 950 }, { id: 'b', value: null }], true);
eq('값 없는 학생은 모집단에서 제외 (n=1)', rl.n, 1);
eq('  석차 없음', rl.byId.b, undefined);

eq('백분위가 앞당겨지면 유리', U.verdict(30, 20).tag, 'up');
eq('백분위가 밀리면 불리', U.verdict(20, 30).tag, 'down');
eq('0.5%p 이내는 차이 미미', U.verdict(20, 20.3).tag, 'flat');
eq('산출 불가면 n/a', U.verdict(null, 20).tag, 'n/a');

/* ═════════ 11. 모집단 일괄 산출 ═════════ */
section('11. 모집단 일괄 산출 (computeAll)');
/* 원점수는 높은데 등급이 밀리는 학생 vs 등급은 좋은데 원점수가 낮은 학생 */
function mk(id, ban, no, name, rows) {
  return { id, ban, no, name, sid: '3' + ban + String(no).padStart(2, '0'),
           records: rows.map(o => rec(Object.assign({ year: 1, sem: 1 }, o))) };
}
const 갑 = mk('1-1', 1, 1, '갑', [   // 등급은 2등급대인데 원점수가 아주 높음 (센 학교 상황)
  { category: '국어', subject: '문학', credit: 4, raw: 96, grade: 2 },
  { category: '수학', subject: '미적분', credit: 4, raw: 94, grade: 2 },
  { category: '영어', subject: '영어Ⅰ', credit: 4, raw: 95, grade: 2 }
]);
const 을 = mk('1-2', 1, 2, '을', [   // 등급은 같은 2등급인데 원점수는 커트라인 언저리
  { category: '국어', subject: '문학', credit: 4, raw: 86, grade: 2 },
  { category: '수학', subject: '미적분', credit: 4, raw: 81, grade: 2 },
  { category: '영어', subject: '영어Ⅰ', credit: 4, raw: 85, grade: 2 }
]);
const 병 = mk('1-3', 1, 3, '병', [   // 등급은 1등급인데 반영교과 밖에서 까먹음 → 외대에선 영향 없음
  { category: '국어', subject: '문학', credit: 4, raw: 91, grade: 1 },
  { category: '수학', subject: '미적분', credit: 4, raw: 92, grade: 1 },
  { category: '영어', subject: '영어Ⅰ', credit: 4, raw: 90, grade: 1 },
  { category: '체육', subject: '체육', credit: 4, ach: 'C' },
  { category: '기술·가정', subject: '기술·가정', credit: 4, raw: 40, grade: 8 }
]);
const all = U.computeAll([갑, 을, 병], HUFS, OPT);
const by = {}; all.rows.forEach(x => by[x.name] = x);
eq('갑 교과점수 = 1000 (전부 원점수 90 이상)', by['갑'].univ.score, 1000);
eq('을 교과점수 = 960 (전부 등급 2 = 원점수 2구간)', by['을'].univ.score, 960);
eq('병 교과점수 = 1000', by['병'].univ.score, 1000);
eq('갑·병 동점 1위', by['갑'].univRank.rank, 1);
eq('  병도 1위', by['병'].univRank.rank, 1);
eq('  을은 3위', by['을'].univRank.rank, 3);
near('갑 단순 평균등급 = 2.00', by['갑'].plain.gpa, 2);
/* 병: 문학·미적분·영어 각 4학점 1등급 + 기술·가정 4학점 8등급 (체육은 성취도라 등급 산출 없음)
   → (4+4+4+32) / (4+4+4+4) = 44/16 = 2.75 */
near('병 단순 평균등급 = 44/16 = 2.75', by['병'].plain.gpa, 2.75);
eq('  성취도 과목(체육)은 단순 평균등급 분모에서도 빠짐', by['병'].plain.credits, 16);
eq('단순 기준 1위는 갑·을 동점 (2.00)', by['갑'].plainRank.rank, 1);
eq('  병은 3위 (2.75)', by['병'].plainRank.rank, 3);
eq('병은 외대 환산에서 유리 (3위 → 1위)', by['병'].verdict.tag, 'up');
eq('  석차 변화 +2', by['병'].rankDelta, 2);
eq('을은 외대 환산에서 불리', by['을'].verdict.tag, 'down');
eq('모집단 n=3', all.nUniv, 3);

/* ═════════ 12. 학기 범위 ═════════ */
section('12. 반영 학기 범위');
const spanOpt = k => Object.assign({}, OPT, k);
eq('3-1까지: 심화 국어(3-2) 제외',
   U.computeUniv(STU, HUFS, spanOpt({ semTo: 31 })).included.some(x => x.subject === '심화 국어'), false);
eq('3-2까지: 심화 국어 포함',
   U.computeUniv(STU, HUFS, spanOpt({ semTo: 32 })).included.some(x => x.subject === '심화 국어'), true);
eq('2-2까지: 기하(3-1) 제외',
   U.computeUniv(STU, HUFS, spanOpt({ semTo: 22 })).included.some(x => x.subject === '기하'), false);
eq('2-1부터: 1학년 과목 제외',
   U.computeUniv(STU, HUFS, spanOpt({ semFrom: 21 })).included.some(x => x.year === 1), false);
const u32 = U.computeUniv(STU, HUFS, spanOpt({ semTo: 32 }));
eq('3-2 포함 시 학점 합 = 24', u32.credits, 24);
eq('3-2 포함 시 분자 = 20070 + 3×1000 = 23070', u32.weighted, 23070);
eq('3-2 포함 교과점수 = 23070/24 = 961.25', u32.score, 961.25);

/* ═════════ 13. 계열 자동판정 ═════════ */
section('13. 계열 자동 판정 (생기부 기재값 기준)');
eq('석차등급 있으면 general', U.kindOf(rec({ grade: 3, ach: 'B' })), 'general');
eq('성취도만 있으면 career', U.kindOf(rec({ ach: 'A' })), 'career');
eq('P면 pass', U.kindOf(rec({ ach: 'P' })), 'pass');
eq('둘 다 없으면 none', U.kindOf(rec({})), 'none');
r = ev({ category: '수학', subject: '기하', grade: 3, raw: 88, credit: 3 });
eq('진로선택 과목명인데 등급이 있으면 경고', r.warn.length > 0, true);
eq('  그래도 기재값(등급) 기준으로 general 처리', r.kind, 'general');

/* ═════════ 13-b. 2015 개정 교육과정 과목표 ═════════ */
section('13-b. 2015 개정 교육과정 보통 교과 과목표');
const L = s => { const x = U.lookupSubject(s); return x ? x.group + '/' + x.curr : null; };
/* 공통과목 6+1 (과학탐구실험 포함) */
[['국어', '국어'], ['수학', '수학'], ['영어', '영어'], ['통합사회', '사회(역사/도덕 포함)'],
 ['통합과학', '과학'], ['한국사', '한국사'], ['과학탐구실험', '과학']].forEach(([s, g]) => {
  eq(`공통과목 '${s}' → ${g}`, L(s), g + '/common');
});
/* 일반선택 표본 */
[['문학', '국어'], ['미적분', '수학'], ['확률과 통계', '수학'], ['영어Ⅰ', '영어'],
 ['생활과 윤리', '사회(역사/도덕 포함)'], ['사회·문화', '사회(역사/도덕 포함)'],
 ['물리학Ⅰ', '과학'], ['체육', '체육'], ['음악', '예술'], ['정보', '기술·가정'],
 ['일본어Ⅰ', '제2외국어'], ['한문Ⅰ', '한문'], ['실용 경제', '교양']].forEach(([s, g]) => {
  eq(`일반선택 '${s}' → ${g}`, L(s), g + '/general');
});
/* 진로선택 표본 */
[['심화 국어', '국어'], ['고전 읽기', '국어'], ['기하', '수학'], ['경제 수학', '수학'],
 ['인공지능 수학', '수학'], ['진로 영어', '영어'], ['여행지리', '사회(역사/도덕 포함)'],
 ['고전과 윤리', '사회(역사/도덕 포함)'], ['물리학Ⅱ', '과학'], ['융합과학', '과학'],
 ['스포츠 생활', '체육'], ['인공지능 기초', '기술·가정'], ['일본어Ⅱ', '제2외국어'],
 ['한문Ⅱ', '한문']].forEach(([s, g]) => {
  eq(`진로선택 '${s}' → ${g}`, L(s), g + '/career');
});
eq('교육과정 표에 없는 과목은 null', L('학교자율탐구'), null);

section('13-c. 과목명 표기 흔들림 흡수');
eq("'물리학Ⅰ' (로마자)", U.normSubj('물리학Ⅰ'), '물리학1');
eq("'물리학I' (라틴 대문자 I)", U.normSubj('물리학I'), '물리학1');
eq("'물리학 I' (공백 포함)", U.normSubj('물리학 I'), '물리학1');
eq("'사회·문화' 가운뎃점", U.normSubj('사회·문화'), '사회문화');
eq("'기술 · 가정'", U.normSubj('기술 · 가정'), '기술가정');
eq('세 표기 모두 같은 과목으로 조회',
   [L('물리학Ⅰ'), L('물리학I'), L('물리학 I')].join('|'), '과학/general|과학/general|과학/general');
eq("'화법과 작문' / '화법과작문' 동일", L('화법과작문'), L('화법과 작문'));

section('13-d. 교육과정 표 기준 계열 판정 + 어긋난 기록 경고');
const EK = (subject, o) => {
  const x = U.evalRecord(rec(Object.assign({ subject, category: '', credit: 3 }, o)), HUFS, OPT);
  return x;
};
r = EK('기하', { ach: 'A', raw: 88 });
eq('진로선택 기하 + 성취도 A → career, 경고 없음', r.kind + '/' + (r.warn ? 'warn' : 'ok'), 'career/ok');
r = EK('문학', { grade: 3, raw: 88 });
eq('일반선택 문학 + 석차등급 → general, 경고 없음', r.kind + '/' + (r.warn ? 'warn' : 'ok'), 'general/ok');
r = EK('체육', { ach: 'A' });
eq('체육 일반선택은 성취도만 나오는 게 정상 → 경고 없음', r.kind + '/' + (r.warn ? 'warn' : 'ok'), 'career/ok');
r = EK('과학탐구실험', { ach: 'A' });
eq('과학탐구실험은 공통과목이지만 성취도만 → 경고 없음', r.kind + '/' + (r.warn ? 'warn' : 'ok'), 'career/ok');
eq('  교육과정 구분은 공통과목', r.curr, 'common');
r = EK('물리학Ⅰ', { ach: 'B', raw: 77 });
eq('일반선택인데 석차등급이 없으면 기재값(성취도)대로 처리', r.kind, 'career');
eq('  단 확인 경고를 남김', r.warn.length > 0, true);
r = EK('기하', { grade: 3, raw: 88 });
eq('진로선택인데 성취도가 없으면 기재값(등급)대로 처리', r.kind, 'general');
eq('  단 확인 경고를 남김', r.warn.length > 0, true);
r = EK('논술', { ach: 'P' });
eq('교양 논술은 P가 정상 → 경고 없음', r.kind + '/' + (r.warn ? 'warn' : 'ok'), 'pass/ok');
eq('자동 분류 라벨', U.currLabel('기하'), '2015 수학 · 진로선택');
eq('  공통과목 라벨', U.currLabel('통합사회'), '2015 사회(역사/도덕 포함) · 공통과목');
eq('  표에 없는 과목 라벨', U.currLabel('학교자율탐구'), '교육과정 표에 없음 — 기재값으로 판정');

section('13-e. 공통과목 판정은 교육과정 표가 근거');
['국어', '수학', '영어', '통합사회', '통합과학', '한국사', '과학탐구실험']
  .forEach(s => eq(`'${s}' 공통과목`, U.isCommon(s), true));
['문학', '미적분', '영어Ⅰ', '생활과 윤리', '물리학Ⅰ', '기하', '체육']
  .forEach(s => eq(`'${s}' 공통과목 아님`, U.isCommon(s), false));
eq("'국 어' 공백 흡수", U.isCommon('국 어'), true);
eq('가천대는 과학탐구실험도 공통과목으로 빼야 한다',
   U.evalRecord(rec({ category: '과학', subject: '과학탐구실험', credit: 1, raw: 90, ach: 'A' }),
                GACHON, OPT).reason, '공통과목 미반영');

/* ═════════ 14. 가천대 — 변환등급 · 배점 표 ═════════ */
section('14. 가천대 지역균형 — 변환등급 및 배점');
const gv = o => U.evalRecord(rec(o), GACHON, OPT);
/* 진로선택: 원점수 기준 (성취도가 아님) */
[[100, 'A', 100], [70, 'A', 100], [69.9, 'B', 99.5], [50, 'B', 99.5], [49.9, 'E', 70], [0, 'E', 70]]
  .forEach(([raw, cg, pt]) => {
    const x = gv({ category: '수학', subject: '기하', credit: 3, raw, ach: 'A' });
    eq(`진로선택 원점수 ${raw} → ${cg}(${pt})`, x.convGrade + '/' + x.use, cg + '/' + pt);
  });
eq('진로선택은 성취도가 아니라 원점수로 판정 (성취도 A라도 원점수 45면 E)',
   gv({ category: '수학', subject: '기하', credit: 3, raw: 45, ach: 'A' }).use, 70);
eq('진로선택 원점수 없으면 제외',
   gv({ category: '수학', subject: '기하', credit: 3, ach: 'A' }).reason, '진로선택 원점수 없음');
/* 일반선택: 석차등급 기준 */
[[1, 'A', 100], [2, 'A', 100], [3, 'A', 100], [4, 'A', 100], [5, 'A', 100],
 [6, 'B', 99.5], [7, 'B', 99.5], [8, 'E', 70], [9, 'E', 70]].forEach(([g, cg, pt]) => {
  const x = gv({ category: '국어', subject: '문학', credit: 4, grade: g, raw: 50 });
  eq(`일반선택 ${g}등급 → ${cg}(${pt})`, x.convGrade + '/' + x.use, cg + '/' + pt);
});
eq('일반선택은 원점수가 아무리 높아도 등급으로 판정 (6등급·원점수 99 → B)',
   gv({ category: '국어', subject: '문학', credit: 4, grade: 6, raw: 99 }).use, 99.5);

section('14-b. 가천대 — 공통과목 미반영');
['국어', '수학', '영어', '통합사회', '통합과학', '한국사'].forEach(s => {
  eq(`공통과목 '${s}' 제외`,
     gv({ category: s === '한국사' ? '한국사' : '국어', subject: s, credit: 4, grade: 1, raw: 95 }).reason,
     '공통과목 미반영');
});
eq('일반선택 문학은 반영', gv({ category: '국어', subject: '문학', credit: 4, grade: 1, raw: 95 }).included, true);
eq("공백·로마자 정규화 ('국 어' 도 공통과목)", U.isCommon('국 어'), true);
eq("'문학'은 공통과목 아님", U.isCommon('문학'), false);
eq('외대는 공통과목을 반영함 (규격 차이)',
   U.evalRecord(rec({ category: '국어', subject: '국어', credit: 4, grade: 1, raw: 95 }), HUFS, OPT).included, true);

/* ═════════ 15. 가천대 종합 시나리오 (손계산 대조) ═════════ */
section('15. 가천대 종합 시나리오 (손계산 대조)');
/*  학기 교과   과목            학점 원점수 등급 성취도  판정
    1-1 국어   국어              4    92    2    A    공통과목 → 제외
    1-1 수학   수학              4    78    3    B    공통과목 → 제외
    1-1 한국사 한국사            3    84    4    B    공통과목 → 제외
    2-1 국어   문학              4    88    3    B    일반선택 3등급 → A(100)
    2-1 수학   수학Ⅰ            4    71    6    C    일반선택 6등급 → B(99.5)
    2-2 영어   영어 독해와 작문  4    55    8    D    일반선택 8등급 → E(70)
    3-1 수학   기하              3    82    -    A    진로선택 원점수 82 → A(100)
    3-1 과학   물리학Ⅱ          3    64    -    B    진로선택 원점수 64 → B(99.5)
    3-1 사회   여행지리          2    45    -    C    진로선택 원점수 45 → E(70)
    3-1 체육   운동과 건강       2     -    -    A    반영교과 아님 → 제외

    일반선택 = (4×100 + 4×99.5 + 4×70) / 12 = 1078/12 = 89.833333…
    진로선택 = (3×100 + 3×99.5 + 2×70) /  8 =  738.5/8 = 92.3125
    교과 점수 = 92.3125×0.6 + 89.833333…×0.4 = 55.3875 + 35.933333… = 91.320833…          */
const G_STU = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, raw: 92, grade: 2, ach: 'A' }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, raw: 78, grade: 3, ach: 'B' }),
  rec({ year: 1, sem: 1, category: '한국사', subject: '한국사', credit: 3, raw: 84, grade: 4, ach: 'B' }),
  rec({ year: 2, sem: 1, category: '국어', subject: '문학', credit: 4, raw: 88, grade: 3, ach: 'B' }),
  rec({ year: 2, sem: 1, category: '수학', subject: '수학Ⅰ', credit: 4, raw: 71, grade: 6, ach: 'C' }),
  rec({ year: 2, sem: 2, category: '영어', subject: '영어 독해와 작문', credit: 4, raw: 55, grade: 8, ach: 'D' }),
  rec({ year: 3, sem: 1, category: '수학', subject: '기하', credit: 3, raw: 82, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '과학', subject: '물리학Ⅱ', credit: 3, raw: 64, ach: 'B' }),
  rec({ year: 3, sem: 1, category: '사회(역사/도덕 포함)', subject: '여행지리', credit: 2, raw: 45, ach: 'C' }),
  rec({ year: 3, sem: 1, category: '체육', subject: '운동과 건강', credit: 2, ach: 'A' })
];
const gu = U.computeUniv(G_STU, GACHON, OPT);
const grp = {}; gu.groups.forEach(g => grp[g.key] = g);
eq('일반선택 그룹 학점 = 12', grp.general.credits, 12);
eq('일반선택 그룹 배점 합 = 1078', grp.general.weighted, 1078);
near('일반선택 평균 = 89.833333…', grp.general.avg, 1078 / 12);
eq('일반선택 반영비율 40%', grp.general.weight, 0.4);
eq('진로선택 그룹 학점 = 8', grp.career.credits, 8);
eq('진로선택 그룹 배점 합 = 738.5', grp.career.weighted, 738.5);
eq('진로선택 평균 = 92.3125', grp.career.avg, 92.3125);
eq('진로선택 반영비율 60%', grp.career.weight, 0.6);
near('교과 점수 = 91.320833…', gu.score, 92.3125 * 0.6 + (1078 / 12) * 0.4);
eq('반영 과목 6개', gu.included.length, 6);
eq('환산등급 상당은 산출하지 않음 (등급 척도 없음)', gu.equiv, null);
eq('비율 재조정 없음', gu.renormalized, false);
eq('국어 제외 사유', gu.excluded.find(x => x.subject === '국어').reason, '공통과목 미반영');
eq('운동과 건강 제외 사유', gu.excluded.find(x => x.subject === '운동과 건강').reason, '반영교과 아님 (체예)');
eq('여행지리는 사회 교과 진로선택으로 반영', grp.career.items.some(x => x.subject === '여행지리'), true);

const gp = U.computePlain(G_STU, OPT, GACHON);
near('단순 평균등급(전 교과) = 100/23', gp.gpa, 100 / 23);
const gpr = U.computePlain(G_STU, Object.assign({}, OPT, { plainScope: 'reflect' }), GACHON);
eq("'대학 반영교과만' 범위는 공통과목도 뺀다 → 12학점", gpr.credits, 12);
near('  그 평균등급 = 68/12', gpr.gpa, 68 / 12);

section('15-b. 가천대 요인 분해');
const ga = U.analyze(gu, GACHON);
eq('mode = grouped', ga.mode, 'grouped');
eq('공통과목으로 빠진 학점 = 11', ga.commonCredits, 11);
near('  그 평균등급 = 32/11', ga.commonGrade, 32 / 11);
eq('진로선택 변환등급 학점 분포 A:3 B:3 E:2',
   JSON.stringify(ga.convCount.career), JSON.stringify({ A: 3, B: 3, E: 2 }));
eq('일반선택 변환등급 학점 분포 A:4 B:4 E:4',
   JSON.stringify(ga.convCount.general), JSON.stringify({ A: 4, B: 4, E: 4 }));

section('15-c. 한쪽 그룹이 비면 비율 재조정');
const onlyCareer = U.computeUniv([
  rec({ year: 3, sem: 1, category: '수학', subject: '기하', credit: 3, raw: 82, ach: 'A' })
], GACHON, OPT);
eq('진로선택만 있으면 그 평균이 곧 교과점수', onlyCareer.score, 100);
eq('  재조정 표시', onlyCareer.renormalized, true);
const onlyGeneral = U.computeUniv([
  rec({ year: 2, sem: 1, category: '국어', subject: '문학', credit: 4, raw: 88, grade: 6 })
], GACHON, OPT);
eq('일반선택만 있으면 그 평균이 곧 교과점수', onlyGeneral.score, 99.5);
eq('반영 과목이 하나도 없으면 null', U.computeUniv([
  rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' })
], GACHON, OPT).score, null);

section('15-d. 같은 학생, 대학이 바뀌면 결과도 달라진다');
const bothAll = U.computeAll(
  [{ id: 'x', ban: 1, no: 1, name: '표본', sid: '3101', records: G_STU }], GACHON, OPT);
eq('가천대 모집단 산출 성공', bothAll.rows[0].univ.score !== null, true);
const hufsSame = U.computeUniv(G_STU, HUFS, OPT);
eq('외대는 공통과목까지 반영해 학점이 더 많다', hufsSame.credits > gu.credits, true);
/* 외대: 공통 3과목(4+4+3) + 일반선택 3과목(4+4+4) + 진로선택 3과목(3+3+2) = 31학점
   가천대: 공통 11학점을 빼고 일반선택 12 + 진로선택 8 = 20학점 */
eq('  외대 반영 학점 = 31', hufsSame.credits, 31);
eq('  가천대 반영 학점 = 20', gu.credits, 20);

/* ═════════ 16. 숭실대 — 규격 확정(계열) · 점수표 ═════════ */
section('16. 숭실대 — 계열별 규격 확정');
const SSU = k => U.resolve('ssu', k);
eq('인문계열 반영교과', SSU('inmun').areas.join(','), '국어,수학,영어,사회');
eq('  가중치 35/15/35/15', JSON.stringify(SSU('inmun').weights),
   JSON.stringify({ '국어': 35, '수학': 15, '영어': 35, '사회': 15 }));
eq('경상계열 가중치 20/30/35/15', JSON.stringify(SSU('gyeongsang').weights),
   JSON.stringify({ '국어': 20, '수학': 30, '영어': 35, '사회': 15 }));
eq('자유전공학부(인문) 가중치 30/20/30/20', JSON.stringify(SSU('jayu-in').weights),
   JSON.stringify({ '국어': 30, '수학': 20, '영어': 30, '사회': 20 }));
eq('자연계열 반영교과 (사회·한국사 미반영)', SSU('jayeon').areas.join(','), '국어,수학,영어,과학');
eq('  가중치 15/35/25/25', JSON.stringify(SSU('jayeon').weights),
   JSON.stringify({ '국어': 15, '수학': 35, '영어': 25, '과학': 25 }));
eq('예체능은 공통·일반선택 100%', SSU('yeche').generalPct, 100);
eq('  진로선택 미반영', SSU('yeche').careerPct, 0);
eq('교과우수자는 공통·일반선택 80%', SSU('inmun').generalPct, 80);
eq('  진로선택 20%', SSU('inmun').careerPct, 20);
eq('알 수 없는 계열은 첫 변형으로 폴백', SSU('없는계열').variantKey, 'inmun');
[[1, 10.0], [2, 9.5], [3, 9.0], [4, 8.5], [5, 8.0], [6, 7.0], [7, 5.0], [8, 3.0], [9, 0]]
  .forEach(([g, v]) => eq(`${g}등급 → ${v}점`, SSU('inmun').gradeConv[g - 1], v));
const sv = (k, o) => U.evalRecord(rec(Object.assign({ credit: 3 }, o)), SSU(k), OPT);
eq('진로선택 A → 1등급 → 10.0', sv('inmun', { category: '국어', subject: '고전 읽기', ach: 'A' }).use, 10.0);
eq('진로선택 B → 2등급 → 9.5', sv('inmun', { category: '국어', subject: '고전 읽기', ach: 'B' }).use, 9.5);
eq('진로선택 C → 3등급 → 9.0', sv('inmun', { category: '국어', subject: '고전 읽기', ach: 'C' }).use, 9.0);
eq('예체능은 진로선택을 아예 제외',
   sv('yeche', { category: '국어', subject: '고전 읽기', ach: 'A' }).reason, '이 전형은 진로선택 미반영');
eq('자연계열에서 사회 교과는 반영교과 아님',
   sv('jayeon', { category: '사회(역사/도덕 포함)', subject: '생활과 윤리', grade: 2 }).reason,
   '반영교과 아님 (사회)');
eq('인문계열에서 과학 교과는 반영교과 아님',
   sv('inmun', { category: '과학', subject: '물리학Ⅰ', grade: 2 }).reason, '반영교과 아님 (과학)');
eq('인문계열은 한국사를 사회로 반영',
   sv('inmun', { category: '한국사', subject: '한국사', grade: 2 }).included, true);
eq('숭실대는 공통과목도 반영',
   sv('inmun', { category: '국어', subject: '국어', grade: 1 }).included, true);

/* ═════════ 17. 숭실대 종합 시나리오 (손계산 대조) ═════════ */
section('17. 숭실대 인문계열 종합 시나리오 (손계산 대조)');
/*  공통·일반선택 (교과별 이수단위 가중평균 → 교과 가중치로 합산 → 80점 환산)
      국어: 국어 4학점 1등급(10.0) + 문학 4학점 3등급(9.0)      → (40+36)/8 = 9.5
      수학: 수학 4학점 2등급(9.5)  + 미적분 4학점 4등급(8.5)    → (38+34)/8 = 9.0
      영어: 영어 4학점 2등급(9.5)  + 영어Ⅰ 4학점 2등급(9.5)     → 9.5
      사회: 통합사회 3학점 3등급(9.0) + 한국사 3학점 5등급(8.0) → (27+24)/6 = 8.5
      가중합 = (9.5×35 + 9.0×15 + 9.5×35 + 8.5×15) / 100
             = (332.5 + 135 + 332.5 + 127.5) / 100 = 927.5/100 = 9.275
      공통·일반선택 환산점수 = 9.275 / 10 × 80 = 74.2
    진로선택 (교과 구분 없이 한 덩어리, 3과목 → 상한 20%)
      고전 읽기 3학점 A(10.0) + 심화 국어 3학점 B(9.5) + 여행지리 2학점 A(10.0)
      → (30 + 28.5 + 20) / 8 = 78.5/8 = 9.8125
      진로선택 환산점수 = 9.8125 / 10 × 20 = 19.625
    최종 = 74.2 + 19.625 = 93.825                                            */
const S_STU = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 1, raw: 95, ach: 'A' }),
  rec({ year: 2, sem: 1, category: '국어', subject: '문학', credit: 4, grade: 3, raw: 84, ach: 'B' }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, grade: 2, raw: 90, ach: 'A' }),
  rec({ year: 2, sem: 1, category: '수학', subject: '미적분', credit: 4, grade: 4, raw: 78, ach: 'B' }),
  rec({ year: 1, sem: 1, category: '영어', subject: '영어', credit: 4, grade: 2, raw: 91, ach: 'A' }),
  rec({ year: 2, sem: 1, category: '영어', subject: '영어Ⅰ', credit: 4, grade: 2, raw: 89, ach: 'A' }),
  rec({ year: 1, sem: 2, category: '사회(역사/도덕 포함)', subject: '통합사회', credit: 3, grade: 3, raw: 85, ach: 'B' }),
  rec({ year: 2, sem: 1, category: '한국사', subject: '한국사', credit: 3, grade: 5, raw: 72, ach: 'C' }),
  rec({ year: 3, sem: 1, category: '국어', subject: '고전 읽기', credit: 3, raw: 92, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '국어', subject: '심화 국어', credit: 3, raw: 85, ach: 'B' }),
  rec({ year: 3, sem: 1, category: '사회(역사/도덕 포함)', subject: '여행지리', credit: 2, raw: 94, ach: 'A' }),
  rec({ year: 2, sem: 2, category: '과학', subject: '물리학Ⅰ', credit: 3, grade: 6, raw: 62, ach: 'C' }),
  rec({ year: 1, sem: 2, category: '체육', subject: '체육', credit: 2, ach: 'A' })
];
const su = U.computeUniv(S_STU, SSU('inmun'), OPT);
const ag = {}; su.areaGroups.forEach(g => ag[g.key] = g);
eq('국어교과 평균 9.5', ag['국어'].avg, 9.5);
eq('수학교과 평균 9.0', ag['수학'].avg, 9.0);
eq('영어교과 평균 9.5', ag['영어'].avg, 9.5);
eq('사회교과 평균 8.5 (통합사회 + 한국사)', ag['사회'].avg, 8.5);
eq('  사회교과 학점 6 (한국사가 사회로 합류)', ag['사회'].credits, 6);
near('가중합 = 9.275', su.generalAvg, 9.275);
near('공통·일반선택 환산점수 = 74.2', su.generalScore, 74.2);
eq('진로선택 3과목 → 상한 20%', su.careerCap, 20);
eq('  진로선택 과목 수', su.careerCount, 3);
near('  진로선택 평균 = 9.8125', su.careerAvg, 9.8125);
near('  진로선택 환산점수 = 19.625', su.careerScore, 19.625);
near('최종 교과 점수 = 93.825', su.score, 93.825);
eq('총점 만점 = 100 (상한 20 적용)', su.scoreMax, 100);
eq('물리학Ⅰ은 인문계열 반영교과 아님',
   su.excluded.find(x => x.subject === '물리학Ⅰ').reason, '반영교과 아님 (과학)');
eq('체육도 제외', su.excluded.find(x => x.subject === '체육').reason, '반영교과 아님 (체예)');
near('환산등급 상당 = 93.825/10 → 8.5~9.0 구간', u_equiv(su.score), 3 + (9.0 - 9.3825) / (9.0 - 8.5));
function u_equiv(sc) { return U.equivGrade(sc, SSU('inmun')); }

section('17-b. 진로선택 최대 취득 비율 제한');
/* 같은 공통·일반선택 성적에 진로선택만 줄여 본다. 전부 A(10.0)라면
     3과목 이상 → 20 · 2과목 → 18 · 1과목 → 16 · 0과목 → 0 */
function ssuWith(careerSubjects) {
  const base = S_STU.filter(r => !['고전 읽기', '심화 국어', '여행지리'].includes(r.subject));
  const extra = careerSubjects.map(s =>
    rec({ year: 3, sem: 1, category: '국어', subject: s, credit: 3, raw: 95, ach: 'A' }));
  return U.computeUniv(base.concat(extra), SSU('inmun'), OPT);
}
let x = ssuWith(['고전 읽기', '심화 국어', '실용 국어']);
eq('3과목 전부 A → 상한 20, 진로 점수 20', [x.careerCap, x.careerScore].join('/'), '20/20');
near('  총점 = 74.2 + 20 = 94.2', x.score, 94.2);
eq('  총점 만점 100', x.scoreMax, 100);
x = ssuWith(['고전 읽기', '심화 국어']);
eq('2과목 전부 A → 상한 18, 진로 점수 18', [x.careerCap, x.careerScore].join('/'), '18/18');
near('  총점 = 92.2 (만점이 98로 내려감)', x.score, 92.2);
eq('  총점 만점 98', x.scoreMax, 98);
x = ssuWith(['고전 읽기']);
eq('1과목 A → 상한 16, 진로 점수 16', [x.careerCap, x.careerScore].join('/'), '16/16');
near('  총점 = 90.2 (만점이 96으로 내려감)', x.score, 90.2);
eq('  총점 만점 96', x.scoreMax, 96);
x = ssuWith([]);
eq('0과목 → 상한 0', x.careerCap, 0);
near('  총점 = 74.2 (만점이 80으로 내려감)', x.score, 74.2);
eq('  총점 만점 80', x.scoreMax, 80);
eq('상한 손실은 요인 분해에 기록', U.analyze(ssuWith(['고전 읽기']), SSU('inmun')).capLoss, 4);

section('17-c. 계열을 바꾸면 같은 학생도 점수가 달라진다');
/* 자연계열: 국어 9.5×15 + 수학 9.0×35 + 영어 9.5×25 + 과학 7.0×25 (물리학Ⅰ 6등급)
   = (142.5 + 315 + 237.5 + 175)/100 = 870/100 = 8.70 → 8.70/10×80 = 69.6
   진로선택은 국어 2과목만 반영교과 (여행지리는 사회 → 자연계열 미반영)
   → 2과목, (30 + 28.5)/6 = 9.75 → 9.75/10×18 = 17.55 → 총 87.15 */
const suJ = U.computeUniv(S_STU, SSU('jayeon'), OPT);
const agJ = {}; suJ.areaGroups.forEach(g => agJ[g.key] = g);
eq('자연계열은 과학교과가 들어온다 (물리학Ⅰ 6등급 → 7.0)', agJ['과학'].avg, 7.0);
eq('  사회교과 자리 없음', agJ['사회'], undefined);
near('  가중합 = 8.70', suJ.generalAvg, 8.70);
near('  공통·일반선택 = 69.6', suJ.generalScore, 69.6);
eq('  여행지리(사회)는 진로선택에서도 빠져 2과목', suJ.careerCount, 2);
eq('  → 상한 18', suJ.careerCap, 18);
near('  진로선택 평균 9.75', suJ.careerAvg, 9.75);
near('  최종 = 87.15', suJ.score, 87.15);
eq('한국사는 자연계열에서 제외',
   suJ.excluded.find(x => x.subject === '한국사').reason, '반영교과 아님 (사회)');

const suY = U.computeUniv(S_STU, SSU('yeche'), OPT);
near('예체능은 공통·일반선택 100% → 9.275/10×100 = 92.75', suY.score, 92.75);
eq('  진로선택 0점', suY.careerScore, 0);
eq('  총점 만점 100', suY.scoreMax, 100);

section('17-d. 이수 과목이 없는 교과는 가중치 재정규화');
/* 사회 교과가 통째로 없으면 국35 + 수15 + 영35 = 85로 재정규화 */
const noSocial = S_STU.filter(r => !['통합사회', '한국사', '여행지리'].includes(r.subject));
const suN = U.computeUniv(noSocial, SSU('inmun'), OPT);
near('가중합 = (9.5×35 + 9.0×15 + 9.5×35)/85', suN.generalAvg, (9.5 * 35 + 9.0 * 15 + 9.5 * 35) / 85);
eq('  재정규화 표시', suN.renormalized, true);
eq('사회 교과가 있으면 재정규화 아님', su.renormalized, false);

/* ═════════ 18. 체육·예술 성취도 평균 (동점자 처리 보조 지표) ═════════ */
section('18. 체육·예술 교과 성취도 평균 — A 3점 · B 2점 · C 1점');
eq('배점표 A=3', U.ARTS_PE_POINT.A, 3);
eq('배점표 B=2', U.ARTS_PE_POINT.B, 2);
eq('배점표 C=1', U.ARTS_PE_POINT.C, 1);
const PE = [
  rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' }),
  rec({ year: 1, sem: 2, category: '예술', subject: '음악', credit: 2, ach: 'B' }),
  rec({ year: 2, sem: 1, category: '체육', subject: '운동과 건강', credit: 2, ach: 'A' }),
  rec({ year: 2, sem: 2, category: '예술', subject: '미술', credit: 1, ach: 'C' }),
  rec({ year: 3, sem: 1, category: '국어', subject: '문학', credit: 4, grade: 2, raw: 88 }),
  rec({ year: 3, sem: 2, category: '체육', subject: '스포츠 생활', credit: 2, ach: 'A' })
];
let pe = U.computeUniv(PE, GACHON, OPT).artsPe;
/* 3-2 스포츠 생활은 반영 학기(1-1~3-1) 밖이라 빠진다 → A 2 · B 1 · C 1, 4과목 */
eq('반영 학기 안의 체예 과목 4개', pe.count, 4);
eq('  성취도 분포 A2 B1 C1', JSON.stringify(pe.dist), JSON.stringify({ A: 2, B: 1, C: 1 }));
near('  과목 단위 평균 = (3+2+3+1)/4 = 2.25', pe.avg, 2.25);
near('  이수단위 가중 평균 = (6+4+6+1)/7', pe.avgByCredit, 17 / 7);
eq('  체예 학점 합 7', pe.credits, 7);
eq('국어 과목은 안 섞임', pe.items.some(x => x.subject === '문학'), false);
pe = U.computeUniv(PE, GACHON, Object.assign({}, OPT, { semTo: 32 })).artsPe;
eq('3-2까지 넓히면 5과목', pe.count, 5);
near('  평균 = (3+2+3+1+3)/5 = 2.4', pe.avg, 2.4);
pe = U.computeUniv(PE.filter(r => r.category === '국어'), GACHON, OPT).artsPe;
eq('체예 과목이 없으면 평균 null', pe.avg, null);
eq('  과목 수 0', pe.count, 0);
eq('교과 점수 산출에서는 체예가 여전히 제외됨',
   U.computeUniv(PE, GACHON, OPT).included.some(x => x.area === '체예'), false);
eq('외대에서도 같은 보조 지표를 낸다', U.computeUniv(PE, HUFS, OPT).artsPe.count, 4);
eq('수동 제외한 체예 과목은 빠진다',
   U.computeUniv(PE, GACHON, Object.assign({}, OPT, { kindOverride: { '체육': 'skip' } })).artsPe.count, 3);

section('18-b. 가천대 동점자 처리 기준 기술');
eq('동점자 지표 선언', GACHON.tiebreakers[0].key, 'artsPe');
eq('  높을수록 유리', GACHON.tiebreakers[0].better, 'high');
eq('동점자 처리 3단계 기술', GACHON.tiebreakSteps.length, 3);
eq('산출 못 하는 기준 명시', GACHON.tiebreakUnsupported.length, 2);
eq('외대·숭실대는 동점자 지표 미선언', [HUFS.tiebreakers, U.resolve('ssu', 'inmun').tiebreakers]
   .every(x => x === undefined), true);

/* ═════════ 19. 전남대 — 기본점수 + 실질점수 구조 ═════════ */
section('19. 전남대 학생부교과(일반) — 규격');
const CNU = k => U.resolve('cnu', k);
[[1, 100], [2, 95], [3, 90], [4, 85], [5, 80], [6, 75], [7, 70], [8, 65], [9, 0]]
  .forEach(([g, v]) => eq(`${g}등급 → ${v}점`, CNU('all').gradeConv[g - 1], v));
eq('진로선택 A → 15점', CNU('all').achPoint.A, 15);
eq('진로선택 B → 9점', CNU('all').achPoint.B, 9);
eq('진로선택 C → 3점', CNU('all').achPoint.C, 3);
eq('기본점수 660 · 계수 2.25', [CNU('all').basePoints, CNU('all').coef].join('/'), '660/2.25');
eq('전 모집단위 반영교과', CNU('all').areas.join(','), '국어,수학,영어,사회,과학');
eq('예능·체육교육과는 수학·과학 미반영', CNU('arts').areas.join(','), '국어,영어,사회');
const cv = (k, o) => U.evalRecord(rec(Object.assign({ credit: 3 }, o)), CNU(k), OPT);
eq('제2외국어는 전 모집단위에서 미반영',
   cv('all', { category: '제2외국어', subject: '일본어Ⅰ', grade: 3 }).reason, '반영교과 아님 (기타)');
eq('인문대학은 제2외국어 반영',
   cv('inmun', { category: '제2외국어', subject: '일본어Ⅰ', grade: 3 }).included, true);
eq('한문도 인문대학만 반영',
   cv('inmun', { category: '한문', subject: '한문Ⅰ', grade: 2 }).included, true);
eq('교과 열이 묶여 나와도 교육과정 표로 제2외국어를 가려낸다',
   cv('inmun', { category: '기술・가정/제2외국어/한문/교양', subject: '일본어Ⅰ', grade: 3 }).included, true);
eq('  같은 묶음의 교양 과목은 여전히 미반영',
   cv('inmun', { category: '기술・가정/제2외국어/한문/교양', subject: '환경', ach: 'P' }).reason, '이수(P) 과목');
eq('  같은 묶음의 정보(기술·가정)도 미반영',
   cv('inmun', { category: '기술・가정/제2외국어/한문/교양', subject: '정보', grade: 4 }).reason,
   '반영교과 아님 (기타)');
eq('진로선택에 석차등급이 기재되면 석차등급산출과목으로',
   cv('all', { category: '수학', subject: '기하', grade: 2, ach: 'A' }).kind, 'general');
eq('  그 경우 등급점수 95 적용', cv('all', { category: '수학', subject: '기하', grade: 2, ach: 'A' }).use, 95);

section('19-b. 전남대 종합 시나리오 (손계산 대조)');
/*  석차등급산출과목 — 이수단위 가중평균
      국어 4학점 2등급(95) · 수학 4학점 3등급(90) · 영어 4학점 1등급(100)
      통합사회 3학점 4등급(85) · 통합과학 3학점 5등급(80) · 일본어Ⅰ 3학점 7등급(70, 인문대학만)
    [전 모집단위] (380+360+400+255+240)/18 = 1635/18 = 90.8333…
      실질점수 = 90.8333… × 2.25 = 204.375 → 기본 660 + 204.375 = 864.375
    진로선택 (상위 3과목) — 기하 A(15) · 심화 국어 B(9) · 여행지리 A(15) · 생활과 과학 C(3)
      상위 3 = 15 + 15 + 9 = 39 → 39/3 = 13
    최종 = 864.375 + 13 = 877.375                                            */
const N_STU = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 2 }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, grade: 3 }),
  rec({ year: 1, sem: 1, category: '영어', subject: '영어', credit: 4, grade: 1 }),
  rec({ year: 1, sem: 2, category: '사회(역사/도덕포함)', subject: '통합사회', credit: 3, grade: 4 }),
  rec({ year: 1, sem: 2, category: '과학', subject: '통합과학', credit: 3, grade: 5 }),
  rec({ year: 2, sem: 1, category: '기술・가정/제2외국어/한문/교양', subject: '일본어Ⅰ', credit: 3, grade: 7 }),
  rec({ year: 3, sem: 1, category: '수학', subject: '기하', credit: 3, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '국어', subject: '심화 국어', credit: 3, ach: 'B' }),
  rec({ year: 3, sem: 1, category: '사회(역사/도덕포함)', subject: '여행지리', credit: 2, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '과학', subject: '생활과 과학', credit: 2, ach: 'C' })
];
const nu = U.computeUniv(N_STU, CNU('all'), OPT);
eq('석차등급산출과목 학점 18 (일본어 제외)', nu.credits, 18);
near('  이수단위 가중평균 = 1635/18', nu.generalAvg, 1635 / 18);
near('  실질점수 = 204.375', nu.generalReal, 204.375);
near('  기본 660 + 실질 = 864.375', nu.generalScore, 864.375);
eq('진로선택 4과목 이수', nu.careerCount, 4);
eq('  상위 3과목만 반영 (A15 A15 B9)',
   nu.careerTop.map(x => x.use).join(','), '15,15,9');
eq('  진로선택 점수 = 39/3 = 13', nu.careerScore, 13);
eq('  비교내신 아님', nu.careerCompare, false);
near('최종 교과 점수 = 877.375', nu.score, 877.375);
eq('총점 만점 900 (출결 100점 별도)', nu.scoreMax, 900);
near('환산등급 상당은 석차등급산출과목 평균 기준', nu.equiv,
     2 + (95 - 1635 / 18) / (95 - 90));

const nuI = U.computeUniv(N_STU, CNU('inmun'), OPT);
eq('인문대학은 일본어Ⅰ이 들어와 학점 21', nuI.credits, 21);
near('  가중평균 = (1635 + 210)/21', nuI.generalAvg, 1845 / 21);

section('19-c. 진로선택 3과목 미만 → 비교내신');
/* 요강 예시: 석차등급산출과목 실질점수 222.521 → 222.521 × 0.06666 = 14.83 */
near('요강 예시 그대로 — 222.521 × 0.06666 → 14.83',
     Math.round(222.521 * CNU('all').compareCoef * 100) / 100, 14.83);
const twoCareer = N_STU.filter(r => !['여행지리', '생활과 과학'].includes(r.subject));
const nu2 = U.computeUniv(twoCareer, CNU('all'), OPT);
eq('진로선택 2과목 → 비교내신 적용', nu2.careerCompare, true);
near('  비교내신 점수 = 204.375 × 0.06666 (반올림)',
     nu2.careerScore, Math.round(204.375 * 0.06666 * 100) / 100);
eq('  이수한 진로선택은 성적에 반영하지 않음 (상위 3과목 합산 안 씀)',
   nu2.careerScore !== 13, true);
const noCareer = N_STU.filter(r => r.grade !== null);
const nu0 = U.computeUniv(noCareer, CNU('all'), OPT);
eq('진로선택 0과목도 비교내신', nu0.careerCompare, true);
/* 최저점 3 — 실질점수가 아주 낮은 학생 */
const weak = [rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 9 })];
const nuW = U.computeUniv(weak, CNU('all'), OPT);
eq('실질점수 0이면 비교내신 최저점 3 부여', nuW.careerScore, 3);
near('  총점 = 660 + 0 + 3', nuW.score, 663);

section('19-d. 전형요소 배점 정합성');
const perfect = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 1 }),
  rec({ year: 3, sem: 1, category: '수학', subject: '기하', credit: 3, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '국어', subject: '심화 국어', credit: 3, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '영어', subject: '진로 영어', credit: 3, ach: 'A' })
];
const nuP = U.computeUniv(perfect, CNU('all'), OPT);
near('전 과목 1등급 + 진로선택 A → 실질점수 만점 225', nuP.generalReal, 225);
eq('  진로선택 만점 15', nuP.careerScore, 15);
near('  교과 점수 만점 900 (660+225+15)', nuP.score, 900);

/* ═════════ 20. 명지대 — 이수학점 가산점 구조 ═════════ */
section('20. 명지대 학생부교과(특성화고교전형 외) — 규격');
const MJU = k => U.resolve('mju', k);
[[1, 100], [2, 99], [3, 98], [4, 94], [5, 90], [6, 80], [7, 60], [8, 30], [9, 0]]
  .forEach(([g, v]) => eq(`${g}등급 → ${v}점`, MJU('inmun').gradeConv[g - 1], v));
eq('진로선택 성취도 A → 1등급', MJU('inmun').achGrade.A, 1);
eq('  B → 2등급', MJU('inmun').achGrade.B, 2);
eq('  C → 4등급 (3등급이 아니다)', MJU('inmun').achGrade.C, 4);
eq('인문사회계열 반영교과', MJU('inmun').areas.join(','), '국어,수학,영어,사회');
eq('자연공학계열 반영교과', MJU('jayeon').areas.join(','), '국어,수학,영어,과학');
eq('예체능계열은 국어·영어만', MJU('yeche').areas.join(','), '국어,영어');
eq('이수학점 가산점 계수 0.05', MJU('inmun').bonusPerCredit, 0.05);
const mv = (k, o) => U.evalRecord(rec(Object.assign({ credit: 3 }, o)), MJU(k), OPT);
eq('진로선택 A → 100점', mv('inmun', { category: '국어', subject: '심화 국어', ach: 'A' }).use, 100);
eq('진로선택 B → 99점', mv('inmun', { category: '국어', subject: '심화 국어', ach: 'B' }).use, 99);
eq('진로선택 C → 94점 (4등급 자리)', mv('inmun', { category: '국어', subject: '심화 국어', ach: 'C' }).use, 94);
eq('인문사회계열에서 과학은 미반영',
   mv('inmun', { category: '과학', subject: '물리학Ⅰ', grade: 2 }).reason, '반영교과 아님 (과학)');
eq('자연공학계열에서 사회는 미반영',
   mv('jayeon', { category: '사회(역사/도덕포함)', subject: '생활과 윤리', grade: 2 }).reason,
   '반영교과 아님 (사회)');
eq('예체능계열에서 수학은 미반영',
   mv('yeche', { category: '수학', subject: '미적분', grade: 2 }).reason, '반영교과 아님 (수학)');
eq('한국사는 인문사회계열 사회에 포함',
   mv('inmun', { category: '한국사', subject: '한국사', grade: 3 }).included, true);
eq('명지대는 공통과목도 반영',
   mv('inmun', { category: '국어', subject: '국어', grade: 1 }).included, true);

section('20-b. 명지대 종합 시나리오 (손계산 대조)');
/*  국어 국어      4학점 1등급 → 100 → 400
    수학 수학      4학점 3등급 →  98 → 392
    영어 영어      4학점 2등급 →  99 → 396
    사회 통합사회  3학점 4등급 →  94 → 282
    한국사        3학점 5등급 →  90 → 270
    국어 심화 국어 3학점 A(1등급) → 100 → 300
    사회 여행지리  2학점 C(4등급) →  94 → 188
    과학 통합과학  4학점 2등급 (인문사회계열이면 제외)
    체육 체육      2학점 A       (제외)

    [인문사회] 분자 2228 · 분모 23 → 96.869565…
      가산점 23 × 0.05 = 1.15 → 98.019565… → 소수 넷째자리 반올림 → 98.02      */
const M_STU = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 1 }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, grade: 3 }),
  rec({ year: 1, sem: 1, category: '영어', subject: '영어', credit: 4, grade: 2 }),
  rec({ year: 1, sem: 2, category: '사회(역사/도덕포함)', subject: '통합사회', credit: 3, grade: 4 }),
  rec({ year: 2, sem: 1, category: '한국사', subject: '한국사', credit: 3, grade: 5 }),
  rec({ year: 3, sem: 1, category: '국어', subject: '심화 국어', credit: 3, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '사회(역사/도덕포함)', subject: '여행지리', credit: 2, ach: 'C' }),
  rec({ year: 1, sem: 2, category: '과학', subject: '통합과학', credit: 4, grade: 2 }),
  rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' })
];
const mu = U.computeUniv(M_STU, MJU('inmun'), OPT);
eq('반영 학점 23', mu.credits, 23);
eq('학점×환산 합 = 2228', mu.weighted, 2228);
near('가산점 전 가중평균 = 2228/23', mu.base, 2228 / 23);
eq('가산점 대상 학점 = 23', mu.bonusCredits, 23);
near('가산점 = 1.15', mu.bonus, 1.15);
eq('최종 = 98.02 (소수 넷째자리 반올림)', mu.score, Math.round((2228 / 23 + 1.15) * 1000) / 1000);
eq('  값 확인', mu.score, 98.02);
eq('통합과학은 인문사회계열에서 제외',
   mu.excluded.find(x => x.subject === '통합과학').reason, '반영교과 아님 (과학)');
near('환산등급 상당은 가산점 뺀 값 기준', mu.equiv,
     3 + (98 - 2228 / 23) / (98 - 94));

/*  [자연공학] 국어4(400) 수학4(392) 영어4(396) 통합과학4(396) 심화국어3(300)
      분자 1884 · 분모 19 → 99.157894…  가산점 0.95 → 100.107894… → 100.108
      → 가산점 때문에 척도 최고점 100을 넘는다 (요강 명시) */
const muJ = U.computeUniv(M_STU, MJU('jayeon'), OPT);
eq('자연공학 반영 학점 19', muJ.credits, 19);
eq('  학점×환산 합 = 1884', muJ.weighted, 1884);
near('  가산점 = 0.95', muJ.bonus, 0.95);
eq('  최종 = 100.108', muJ.score, Math.round((1884 / 19 + 0.95) * 1000) / 1000);
eq('  가산점 때문에 100점을 넘는다', muJ.score > 100, true);

/*  [예체능] 국어4(400) 영어4(396) 심화국어3(300) = 1096 / 11 → 99.636363…
      가산점 0.55 → 100.186363… → 100.186 */
const muY = U.computeUniv(M_STU, MJU('yeche'), OPT);
eq('예체능 반영 학점 11', muY.credits, 11);
eq('  최종 = 100.186', muY.score, Math.round((1096 / 11 + 0.55) * 1000) / 1000);

section('20-c. 가산점은 이수량이 많을수록 유리하다');
/* 같은 등급 분포인데 학점만 두 배면 가중평균은 같고 가산점만 커진다 */
const lean = [rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 2 })];
const heavy = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 2 }),
  rec({ year: 2, sem: 1, category: '국어', subject: '문학', credit: 4, grade: 2 })
];
const mL = U.computeUniv(lean, MJU('inmun'), OPT);
const mH = U.computeUniv(heavy, MJU('inmun'), OPT);
eq('가중평균은 둘 다 99', [mL.base, mH.base].join('/'), '99/99');
eq('가산점은 0.2 vs 0.4', [mL.bonus, mH.bonus].join('/'), '0.2/0.4');
eq('많이 이수한 쪽이 높다', mH.score > mL.score, true);
near('  차이 = 0.2', mH.score - mL.score, 0.2);

section('20-d. 가산점 학점 합에는 환산 불가 과목도 들어간다');
/* '반영교과 내 모든 이수과목'이므로 이수(P) 과목도 학점 합에 포함된다 */
const withP = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 1 }),
  rec({ year: 1, sem: 1, category: '국어', subject: '고전 읽기', credit: 2, ach: 'P' })
];
const mP = U.computeUniv(withP, MJU('inmun'), OPT);
eq('환산 대상 학점은 4', mP.credits, 4);
eq('  가산점 학점 합은 6 (P 과목 포함)', mP.bonusCredits, 6);
near('  가산점 = 0.3', mP.bonus, 0.3);
eq('반영교과 밖 과목은 가산점에도 안 들어간다',
   U.computeUniv(withP.concat([
     rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' })
   ]), MJU('inmun'), OPT).bonusCredits, 6);
eq('반영 학기 밖 과목도 가산점에서 제외',
   U.computeUniv(withP.concat([
     rec({ year: 3, sem: 2, category: '국어', subject: '문학', credit: 4, grade: 1 })
   ]), MJU('inmun'), OPT).bonusCredits, 6);

section('20-e. 다른 대학은 가산점 영향 없음');
eq('외대는 가산점 필드 없음', HUFS.bonusPerCredit, undefined);
eq('  외대 점수는 종전대로', U.computeUniv(STU, HUFS, OPT).score, 955.714285);
eq('외대는 base도 채워진다 (pooled 공통)', U.computeUniv(STU, HUFS, OPT).base, 955.714285);

/* ═════════ 21. 가천대 학생부우수자 — 두 유형 중 유리한 것 ═════════ */
section('21. 가천대 학생부우수자전형 — 규격');
const GS = U.resolve('gachonS', 'inmun');
eq('산출 구조는 best', GS.mode, 'best');
eq('지역균형과 달리 공통과목을 반영', GS.excludeCommon, false);
eq('  지역균형은 공통과목 미반영', GACHON.excludeCommon, true);
eq('유형 2가지', GS.alternatives.length, 2);
eq('유형1 변환등급 밴드', JSON.stringify(GS.alternatives[0].bands),
   JSON.stringify([[1, 2, 'A'], [3, 4, 'B'], [5, 5, 'C'], [6, 7, 'D'], [8, 9, 'E']]));
eq('유형1 배점 A100 B99.5 C99 D90 E70', JSON.stringify(GS.alternatives[0].pointOf),
   JSON.stringify({ A: 100, B: 99.5, C: 99, D: 90, E: 70 }));
eq('유형2 상위 10과목', GS.alternatives[1].topN, 10);
eq('유형2 배점표', GS.alternatives[1].gradeConv.join(','), '100,99.5,99,98.5,98,97.5,85,60,30');
const gsv = o => U.evalRecord(rec(Object.assign({ credit: 3 }, o)), GS, OPT);
[[1, 'A', 100], [2, 'A', 100], [3, 'B', 99.5], [4, 'B', 99.5], [5, 'C', 99],
 [6, 'D', 90], [7, 'D', 90], [8, 'E', 70], [9, 'E', 70]].forEach(([g, cg, pt]) => {
  const x = gsv({ category: '국어', subject: '문학', grade: g });
  eq(`${g}등급 → 유형1 ${cg}(${pt})`, x.convGrade + '/' + x.altUse.t1, cg + '/' + pt);
});
[[1, 100], [2, 99.5], [3, 99], [4, 98.5], [5, 98], [6, 97.5], [7, 85], [8, 60], [9, 30]]
  .forEach(([g, pt]) => eq(`${g}등급 → 유형2 ${pt}`,
    gsv({ category: '국어', subject: '문학', grade: g }).altUse.t2, pt));
eq('진로선택은 미반영',
   gsv({ category: '수학', subject: '기하', ach: 'A' }).reason, '성취도 산출 과목 (석차등급만 반영)');
eq('공통과목은 반영', gsv({ category: '국어', subject: '국어', grade: 1 }).included, true);
/* 반영교과는 계열별로 갈린다 */
eq('인문계열 반영교과', U.resolve('gachonS', 'inmun').areas.join(','), '국어,수학,영어,사회');
eq('자연계열 반영교과', U.resolve('gachonS', 'jayeon').areas.join(','), '국어,수학,영어,과학');
eq('의예·한의예·약학 반영교과', U.resolve('gachonS', 'med').areas.join(','), '국어,수학,영어,과학');
const gsvV = (k, o) => U.evalRecord(rec(Object.assign({ credit: 3 }, o)),
                                    U.resolve('gachonS', k), OPT);
eq('인문계열에서 과학은 미반영',
   gsvV('inmun', { category: '과학', subject: '물리학Ⅰ', grade: 2 }).reason, '반영교과 아님 (과학)');
eq('자연계열에서 사회는 미반영',
   gsvV('jayeon', { category: '사회(역사/도덕포함)', subject: '생활과 윤리', grade: 2 }).reason,
   '반영교과 아님 (사회)');
eq('인문계열은 한국사를 사회로 반영',
   gsvV('inmun', { category: '한국사', subject: '한국사', grade: 3 }).included, true);
eq('자연계열은 한국사도 미반영',
   gsvV('jayeon', { category: '한국사', subject: '한국사', grade: 3 }).reason, '반영교과 아님 (사회)');
/* 반영교과 밖 교과는 석차등급이 있어도 안 들어온다 */
eq('정보(기술·가정)는 반영교과 밖',
   gsvV('inmun', { category: '기술・가정/제2외국어/한문/교양', subject: '정보', grade: 4 }).reason,
   '반영교과 아님 (기타)');
eq('일본어Ⅰ도 반영교과 밖',
   gsvV('inmun', { category: '기술・가정/제2외국어/한문/교양', subject: '일본어Ⅰ', grade: 5 }).reason,
   '반영교과 아님 (기타)');
eq('체예도 반영교과 밖',
   gsvV('inmun', { category: '체육', subject: '체육', ach: 'A' }).reason, '반영교과 아님 (체예)');
eq('  체예 성취도 평균은 그래도 산출된다',
   U.computeUniv([rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' })],
                 U.resolve('gachonS', 'inmun'), OPT).artsPe.count, 1);

section('21-b. 종합 시나리오 (손계산 대조) — 자연계열, 유형2가 유리한 경우');
/*  자연계열 반영교과(국·수·영·과) 안의 12과목. 사회·체예·진로선택은 빠진다.
    유형1 — 12과목 전부
      국어4(1등급 A100)=400  수학4(3등급 B99.5)=398  영어4(2등급 A100)=400
      통합과학4(4등급 B99.5)=398  문학4(2등급 A100)=400  미적분4(6등급 D90)=360
      영어Ⅰ4(3등급 B99.5)=398  물리학Ⅰ3(8등급 E70)=210  화학Ⅰ3(5등급 C99)=297
      확률과통계4(4등급 B99.5)=398  독서4(2등급 A100)=400  영어Ⅱ4(3등급 B99.5)=398
      합 4457 ÷ 46학점 = 96.891304…
    유형2 — 석차등급 우수 10과목 (미적분 6등급·물리학Ⅰ 8등급이 잘린다)
      400+398+398+398+396+396+396+394+394+294 = 3864 ÷ 39학점 = 99.076923…
    → 유형2 채택                                                              */
const GS_STU = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 1 }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, grade: 3 }),
  rec({ year: 1, sem: 1, category: '영어', subject: '영어', credit: 4, grade: 2 }),
  rec({ year: 1, sem: 2, category: '과학', subject: '통합과학', credit: 4, grade: 4 }),
  rec({ year: 2, sem: 1, category: '국어', subject: '문학', credit: 4, grade: 2 }),
  rec({ year: 2, sem: 1, category: '수학', subject: '미적분', credit: 4, grade: 6 }),
  rec({ year: 2, sem: 1, category: '영어', subject: '영어Ⅰ', credit: 4, grade: 3 }),
  rec({ year: 2, sem: 2, category: '과학', subject: '물리학Ⅰ', credit: 3, grade: 8 }),
  rec({ year: 2, sem: 2, category: '과학', subject: '화학Ⅰ', credit: 3, grade: 5 }),
  rec({ year: 3, sem: 1, category: '수학', subject: '확률과 통계', credit: 4, grade: 4 }),
  rec({ year: 3, sem: 1, category: '국어', subject: '독서', credit: 4, grade: 2 }),
  rec({ year: 3, sem: 1, category: '영어', subject: '영어Ⅱ', credit: 4, grade: 3 }),
  /* 아래는 자연계열에서 빠지는 것들 */
  rec({ year: 2, sem: 2, category: '사회(역사/도덕포함)', subject: '생활과 윤리', credit: 3, grade: 7 }),
  rec({ year: 3, sem: 1, category: '한국사', subject: '한국사', credit: 3, grade: 4 }),
  rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' }),
  rec({ year: 3, sem: 1, category: '수학', subject: '기하', credit: 3, ach: 'A' })
];
const GSJ = U.resolve('gachonS', 'jayeon');
const gu2 = U.computeUniv(GS_STU, GSJ, OPT);
const alt = {}; gu2.alts.forEach(a => alt[a.key] = a);
eq('유형1은 반영 12과목 전부', alt.t1.items.length, 12);
eq('  학점 46', alt.t1.credits, 46);
eq('  배점 합 4457', alt.t1.weighted, 4457);
near('  평균 96.891304…', alt.t1.avg, 4457 / 46);
eq('유형2는 상위 10과목만', alt.t2.items.length, 10);
eq('  학점 39', alt.t2.credits, 39);
eq('  배점 합 3864', alt.t2.weighted, 3864);
near('  평균 99.076923…', alt.t2.avg, 3864 / 39);
eq('6등급 미적분이 유형2에서 잘림', alt.t2.items.some(x => x.subject === '미적분'), false);
eq('8등급 물리학Ⅰ도 잘림', alt.t2.items.some(x => x.subject === '물리학Ⅰ'), false);
eq('유형2 채택', gu2.bestKey, 't2');
eq('  유형1은 미채택', alt.t1.chosen, false);
eq('최종 점수 = 유형2 평균 (소수 넷째자리 반올림)',
   gu2.score, Math.round(3864 / 39 * 10000) / 10000);
near('  나쁜 등급을 잘라 2.19점 올랐다', alt.t2.avg - alt.t1.avg, 3864 / 39 - 4457 / 46);
eq('자연계열이라 사회·한국사는 제외',
   gu2.excluded.find(x => x.subject === '한국사').reason, '반영교과 아님 (사회)');
eq('진로선택 기하는 산출 방식 때문에 제외',
   gu2.excluded.find(x => x.subject === '기하').reason, '성취도 산출 과목 (석차등급만 반영)');
eq('체예는 반영교과 밖',
   gu2.excluded.find(x => x.subject === '체육').reason, '반영교과 아님 (체예)');
eq('체예 성취도 평균은 보조 지표로 산출', gu2.artsPe.count, 1);

section('21-c. 유형1이 유리한 경우');
/* 과목이 10개 이하면 유형2가 전 과목을 쓰므로, 상위 등급 위주면 유형1이 이길 수 있다.
   전 과목 1등급이면 유형1 = 100, 유형2 = 100 → 동률이라 유형1(첫 유형) 채택 */
const allTop = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 1 }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, grade: 1 })
];
const guT = U.computeUniv(allTop, GS, OPT);
eq('전 과목 1등급 → 두 유형 모두 100', [guT.alts[0].avg, guT.alts[1].avg].join('/'), '100/100');
eq('  동률이면 앞 유형 채택', guT.bestKey, 't1');
/* 전 과목 2등급: 유형1 A=100, 유형2 99.5 → 유형1이 유리 */
const allTwo = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 2 }),
  rec({ year: 1, sem: 1, category: '수학', subject: '수학', credit: 4, grade: 2 })
];
const gu2b = U.computeUniv(allTwo, GS, OPT);
eq('전 과목 2등급 → 유형1 100 · 유형2 99.5', [gu2b.alts[0].avg, gu2b.alts[1].avg].join('/'), '100/99.5');
eq('  유형1 채택', gu2b.bestKey, 't1');
eq('  최종 100', gu2b.score, 100);
/* 전 과목 6등급: 유형1 D=90, 유형2 97.5 → 유형2가 유리 */
const allSix = [
  rec({ year: 1, sem: 1, category: '국어', subject: '국어', credit: 4, grade: 6 })
];
const gu6 = U.computeUniv(allSix, GS, OPT);
eq('전 과목 6등급 → 유형1 90 · 유형2 97.5', [gu6.alts[0].avg, gu6.alts[1].avg].join('/'), '90/97.5');
eq('  유형2 채택', gu6.bestKey, 't2');

section('21-d. 유형2는 10과목 미만이면 있는 것만 쓴다');
eq('과목 2개면 유형2도 2과목', U.computeUniv(allTwo, GS, OPT).alts[1].items.length, 2);
eq('  후보 수도 2', U.computeUniv(allTwo, GS, OPT).alts[1].candidates, 2);
eq('반영 과목이 없으면 점수 null',
   U.computeUniv([rec({ year: 1, sem: 1, category: '체육', subject: '체육', credit: 2, ach: 'A' })],
                 GS, OPT).score, null);

section('21-e. 지역균형과 학생부우수자는 별개 규격');
eq('둘 다 가천대', [U.UNIVS.gachon.name, GS.name].join('/'), '가천대학교/가천대학교');
eq('산출 구조가 다르다', [U.UNIVS.gachon.mode, GS.mode].join('/'), 'grouped/best');
eq('같은 학생도 점수가 다르다',
   U.computeUniv(GS_STU, GACHON, OPT).score !== gu2.score, true);
eq('계열이 바뀌면 점수도 바뀐다',
   U.computeUniv(GS_STU, U.resolve('gachonS', 'inmun'), OPT).score !== gu2.score, true);
eq('자연계열과 의예·한의예·약학은 반영교과가 같다',
   U.computeUniv(GS_STU, U.resolve('gachonS', 'med'), OPT).score, gu2.score);

/* ═════════ 결과 ═════════ */
console.log('\n' + '─'.repeat(60));
if (failures.length) {
  console.log('\n실패 항목:');
  failures.forEach(f => console.log('  ✗ ' + f));
}
console.log(`\n통과 ${pass} / 전체 ${pass + fail}` + (fail ? `  · 실패 ${fail}` : '  · 전부 통과'));
process.exit(fail ? 1 : 0);
