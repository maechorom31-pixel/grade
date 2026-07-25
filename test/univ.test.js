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

/* ═════════ 결과 ═════════ */
console.log('\n' + '─'.repeat(60));
if (failures.length) {
  console.log('\n실패 항목:');
  failures.forEach(f => console.log('  ✗ ' + f));
}
console.log(`\n통과 ${pass} / 전체 ${pass + fail}` + (fail ? `  · 실패 ${fail}` : '  · 전부 통과'));
process.exit(fail ? 1 : 0);
