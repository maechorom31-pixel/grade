/* 석차 순위 탭 E2E: 지필 2개 반 + 생기부(학기별/누계) 적재 →
   산출 기준(3-1 예상·학기별·누계) 전환 · 반 필터 · 검색 · 행 클릭 이동 검증 */
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
    // 생기부: 1학년1학기 + 2학년1학기 석차등급 (누계·학기별 산출용)
    function transcript(ban, names, g11, g21) {
      const rows = [
        ['교과학습발달상황 (3학년 ' + ban + '반)'],
        ['번호', '성명', '학년', '학기', '교과', '과목', '학점', '원점수/과목평균(표준편차)', '성취도(수강자수)', '석차등급'],
      ];
      names.forEach((nm, i) => {
        rows.push([i + 1, nm, 1, 1, '수학', '수학', 4, (90 - i) + '/60.0(12.0)', 'A(200)', g11[i]]);
        rows.push([null, null, 2, 1, '수학', '수학Ⅰ', 4, (88 - i) + '/62.0(11.0)', 'A(190)', g21[i]]);
      });
      return rows;
    }
    const n1 = ['가별', '나별', '다별', '라별', '마별'];
    const n2 = ['바별', '사별', '아별', '자별', '차별'];
    const dt = new DataTransfer();
    dt.items.add(toFile(roster(1, n1, [96, 88, 88, 70, 55], [92, 80, 79, 68, 50]), 'r1.xlsx'));
    dt.items.add(toFile(roster(2, n2, [90, 84, 72, 60, 45], [95, 77, 74, 63, 48]), 'r2.xlsx'));
    // 1학년1학기 등급은 3-1 예상과 순서를 다르게 (마별이 1학년엔 최상위)
    dt.items.add(toFile(transcript(1, n1, [5, 4, 3, 2, 1], [3, 3, 2, 2, 1]), 't1.xlsx'));
    dt.items.add(toFile(transcript(2, n2, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]), 't2.xlsx'));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 900));
  });

  const readRank = () => page.evaluate(() => ({
    basisOpts: [...document.querySelectorAll('#rankBasisSel option')].map(o => o.textContent.trim()),
    basisVal: document.getElementById('rankBasisSel') ? document.getElementById('rankBasisSel').value : null,
    banOpts: [...document.querySelectorAll('#rankBanSel option')].map(o => o.textContent.trim()),
    header: [...document.querySelectorAll('#rankBody th')].map(t => t.innerText.trim()),
    rows: [...document.querySelectorAll('#rankBody .rankrow')].filter(r => !r.classList.contains('hide'))
      .map(r => [...r.querySelectorAll('td')].map(td => td.innerText.trim()).join(' | ')),
  }));

  // 순위 탭 열기 — 기본 3-1 예상
  await page.evaluate(async () => { document.querySelector('nav button[data-tab="rank"]').click(); await new Promise(r => setTimeout(r, 200)); });
  const nowView = await readRank();
  console.log('=== 산출 기준 옵션 ===');
  console.log(JSON.stringify(nowView.basisOpts));
  console.log('반 필터 옵션:', JSON.stringify(nowView.banOpts));
  console.log('\n=== 3-1 예상 (기본) · 헤더:', JSON.stringify(nowView.header));
  nowView.rows.forEach(r => console.log(r));

  // 학기별: 1학년 1학기로 전환
  await page.evaluate(async () => {
    const sel = document.getElementById('rankBasisSel');
    sel.value = [...sel.options].find(o => o.textContent.includes('1학년 1학기')).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
  });
  const semView = await readRank();
  console.log('\n=== 1학년 1학기 · 헤더:', JSON.stringify(semView.header));
  semView.rows.forEach(r => console.log(r));

  // 누계로 전환
  await page.evaluate(async () => {
    const sel = document.getElementById('rankBasisSel');
    sel.value = [...sel.options].find(o => o.textContent.includes('누계 (3-1')).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
  });
  const cumView = await readRank();
  console.log('\n=== 누계(3-1 반영) · 헤더:', JSON.stringify(cumView.header));
  cumView.rows.forEach(r => console.log(r));

  // 반 필터: 2반만
  await page.evaluate(async () => {
    const sel = document.getElementById('rankBanSel');
    sel.value = '2'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
  });
  const banFiltered = await readRank();
  console.log('\n=== 반 필터: 2반만 (' + banFiltered.rows.length + '행) ===');
  banFiltered.rows.forEach(r => console.log(r));

  // 검색: 반 필터 전체로 되돌린 뒤 "아별" 검색
  const searched = await page.evaluate(async () => {
    const bsel = document.getElementById('rankBanSel'); bsel.value = 'all'; bsel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    const inp = document.getElementById('rankSearch');
    inp.value = '아별'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    return [...document.querySelectorAll('#rankBody .rankrow')].filter(r => !r.classList.contains('hide'))
      .map(r => r.querySelector('.nm').innerText.trim());
  });
  console.log('\n=== 검색 "아별" → 표시 행:', JSON.stringify(searched));

  // 행 클릭 → 학생 조회 이동
  const nav = await page.evaluate(async () => {
    document.querySelector('#rankBody .rankrow:not(.hide)').click();
    await new Promise(r => setTimeout(r, 200));
    return {
      navOn: document.querySelector('nav button.on').dataset.tab,
      stuName: document.querySelector('#stuBody .stuhead .name') ? document.querySelector('#stuBody .stuhead .name').innerText : '(없음)',
    };
  });
  console.log('\n=== 행 클릭 → 이동:', nav.navOn, '/', nav.stuName);

  await page.evaluate(() => { document.querySelector('nav button[data-tab="rank"]').click(); });
  await page.screenshot({ path: 'shot-rank.png', fullPage: true });

  console.log('\nJS 오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
