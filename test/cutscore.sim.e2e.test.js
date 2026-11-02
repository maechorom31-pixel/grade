/* 시뮬레이션 탭 E2E (합성 데이터): 1차 점수·1차 분할만 있는 상태에서
   수행 90 가정 → 수행 분할 조정 → 최종 분할·분포·학생별 성취도/등급 확인 */
'use strict';
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const { chromium } = pw;
const path = require('path');
let pass = 0, fail = 0;
function T(n, c, d) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')); } }

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept('안 1'));
  const url = 'file://' + path.resolve(__dirname, '..', 'cutscore', 'index.html');
  await page.goto(url);
  // 합성 상태: 4개 반 × 25명, 1차 점수 결정적 분포
  await page.evaluate(() => {
    const sc = {}, names = {};
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let b = 1; b <= 4; b++) { sc[b] = {}; for (let n = 1; n <= 25; n++) { sc[b][n] = Math.round((40 + rnd() * 60) * 10) / 10; names[b + '-' + n] = '학생' + b + n; } }
    const st = { comps: [
      { id: 'c1', name: '1차고사', kind: 'exam', ratio: 35, fallback: null, angoff: [], actual: [75, 65, 55, 45, 35] },
      { id: 'c2', name: '2차고사', kind: 'exam', ratio: 35, fallback: null, angoff: [], actual: [null, null, null, null, null] },
      { id: 'p1', name: '수행평가1', kind: 'perf', ratio: 30, fallback: 90, actual: [null, null, null, null, null] }],
      scores: { c1: sc }, names, th: { aMax: 40, avgMax: 80, aCutMin: 70 } };
    localStorage.setItem('cutScore_v1', JSON.stringify(st));
  });
  await page.reload();
  await page.click('nav button[data-tab="sim"]');
  const txt = () => page.evaluate(() => document.getElementById('simOut').innerText);

  // 1차+수행 프리셋, 수행 90 가정
  await page.click('#simCtl button[data-act="preset"][data-v="firstPerf"]');
  await page.click('#simCtl .cbox[data-id="p1"] button[data-act="assumeq"][data-v="90"]');
  let t = await txt();
  T('현재 조합 라벨에 수행 90 가정', t.includes('수행평가1(90 가정)'), t.slice(0, 120));
  // 수행 분할 기본 = 고정분할 90/80/70/60/40 → 최종 A/B = (75*35+90*30)/65 = 81.92
  T('최종 A/B 81.92 (1차 75 · 수행 90 가중)', t.includes('81.92'));
  // 수행 A/B 분할을 직접 85로 변경 → (75*35+85*30)/65 = 79.62
  const inp = '#simCtl .cbox[data-id="p1"] input[data-act="cutv"][data-k="0"]';
  await page.fill(inp, '85');
  await page.dispatchEvent(inp, 'input');
  t = await txt();
  T('수행 A/B 85 → 최종 A/B 79.62', t.includes('79.62'));
  const mode = await page.$eval('#simCtl .cbox[data-id="p1"] select[data-act="cut"]', s => s.value);
  T('직접 입력 모드로 자동 전환', mode === 'custom');
  T('입력 포커스 유지', await page.evaluate(() => document.activeElement && document.activeElement.dataset.act === 'cutv'));
  // +1 이동
  await page.click('#simCtl .cbox[data-id="p1"] button[data-act="shift"][data-v="1"]');
  t = await txt();
  T('전체 +1 → 최종 A/B 80.08', t.includes('80.08'));
  T('기준선(1차만) 대비 표시', t.includes('기준선 대비 바뀐 학생'));
  // 분포 합계 = 100
  const sum = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#simOut .card:nth-child(2) table.cmp tr')].slice(1);
    return rows.reduce((a, r) => a + parseInt((r.children[3].innerText.match(/(\d+)명/) || [0, 0])[1], 10), 0);
  });
  T('현재 분포 합계 100명', sum === 100, 'sum=' + sum);
  // 9등급 전환 → 교차표 9열
  await page.click('#simCtl button[data-act="gsys"][data-v="9"]');
  t = await txt();
  T('9등급 교차표', t.includes('9등급') && (await page.$$eval('#simOut .card:nth-child(3) table.cmp tr:first-child th', a => a.length)) === 11);
  // 학생 클릭 → 역산
  await page.click('#simOut tr[data-key="1-1"]');
  t = await txt();
  T('역산 표시', /수행평가1이\(가\) 몇 점이면/.test(t));
  // 저장 → 비교표
  await page.click('#simCtl button[data-act="savecfg"]');
  t = await txt();
  T('저장 조합 비교표', t.includes('저장한 조합 비교') && t.includes('안 1'));
  // 2차 포함(1차 그대로 가정) → 라벨
  await page.click('#simCtl button[data-act="preset"][data-v="all"]');
  t = await txt();
  T('전체 반영 시 2차 1차 그대로 가정', t.includes('2차고사(1차 가정)'));
  // 새로고침 후 유지
  await page.reload(); await page.click('nav button[data-tab="sim"]');
  T('설정 저장 유지 (9등급)', await page.$eval('#simCtl button[data-act="gsys"].on', b => b.dataset.v) === '9');
  await page.screenshot({ path: path.join(__dirname, 'shot-cutscore-sim.png'), fullPage: true });
  // 모바일 폭
  await page.setViewportSize({ width: 390, height: 800 });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 1) console.log(await page.evaluate(() => [...document.querySelectorAll('#tab-sim *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))));
  T('모바일 가로 넘침 없음', ov <= 1, 'overflow=' + ov);
  T('페이지 오류 없음', !errors.length, errors.join(' | '));
  await browser.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
