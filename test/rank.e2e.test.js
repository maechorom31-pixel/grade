/* 석차 순위 탭 E2E: 2개 반 점수 적재 → 전체/반별 순위 → 행 클릭 시 학생 조회 이동 */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(file, { waitUntil: 'networkidle' });

  // 2개 반 일람표 주입 (같은 과목 이름 → 학년 전체 풀 형성)
  await page.evaluate(async () => {
    localStorage.clear();
    function toFile(rows, name) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    function roster(ban, names, math, kor) {
      return [
        ['2026학년도 1학기 1차 시험 학급별 일람표'],
        ['3학년 ' + ban + '반'],
        ['번호', '학번', '성  명', '수학:미적분(4)', '국어:화법과 작문(4)'],
        ...names.map((nm, i) => [i + 1, 30000 + ban * 100 + i + 1, nm, math[i], kor[i]]),
        ['응시생수', null, null, names.length + ' 명', names.length + ' 명'],
      ];
    }
    const n1 = ['가별', '나별', '다별', '라별', '마별'];
    const n2 = ['바별', '사별', '아별', '자별', '차별'];
    const dt = new DataTransfer();
    dt.items.add(toFile(roster(1, n1, [96, 88, 88, 70, 55], [92, 80, 79, 68, 50]), 'r1.xlsx'));
    dt.items.add(toFile(roster(2, n2, [90, 84, 72, 60, 45], [95, 77, 74, 63, 48]), 'r2.xlsx'));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 800));
  });

  // 전체 순위
  const allView = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="rank"]').click();
    await new Promise(r => setTimeout(r, 200));
    const chips = [...document.querySelectorAll('#rankChips button')].map(b => b.innerText.trim() + (b.classList.contains('on') ? '*' : ''));
    const rows = [...document.querySelectorAll('#rankBody .rankrow')].map(r =>
      [...r.querySelectorAll('td')].map(td => td.innerText.trim()));
    return { chips, header: [...document.querySelectorAll('#rankBody th')].map(t => t.innerText.trim()), rows, kpi: document.querySelector('#rankBody .kpis') ? document.querySelector('#rankBody .kpis').innerText.replace(/\n/g, ' ') : '' };
  });
  console.log('--- 전체 순위 ---');
  console.log('칩:', JSON.stringify(allView.chips));
  console.log('헤더:', JSON.stringify(allView.header));
  console.log('KPI:', allView.kpi);
  allView.rows.forEach(r => console.log(r.join(' | ')));

  // 반별 순위로 전환
  const classView = await page.evaluate(async () => {
    [...document.querySelectorAll('#rankChips button')].find(b => b.dataset.scope === 'class').click();
    await new Promise(r => setTimeout(r, 150));
    return {
      classHeads: [...document.querySelectorAll('#rankBody .rankclass h2')].map(h => h.innerText.replace(/\n/g, ' ')),
      firstBanRows: [...document.querySelectorAll('#rankBody .rankclass:first-child .rankrow')].map(r =>
        [...r.querySelectorAll('td')].map(td => td.innerText.trim()).join(' | ')),
    };
  });
  console.log('\n--- 반별 순위 ---');
  classView.classHeads.forEach(h => console.log('반 헤더:', h));
  console.log('1반:');
  classView.firstBanRows.forEach(r => console.log('  ' + r));

  // 행 클릭 → 학생 조회로 이동하는지
  const nav = await page.evaluate(async () => {
    document.querySelector('#rankBody .rankrow').click();
    await new Promise(r => setTimeout(r, 200));
    return {
      studentTabOn: document.getElementById('tab-student').classList.contains('on'),
      navOn: document.querySelector('nav button.on').dataset.tab,
      stuName: document.querySelector('#stuBody .stuhead .name') ? document.querySelector('#stuBody .stuhead .name').innerText : '(없음)',
      stuMeta: document.querySelector('#stuBody .stuhead .meta') ? document.querySelector('#stuBody .stuhead .meta').innerText : '',
    };
  });
  console.log('\n--- 행 클릭 → 학생 조회 이동 ---');
  console.log('학생 탭 활성:', nav.studentTabOn, '/ nav on:', nav.navOn);
  console.log('이동한 학생:', nav.stuName, '·', nav.stuMeta);

  await page.evaluate(() => { document.querySelector('nav button[data-tab="rank"]').click(); });
  await page.screenshot({ path: 'shot-rank.png', fullPage: true });

  console.log('\nJS 오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
