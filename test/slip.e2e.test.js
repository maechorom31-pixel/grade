/* 성적 슬립 생성기 E2E: 실제 수행평가 일람표 xlsx + 가상 지필 양식 2종 회귀 */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const SAMPLE = process.env.SAMPLE_XLSX ||
  '/root/.claude/uploads/f817c425-b504-5cbb-975c-a25f9c54cfbd/cd46f83a-download34078223055127332.xlsx';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'slip', 'index.html'), { waitUntil: 'networkidle' });
  console.log('XLSX 로드:', await page.evaluate(() => typeof XLSX !== 'undefined') ? 'OK' : 'FAIL');

  /* ─── 1. 실제 수행평가 예시 파일 (SAMPLE_XLSX 환경변수, 없으면 건너뜀) ─── */
  if (fs.existsSync(SAMPLE)) {
  const b64 = fs.readFileSync(SAMPLE).toString('base64');
  const perf = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const f = new File([bytes], '수행평가_일람표.xlsx');
    await handleFiles([f]);
    await new Promise(r => setTimeout(r, 300));
    const firstSlip = document.querySelector('.slip-h');
    return {
      fileCount: document.querySelector('.file-item .count')?.innerText,
      summary: document.getElementById('summary').innerText,
      head: firstSlip?.querySelector('.head')?.innerText.replace(/\s+/g, ' '),
      labels: [...(firstSlip?.querySelectorAll('.cell .label') || [])].map(e => e.innerText),
      values: [...(firstSlip?.querySelectorAll('.cell .value') || [])].map(e => e.innerText),
      slipCount: document.querySelectorAll('.slip-h').length,
      wrongqCount: document.querySelectorAll('.wrongq').length,
    };
  }, b64);
  console.log('\n--- 수행평가 모드 (실제 예시 파일) ---');
  console.log('파일 항목:', perf.fileCount);
  console.log('요약:', perf.summary.replace(/\n/g, ' | '));
  console.log('슬립 헤더:', perf.head);
  console.log('첫 슬립 라벨:', JSON.stringify(perf.labels));
  console.log('첫 슬립 값:', JSON.stringify(perf.values));
  console.log('슬립 수:', perf.slipCount, '· 정오표 줄 수(0이어야 함):', perf.wrongqCount);
  await page.screenshot({ path: 'shot-slip-perf.png' });
  } else { console.log('\n(수행평가 예시 파일 없음 — SAMPLE_XLSX 지정 시 검사, 건너뜀)'); }

  /* ─── 2. 지필 회귀: 성적관리 + 정오표 가상 양식 ─── */
  const paper = await page.evaluate(async () => {
    // 초기화
    state.files = [];
    function toFile(rows, name) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'S');
      return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], name);
    }
    // NEIS 지필평가 성적관리 유사 양식
    const grade = [
      ['2026학년도 1학기 2차 지필평가 성적관리'],
      ['과목 : 미적분', null, null, null, '교과담당교사 (이수학) 인'],
      ['학번', '반/번호', '성명', '선택형', '서답형', '합계', '비고'],
      [null, null, '배점', 70, 30, 100, null],
      [2024000001, '1/1', '김하늘', 65, 28, 93, null],
      [2024000002, '1/2', '이서준', 58, 22, 80, null],
    ];
    // 정오표 유사 양식 (문항 열 = 숫자 라벨)
    const wrong = [
      ['2026학년도 1학기 2차시험 수학:미적분(4) 정기시험 학생답 정오표'],
      ['반/번호', '성명', 1, 2, 3, 4, 5, '선택형', '합계'],
      ['1/1', '김하늘', '.', '.', 3, '.', '-', 65, 93],
      ['1/2', '이서준', '.', 2, '.', 4, '.', 58, 80],
    ];
    await handleFiles([toFile(grade, '지필_성적관리.xlsx')]);
    await new Promise(r => setTimeout(r, 200));
    const s1 = document.querySelector('.slip-h');
    const r1 = {
      labels: [...s1.querySelectorAll('.cell .label')].map(e => e.innerText),
      values: [...s1.querySelectorAll('.cell .value')].map(e => e.innerText),
    };
    state.files = [];
    await handleFiles([toFile(wrong, '정오표.xlsx')]);
    await new Promise(r => setTimeout(r, 200));
    const s2 = document.querySelector('.slip-h');
    const r2 = {
      head: s2.querySelector('.head').innerText.replace(/\s+/g, ' '),
      wrongq: [...document.querySelectorAll('.wrongq')].map(e => e.innerText),
      fileCount: document.querySelector('.file-item .count')?.innerText,
    };
    return { r1, r2 };
  });
  console.log('\n--- 지필 회귀 (성적관리) ---');
  console.log('라벨:', JSON.stringify(paper.r1.labels));
  console.log('값:', JSON.stringify(paper.r1.values));
  console.log('\n--- 지필 회귀 (정오표) ---');
  console.log('헤더:', paper.r2.head);
  console.log('파일 항목:', paper.r2.fileCount);
  console.log('정오표 줄:', JSON.stringify(paper.r2.wrongq));

  console.log('\nJS 오류/경고창:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
