/* 성적 분석 탭 E2E: 4개 학기 생기부 + 지필 → 종합 판단 · 학기별 추이 차트 ·
   강점/취약(z) · 개선 우선순위 · 학생 조회 ↔ 분석 연동 검증 */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
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
    const names = ['가별', '나별', '다별', '라별', '마별'];
    const roster = [
      ['2026학년도 1학기 1차 시험 학급별 일람표'],
      ['3학년 1반'],
      ['번호', '학번', '성  명', '수학:미적분(4)', '국어:화법과 작문(4)', '영어:영어독해와작문(3)'],
      ...names.map((nm, i) => [i + 1, 30101 + i, nm, [96, 88, 80, 70, 55][i], [72, 85, 79, 68, 50][i], [90, 84, 77, 66, 52][i]]),
      ['응시생수', null, null, '5 명', '5 명', '5 명'],
    ];
    // 4개 학기: 가별은 꾸준히 개선(5→4→3→2), 수학 강점 / 국어 취약이 되도록 구성
    const tRows = [
      ['교과학습발달상황 (3학년 1반)'],
      ['번호', '성명', '학년', '학기', '교과', '과목', '학점', '원점수/과목평균(표준편차)', '성취도(수강자수)', '석차등급'],
    ];
    const semPlan = [[1, 1], [1, 2], [2, 1], [2, 2]];
    names.forEach((nm, i) => {
      semPlan.forEach(([y, s], k) => {
        // 가별(i=0): 학기마다 개선 5,4,3,2 / 수학은 좋고 국어는 나쁨
        const base = i === 0 ? 5 - k : Math.min(9, 2 + i);
        const mathG = Math.max(1, base - 2);
        const korG = Math.min(9, base + 2);
        const engG = base;
        tRows.push([k === 0 ? i + 1 : null, k === 0 ? nm : null, y, s, '수학', '수학' + (y * 2 + s), 4,
          (92 - k * 2 - i * 5) + '/62.0(13.0)', 'A(200)', mathG]);
        tRows.push([null, null, null, null, '국어', '국어' + (y * 2 + s), 4,
          (60 - i * 4) + '/61.0(12.0)', 'B(200)', korG]);
        tRows.push([null, null, null, null, '영어', '영어' + (y * 2 + s), 3,
          (80 - i * 5) + '/63.0(12.5)', 'A(200)', engG]);
      });
    });
    const dt = new DataTransfer();
    dt.items.add(toFile(roster, 'r1.xlsx'));
    dt.items.add(toFile(tRows, 't1.xlsx'));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 900));
  });

  // 학생 조회 → "성적 분석 보기" 버튼으로 이동
  const jump = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="student"]').click();
    const q = document.getElementById('stuQuery');
    q.value = '3101'; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('goAnalysis').click();
    await new Promise(r => setTimeout(r, 350));
    return {
      navOn: document.querySelector('nav button.on').dataset.tab,
      head: document.querySelector('#anaBody .stuhead') ? document.querySelector('#anaBody .stuhead').innerText.replace(/\n/g, ' ') : '(없음)',
    };
  });
  console.log('=== 학생 조회 → 분석 이동 ===');
  console.log('탭:', jump.navOn, '/', jump.head);

  const rep = await page.evaluate(() => {
    const txt = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.replace(/\s+/g, ' ').trim());
    return {
      kpis: txt('#anaBody .kpi'),
      verdict: [...document.querySelectorAll('#anaBody .vline')].map(v =>
        '[' + v.querySelector('.tagv').innerText + '] ' + v.querySelector('.vtx').innerText.replace(/\s+/g, ' ')),
      charts: [...document.querySelectorAll('#anaBody .chartcard')].map(c => ({
        title: c.querySelector('h3').innerText,
        dots: c.querySelectorAll('.sdot').length,
        hits: c.querySelectorAll('.hitb').length,
        yAxisTicks: [...c.querySelectorAll('.axtx')].slice(0, 5).map(t => t.textContent),
      })),
      cards: [...document.querySelectorAll('#anaBody .card h2')].map(h => h.innerText.replace(/\s+/g, ' ')),
      semTable: [...document.querySelectorAll('#anaBody .hist tr')].map(r =>
        [...r.querySelectorAll('th,td')].map(c => c.innerText.trim()).join(' | ')),
      areaTable: [...document.querySelectorAll('#anaBody .arez tr')].map(r =>
        [...r.querySelectorAll('th,td')].map(c => c.innerText.trim()).join(' | ')),
      priTable: [...document.querySelectorAll('#anaBody .ranktbl tr')].map(r =>
        [...r.querySelectorAll('th,td')].map(c => c.innerText.trim()).join(' | ')),
    };
  });

  console.log('\n=== KPI ===');
  rep.kpis.forEach(k => console.log(' ', k));
  console.log('\n=== 종합 판단 ===');
  rep.verdict.forEach(v => console.log(' ', v));
  console.log('\n=== 차트 ===');
  rep.charts.forEach(c => console.log(` ${c.title}: 점 ${c.dots}개, 호버영역 ${c.hits}개, y축 ${JSON.stringify(c.yAxisTicks)}`));
  console.log('\n=== 섹션 ===', JSON.stringify(rep.cards));
  console.log('\n=== 학기별 추이 ===');
  rep.semTable.forEach(r => console.log(' ', r));
  console.log('\n=== 강점·취약 ===');
  rep.areaTable.forEach(r => console.log(' ', r));
  console.log('\n=== 개선 우선순위 ===');
  rep.priTable.forEach(r => console.log(' ', r));

  // 호버 툴팁 동작
  const tip = await page.evaluate(async () => {
    const hit = document.querySelector('#anaBody .chartbox .hitb');
    hit.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    const t = document.querySelector('#anaBody .chartbox .tip');
    return { on: t.classList.contains('on'), text: t.textContent };
  });
  console.log('\n=== 호버 툴팁 ===', tip.on ? 'OK' : 'FAIL', '/', tip.text);

  await page.screenshot({ path: 'shot-analysis.png', fullPage: true });

  console.log('\nJS 오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
