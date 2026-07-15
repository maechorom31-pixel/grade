/* 성취평가 분할점수 종합관리 E2E:
 * ① v6 엑셀 임포트 → 결과 대시보드가 엑셀 계산과 일치
 * ② 나이스 교과목별(전체 반)·수행평가 일람표 드롭 → 자동 적재 흐름
 */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const V6 = process.env.SAMPLE_V6 ||
  '/root/.claude/uploads/f817c425-b504-5cbb-975c-a25f9c54cfbd/ff24c407-_______________v6.xlsx';
const PERF = process.env.SAMPLE_PERF ||
  '/root/.claude/uploads/f817c425-b504-5cbb-975c-a25f9c54cfbd/cd46f83a-download34078223055127332.xlsx';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto('file://' + path.resolve(__dirname, '..', 'cutscore', 'index.html'), { waitUntil: 'networkidle' });
  console.log('XLSX 로드:', await page.evaluate(() => typeof XLSX !== 'undefined') ? 'OK' : 'FAIL');

  async function dropFiles(specs) {
    await page.evaluate(async (specs) => {
      const dt = new DataTransfer();
      for (const s of specs) {
        const bytes = Uint8Array.from(atob(s.b64), c => c.charCodeAt(0));
        dt.items.add(new File([bytes], s.name));
      }
      document.getElementById('drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
      await new Promise(r => setTimeout(r, 600));
    }, specs);
  }

  /* ─── ① v6 임포트 ─── */
  if (fs.existsSync(V6)) {
    await dropFiles([{ name: '분할점수종합관리v6.xlsx', b64: fs.readFileSync(V6).toString('base64') }]);
    const r = await page.evaluate(() => {
      document.querySelector('nav button[data-tab="result"]').click();
      return {
        fileTag: document.querySelector('.filerow .tag')?.innerText,
        load: document.getElementById('loadBody').innerText.replace(/\n/g, ' | ').slice(0, 400),
        result: document.getElementById('resultBody').innerText,
      };
    });
    console.log('\n--- v6 임포트 ---');
    console.log('태그:', r.fileTag);
    console.log('적재:', r.load);
    const res = r.result;
    const checks = [
      ['단계 = 1+2차', /현재 단계\s*\n?\s*1\+2차/.test(res)],
      ['누적 분할 75.64/65.14/54.56/42.86', res.includes('75.64') && res.includes('65.14') && res.includes('54.56') && res.includes('42.86')],
      ['누적 예측 평균 72.6', res.includes('72.6')],
      ['누적 분포 A 52명 46.0%', /A\s*\n?\s*52명 · 46\.0%/.test(res.replace(/\s+/g, ' ')) || (res.includes('52명') && res.includes('46%')) || res.includes('46.0%')],
      ['1차 분포 A 51명', res.includes('51명')],
      ['지표1 경고', res.includes('⚠ 경고')],
      ['지표2·3·4 양호 3개', (res.match(/✓ 양호/g) || []).length === 3],
      ['반별 통계 1반 69.2', res.includes('69.2')],
    ];
    checks.forEach(([n, ok]) => console.log((ok ? '  ✓ ' : '  ✗ ') + n));
    await page.screenshot({ path: 'shot-cutscore-result.png', fullPage: false });
    if (checks.some(c => !c[1])) { console.log('\n[결과 본문]\n' + res.slice(0, 2200)); }
  }

  /* ─── ② 초기화 후 나이스 파일 흐름 ─── */
  await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="data"]').click();
    document.getElementById('btnReset').click();
    await new Promise(r => setTimeout(r, 200));
  });
  // 가상 교과목별 일람표 (1차, 3개 반)
  const subj1 = await page.evaluate(() => {
    const rows = [
      ['2026학년도 1학기 1차 시험 교과목별 일람표'],
      ['교과목 : 국어:화법과 작문( 3 )'],
      [],
      ['반번호', 1, 2, 3],
      [1, 88, 92, 75], [2, 75, 66, 81], [3, 60, 55, 90], [4, 45, 70, 62],
      ['응시생수', '4 명', '4 명', '4 명'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
    return btoa(String.fromCharCode(...new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))));
  });
  const specs = [{ name: '1차_교과목별.xlsx', b64: subj1 }];
  if (fs.existsSync(PERF)) specs.push({ name: '수행평가_일람표.xlsx', b64: fs.readFileSync(PERF).toString('base64') });
  await dropFiles(specs);
  const r2 = await page.evaluate(() => ({
    tags: [...document.querySelectorAll('.filerow .tag')].map(e => e.innerText),
    descs: [...document.querySelectorAll('.filerow .desc')].map(e => e.innerText),
    load: document.getElementById('loadBody').innerText.replace(/\n/g, ' | '),
    comps: (JSON.parse(localStorage.getItem('cutScore_v1')) || {}).comps?.map(c => c.name + ':' + c.ratio),
  }));
  console.log('\n--- 나이스 파일 자동 적재 ---');
  console.log('태그:', JSON.stringify(r2.tags));
  console.log('설명:', JSON.stringify(r2.descs));
  console.log('적재 현황:', r2.load.slice(0, 500));
  console.log('요소 구성:', JSON.stringify(r2.comps));
  await page.screenshot({ path: 'shot-cutscore-data.png', fullPage: false });

  console.log('\nJS 오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
