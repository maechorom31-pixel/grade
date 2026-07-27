/* 체육·예술 교과 성취도 파싱 검증
   나이스 생기부에서 체육·예술 과목이 어떤 형태로 나와도 성취도를 읽어내는지 확인한다.
   실행: node pe-parse.diag.js */
'use strict';
const C = require('./simcore.js');
const U = require('./univcore.js');

const HEAD = ['번호', '성명', '학년', '학기', '교과', '과목', '학점',
              '원점수/과목평균(표준편차)', '성취도(수강자수)', '석차등급'];

/* 체육·예술 행이 실제로 나올 법한 형태들 —
   [설명, 교과, 과목, 학점, H열(원점수), I열(성취도), J열(석차등급), 성취도를 읽어내야 하는가] */
const SHAPES = [
  ['성취도만 (수강자수 없음)',        '체육', '체육',        2, '',   'A',            ''],
  ['성취도 + 수강자수',               '체육', '체육',        2, '',   'A(250)',       ''],
  ['성취도 + 공백 + 수강자수',        '체육', '체육',        2, '',   'A (250)',      ''],
  ['앞뒤 공백',                       '체육', '체육',        2, '',   '  A  ',        ''],
  ['교과에 하위영역 표기',            '예술(음악/미술)', '음악', 2, '', 'B(248)',     ''],
  ['성취도 분포비율까지 붙은 셀',     '예술', '미술',        2, '',   'A(250) A:35.2% B:40.1% C:24.7%', ''],
  ['원점수까지 기재된 체육',          '체육', '운동과 건강', 2, '78/70.1(9.8)', 'B(250)', ''],
  ['진로선택 체육',                   '체육', '스포츠 생활', 2, '',   'A(120)',       ''],
  ['H열이 하이픈',                    '체육', '체육',        2, '-',  'A',            ''],
  ['J열이 하이픈',                    '체육', '체육',        2, '',   'A',            '-'],
  ['성취도 소문자',                   '체육', '체육',        2, '',   'a',            ''],
  ['성취도가 한 칸 밀림 (J열에)',     '체육', '체육',        2, '',   '',             'A'],
  ['성취도 열이 비어 있음',           '체육', '체육',        2, '',   '',             ''],
  ['이수시간 표기 (학점 자리 문자)',  '체육', '체육',        '2단위', '', 'A',        '']
].map(r => r.concat([r[5] !== '']));   // I열이 비어 있고 J열에도 없으면 읽어낼 것이 없다
SHAPES[11][7] = true;                  // 성취도가 J열로 밀린 형태는 보정으로 읽어내야 한다

function build(shape) {
  const [, cat, subj, credit, h, i, j] = shape;
  return [
    ['2026학년도 교과학습발달상황 (3학년 1반)'],
    HEAD,
    [1, '홍길동', 3, 1, cat, subj, credit, h, i, j]
  ];
}

const OPT = { semFrom: 11, semTo: 31, plainScope: 'all', kindOverride: {}, areaOverride: {} };
const SPEC = U.UNIVS.gachon;

console.log('행 형태별 파싱 결과 — 성취도를 읽어내는가\n');
console.log('  ' + '형태'.padEnd(30) + '파싱 성취도  교과영역  계열      체예평균 반영');
console.log('  ' + '─'.repeat(84));

let ok = 0, bad = [];
SHAPES.forEach(shape => {
  const p = C.parseWorkbookRows(build(shape));
  let ach = '—', area = '—', kind = '—', peN = 0, reason = '';
  if (!p || p.kind !== 'transcript' || !p.records.length) {
    reason = '레코드 파싱 실패';
  } else {
    const r = p.records[0];
    ach = r.ach || '(없음)';
    const it = U.evalRecord(r, SPEC, OPT);
    area = it.area; kind = it.kind;
    reason = it.reason;
    peN = U.computeUniv([r], SPEC, OPT).artsPe.count;
  }
  const got = peN > 0, want = shape[7];
  if (got === want) ok++; else bad.push([shape[0], ach, reason, want]);
  console.log('  ' + (got === want ? '✓ ' : '✗ ') + shape[0].padEnd(28) +
              String(ach).slice(0, 10).padEnd(12) + String(area).padEnd(9) +
              String(kind).padEnd(10) + (got ? 'O' : 'X'));
});

console.log('\n  기대와 일치: ' + ok + ' / ' + SHAPES.length);
if (bad.length) {
  console.log('\n  기대와 다른 형태:');
  bad.forEach(([name, ach, reason, want]) =>
    console.log('    · ' + name + '  → 파싱 성취도 "' + ach + '" (기대: ' +
                (want ? '읽어냄' : '읽을 것 없음') + ')' +
                (reason ? ' / 제외 사유 "' + reason + '"' : '')));
}

/* 실제 조합: 한 학생의 생기부 전체에 체예가 섞여 있을 때 */
console.log('\n\n실제 생기부 형태 — 여러 학기 체예 과목이 섞인 경우\n');
const full = [
  ['2026학년도 교과학습발달상황 (3학년 1반)'], HEAD,
  [1, '홍길동', 1, 1, '국어', '국어', 4, '92/70.5(14.2)', 'A(250)', 2],
  [null, null, null, null, '체육', '체육', 2, '', 'A', ''],
  [null, null, null, null, '예술(음악/미술)', '음악', 2, '', 'B', ''],
  [null, null, null, 2, '수학', '미적분', 4, '88/65.0(15.1)', 'A(248)', 2],
  [null, null, null, null, '체육', '운동과 건강', 2, '', 'A', ''],
  [null, null, 2, 1, '예술(음악/미술)', '미술', 2, '', 'C', ''],
  [null, null, 3, 1, '체육', '스포츠 생활', 2, '', 'A(120)', '']
];
const fp = C.parseWorkbookRows(full);
console.log('  파싱된 레코드 ' + fp.records.length + '건');
fp.records.forEach(r => {
  const it = U.evalRecord(r, SPEC, OPT);
  console.log('    ' + (r.year + '-' + r.sem).padEnd(6) + String(r.category).padEnd(18) +
              String(r.subject).padEnd(14) + '학점 ' + String(r.credit).padEnd(4) +
              '성취도 ' + String(r.ach || '—').padEnd(4) + '등급 ' + String(r.grade || '—').padEnd(4) +
              '→ ' + it.area + ' / ' + it.kind + (it.reason ? ' / ' + it.reason : ' / 반영'));
});
const pe = U.computeUniv(fp.records, SPEC, OPT).artsPe;
console.log('\n  체예 성취도 평균: ' +
  (pe.avg === null ? '산출 불가' : pe.avg.toFixed(3) + '  (' + pe.count + '과목 · A ' +
   pe.dist.A + ' B ' + pe.dist.B + ' C ' + pe.dist.C + ')'));
console.log('  ※ 학년·학기가 빈 행은 위 행에서 이어받으므로 1-1 체육 2과목, 1-2 운동과 건강, 2-1 미술, 3-1 스포츠 생활');

process.exit(bad.length ? 1 : 0);
