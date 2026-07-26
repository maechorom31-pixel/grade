/* 브라우저 E2E: 가상 나이스 생기부 xlsx 적재 → 학생 조회 · 순위 비교 · 과목 점검 · 산출 기준 */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXEC = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
              '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
              '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'univ', 'index.html'), { waitUntil: 'load' });

  const ready = await page.evaluate(() =>
    ({ xlsx: typeof XLSX !== 'undefined', sim: !!window.SimCore, univ: !!window.UnivCore }));
  console.log('인라인 로드:', JSON.stringify(ready));
  if (!ready.xlsx || !ready.sim || !ready.univ) { console.log(errors.join('\n')); await browser.close(); process.exit(1); }

  /* 가상 생기부 2개 반 주입 — 1반 1번은 단위 테스트의 손계산 학생과 동일 */
  const load = await page.evaluate(async () => {
    function toFile(rows, name) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    const HEAD = ['번호', '성명', '학년', '학기', '교과', '과목', '학점',
                  '원점수/과목평균(표준편차)', '성취도(수강자수)', '석차등급'];
    // [학년, 학기, 교과, 과목, 학점, 원점수, 성취도, 등급]
    const 손계산 = [
      [1, 1, '국어', '국어', 4, 92, 'A', 2],
      [1, 1, '수학', '수학', 4, 78, 'B', 3],
      [1, 1, '영어', '영어', 4, 88, 'B', 3],
      [1, 2, '기술·가정/정보', '정보', 3, 70, 'C', 5],
      [2, 1, '한국사', '한국사', 3, 84, 'B', 4],
      [2, 2, '과학', '물리학Ⅰ', 3, 95, 'A', 1],
      [3, 1, '수학', '기하', 3, 82, 'A', null],
      [3, 1, '교양', '실용 경제', 2, 90, 'A', null],
      [3, 1, '체육', '운동과 건강', 2, null, 'A', null],
      [3, 2, '국어', '심화 국어', 3, null, 'A', null]
    ];
    /* 가천대 손계산 표본 — 단위 테스트 15번 시나리오와 동일
       일반선택 (4×100 + 4×99.5 + 4×70)/12 = 89.8333…, 진로선택 (3×100 + 3×99.5 + 2×70)/8 = 92.3125
       교과 점수 = 92.3125×0.6 + 89.8333…×0.4 = 91.320833… */
    const 가천표본 = [
      [1, 1, '국어', '국어', 4, 92, 'A', 2],
      [1, 1, '수학', '수학', 4, 78, 'B', 3],
      [1, 1, '한국사', '한국사', 3, 84, 'B', 4],
      [2, 1, '국어', '문학', 4, 88, 'B', 3],
      [2, 1, '수학', '수학Ⅰ', 4, 71, 'C', 6],
      [2, 2, '영어', '영어 독해와 작문', 4, 55, 'D', 8],
      [3, 1, '수학', '기하', 3, 82, 'A', null],
      [3, 1, '과학', '물리학Ⅱ', 3, 64, 'B', null],
      [3, 1, '사회(역사/도덕 포함)', '여행지리', 2, 45, 'C', null],
      [3, 1, '체육', '운동과 건강', 2, null, 'A', null]
    ];
    const 원점수높음 = [   // 등급은 2등급인데 원점수가 전부 90 이상
      [1, 1, '국어', '국어', 4, 96, 'A', 2],
      [1, 1, '수학', '수학', 4, 94, 'A', 2],
      [1, 1, '영어', '영어', 4, 95, 'A', 2],
      [2, 1, '한국사', '한국사', 3, 93, 'A', 2],
      [3, 1, '수학', '기하', 3, null, 'A', null]
    ];
    const 등급좋음 = [     // 등급은 1등급인데 원점수는 커트라인, 반영교과 밖에서 까먹음
      [1, 1, '국어', '국어', 4, 90, 'A', 1],
      [1, 1, '수학', '수학', 4, 90, 'A', 1],
      [1, 1, '영어', '영어', 4, 90, 'A', 1],
      [2, 1, '한국사', '한국사', 3, 90, 'A', 1],
      [1, 2, '제2외국어', '일본어Ⅰ', 4, 45, 'E', 8],
      [3, 1, '수학', '기하', 3, null, 'C', null]
    ];
    function block(no, name, rows) {
      return rows.map((r, i) => [i === 0 ? no : null, i === 0 ? name : null,
        r[0], r[1], r[2], r[3], r[4], r[5] === null ? '' : r[5] + '/60.0(12.0)',
        r[6] + '(250)', r[7] === null ? '' : r[7]]);
    }
    const ban1 = [['2026학년도 교과학습발달상황 (3학년 1반)'], HEAD,
      ...block(1, '손계산', 손계산), ...block(2, '원점수높음', 원점수높음), ...block(3, '등급좋음', 등급좋음)];
    const ban2 = [['2026학년도 교과학습발달상황 (3학년 2반)'], HEAD,
      ...block(1, '가천표본', 가천표본),
      ...block(2, '평범이', 원점수높음.map(r => r.slice(0, 5).concat([r[5] === null ? null : r[5] - 10, r[6], r[7]]))),
      ...block(3, '보통이', 손계산)];

    const dt = new DataTransfer();
    dt.items.add(toFile(ban1, '생기부_3-1.xlsx'));
    dt.items.add(toFile(ban2, '생기부_3-2.xlsx'));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 900));
    return {
      tags: [...document.querySelectorAll('.filerow .tag')].map(e => e.textContent),
      loadVisible: !document.getElementById('loadCard').hidden,
      loadText: document.getElementById('loadBody').innerText
    };
  });
  console.log('\n파일 인식:', JSON.stringify(load.tags));
  console.log('--- 적재 현황 ---\n' + load.loadText);

  /* 학생 조회 — 손계산 학생(3101) */
  const stu = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="student"]').click();
    const q = document.getElementById('stuQuery');
    q.value = '3101'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return document.getElementById('stuBody').innerText;
  });
  console.log('\n--- 학생 조회 3101 (손계산) ---\n' + stu.slice(0, 2200));

  const checks = [
    ['교과 점수 955.714285 표시', stu.includes('955.714285')],
    ['단순 평균등급 2.95 표시', stu.includes('2.95')],
    ['환산등급 상당 2.06 표시', stu.includes('2.06')],
    ['제외 사유(반영교과 아님) 표시', stu.includes('반영교과 아님')],
    ['제외 사유(반영 학기 밖) 생략 안내', stu.includes('반영 학기 밖') || stu.includes('학기 밖')]
  ];

  /* 순위 비교 */
  const rank = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="rank"]').click();
    await new Promise(r => setTimeout(r, 250));
    return document.getElementById('rankBody').innerText;
  });
  console.log('\n--- 순위 비교 ---\n' + rank.slice(0, 1400));

  /* 과목 점검 */
  const subj = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="subject"]').click();
    await new Promise(r => setTimeout(r, 250));
    const rows = [...document.querySelectorAll('#subjBody tbody tr')].map(tr =>
      [...tr.children].slice(0, 3).map(td => td.innerText.trim()).join(' | ') +
      ' → ' + tr.querySelector('select[data-area]').options[0].text +
      ' / ' + tr.children[7].innerText.trim());
    return { rows, n: rows.length };
  });
  console.log('\n--- 과목 점검 (' + subj.n + '과목) ---\n' + subj.rows.join('\n'));

  /* 교과영역 override 반응 확인: 일본어Ⅰ을 영어로 바꾸면 점수가 바뀌어야 함 */
  const ovr = await page.evaluate(async () => {
    const before = (() => {
      document.querySelector('nav button[data-tab="student"]').click();
      const q = document.getElementById('stuQuery');
      q.value = '3103'; q.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('stuBody').innerText.match(/[\d]{3}\.\d{6}/);
    })();
    document.querySelector('nav button[data-tab="subject"]').click();
    await new Promise(r => setTimeout(r, 200));
    const sel = document.querySelector('select[data-area="일본어Ⅰ"]');
    if (!sel) return { ok: false, why: '일본어Ⅰ 행 없음' };
    sel.value = '영어';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('nav button[data-tab="student"]').click();
    const q = document.getElementById('stuQuery');
    q.value = '3103'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const after = document.getElementById('stuBody').innerText.match(/[\d]{3}\.\d{6}/);
    // 되돌리기
    document.querySelector('nav button[data-tab="subject"]').click();
    await new Promise(r => setTimeout(r, 200));
    const s2 = document.querySelector('select[data-area="일본어Ⅰ"]');
    s2.value = ''; s2.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return { ok: true, before: before && before[0], after: after && after[0] };
  });
  console.log('\n--- 교과영역 override 반응 (일본어Ⅰ → 영어) ---');
  console.log('  변경 전 3103 교과점수:', ovr.before, '/ 변경 후:', ovr.after);
  checks.push(['override가 산출에 즉시 반영', ovr.ok && ovr.before !== ovr.after]);

  /* 산출 기준 */
  const specTxt = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="spec"]').click();
    await new Promise(r => setTimeout(r, 200));
    return document.getElementById('specBody').innerText;
  });
  console.log('\n--- 산출 기준 ---\n' + specTxt.slice(0, 900));
  checks.push(['환산표 1,000 표기', specTxt.includes('1,000')]);
  checks.push(['수학 원점수 별도 기준 표기 (8등급 20점 이상 ~ 30점 미만)',
    specTxt.includes('20점 이상 ~ 30점 미만')]);
  checks.push(['국어 계열은 다른 기준 (8등급 40점 이상 ~ 50점 미만)',
    specTxt.includes('40점 이상 ~ 50점 미만')]);

  /* 대학 전환 — 가천대 지역균형 (그룹 가중 산식) */
  const gachon = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="data"]').click();
    const sel = document.getElementById('optUniv');
    sel.value = 'gachon'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('nav button[data-tab="student"]').click();
    const q = document.getElementById('stuQuery');
    q.value = '3201'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const stuTxt = document.getElementById('stuBody').innerText;
    document.querySelector('nav button[data-tab="spec"]').click();
    await new Promise(r => setTimeout(r, 200));
    const specTxt = document.getElementById('specBody').innerText;
    document.querySelector('nav button[data-tab="rank"]').click();
    await new Promise(r => setTimeout(r, 200));
    const rankTxt = document.getElementById('rankBody').innerText;
    return { stuTxt, specTxt, rankTxt };
  });
  console.log('\n═══ 가천대 지역균형으로 전환 ═══');
  console.log('--- 학생 조회 3201 (가천표본) ---\n' + gachon.stuTxt.slice(0, 2400));
  console.log('\n--- 가천대 산출 기준 ---\n' + gachon.specTxt.slice(0, 800));

  checks.push(['가천대 교과 점수 91.3208 (손계산 일치)', gachon.stuTxt.includes('91.3208')]);
  checks.push(['그룹 가중 산식 표시 (60% / 40%)',
    gachon.stuTxt.includes('× 60%') && gachon.stuTxt.includes('× 40%')]);
  checks.push(['진로선택 평균 92.3 표시', gachon.stuTxt.includes('92.3')]);
  checks.push(['일반선택 평균 89.8 표시', gachon.stuTxt.includes('89.8')]);
  checks.push(['공통과목 미반영 사유 표시', gachon.stuTxt.includes('공통과목 미반영')]);
  checks.push(['변환등급 열 표시', gachon.stuTxt.includes('변환등급')]);
  checks.push(['환산등급 상당 열은 감춤 (등급 척도 없음)', !gachon.rankTxt.includes('환산등급 상당')]);
  checks.push(['가천대 요강 배점 99.5 표기', gachon.specTxt.includes('99.5')]);
  checks.push(['공통과목 미반영 안내', gachon.specTxt.includes('반영하지 않음')]);
  await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="student"]').click();
    const q = document.getElementById('stuQuery');
    q.value = '3201'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
  });
  await page.screenshot({ path: 'shot-univ-gachon.png', fullPage: true });

  /* 외대로 되돌리기 */
  await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="data"]').click();
    const sel = document.getElementById('optUniv');
    sel.value = 'hufs'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
  });

  /* localStorage 복원 */
  await page.reload({ waitUntil: 'load' });
  const restored = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('nav button[data-tab="rank"]').click();
    await new Promise(r => setTimeout(r, 250));
    return document.getElementById('rankBody').innerText;
  });
  checks.push(['새로고침 후 데이터 복원', restored.includes('955.714285')]);

  await page.evaluate(() => document.querySelector('nav button[data-tab="student"]').click());
  await page.evaluate(async () => {
    const q = document.getElementById('stuQuery');
    q.value = '3101'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
  });
  await page.screenshot({ path: 'shot-univ-student.png', fullPage: true });
  await page.evaluate(() => document.querySelector('nav button[data-tab="rank"]').click());
  await page.screenshot({ path: 'shot-univ-rank.png' });

  console.log('\n--- 확인 항목 ---');
  let bad = 0;
  checks.forEach(([label, ok]) => { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) bad++; });
  console.log('\nJS 오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
