/* 브라우저 E2E 스모크 테스트: 가상 나이스 xlsx 적재 → 검증표 → 학생 조회 → 등급표 */
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

  const hasXLSX = await page.evaluate(() => typeof XLSX !== 'undefined');
  console.log('XLSX CDN 로드:', hasXLSX ? 'OK' : 'FAIL');
  if (!hasXLSX) { console.log(errors.join('\n')); await browser.close(); process.exit(1); }

  // 가상 나이스 파일 3종을 페이지 내 XLSX로 생성해 드롭 이벤트로 주입
  const result = await page.evaluate(async () => {
    function toFile(rows, name) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    // 학생 12명 점수 (1반)
    const names = ['김하늘','이서준','박지우','최민준','정다은','한지민','오세훈','강예린','조유찬','임소율','신재이','문가온'];
    const s1math = [96,88,88,85,77,72,70,66,60,55,48,40];   // 88점 동점 2명 (2~3위)
    const s1kor  = [92,85,79,90,74,68,81,63,58,71,50,45];
    const s2math = [90,92,80,84,70,75,68,60,65,50,52,42];
    const roster1 = [
      ['2026학년도 1학기 1차 시험 학급별 일람표'],
      ['3학년 1반'],
      ['번호','학번','성  명','수학:미적분(4)','국어:화법과 작문(4)','체육:운동과 건강(2)'],
      ...names.map((nm,i)=>[i+1, 30100+i+1, nm, s1math[i], s1kor[i], 95-i*3]),
      ['응시생수',null,null,'12 명','12 명','12 명'],
      ['학과응시생수',null,null,'12 명','12 명','12 명'],
    ];
    const roster2 = [
      ['2026학년도 1학기 2차 시험 학급별 일람표'],
      ['3학년 1반'],
      ['번호','학번','성  명','수학:미적분(4)'],
      ...names.map((nm,i)=>[i+1, 30100+i+1, nm, s2math[i]]),
      ['응시생수',null,null,'12 명'],
    ];
    const transcript = [
      ['교과학습발달상황 (3학년 1반)'],
      ['번호','성명','학년','학기','교과','과목','학점','원점수/과목평균(표준편차)','성취도(수강자수)','석차등급'],
      [1,'김하늘',1,1,'수학','수학',4,'92/70.5(14.2)','A(230)',2],
      [null,null,null,2,'수학','수학',4,'94/69.0(15.1)','A(228)',1],
      [null,null,2,1,'수학','수학Ⅰ',4,'90/65.2(16.0)','A(225)',2],
      [null,null,null,2,'수학','수학Ⅱ',4,'88/64.0(15.5)','A(224)',2],
    ];
    const dt = new DataTransfer();
    dt.items.add(toFile(roster1, '1차_1반_일람표.xlsx'));
    dt.items.add(toFile(roster2, '2차_1반_일람표.xlsx'));
    dt.items.add(toFile(transcript, '생기부_1반.xlsx'));
    const drop = document.getElementById('drop');
    drop.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 800));
    return {
      fileTags: [...document.querySelectorAll('.filerow .tag')].map(e => e.textContent),
      validVisible: !document.getElementById('validCard').hidden,
      validText: document.getElementById('validBody').innerText,
    };
  });

  console.log('파일 인식 태그:', JSON.stringify(result.fileTags));
  console.log('검증 카드 표시:', result.validVisible);
  console.log('--- 적재 현황과 검증 ---');
  console.log(result.validText);

  // 학생 조회: 학번 3101 (김하늘)
  const stu = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="student"]').click();
    const q = document.getElementById('stuQuery');
    q.value = '3101';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return document.getElementById('stuBody').innerText;
  });
  console.log('\n--- 학생 조회 (3101 김하늘) ---');
  console.log(stu.slice(0, 1500));

  // 과목별 등급표
  const subj = await page.evaluate(async () => {
    document.querySelector('nav button[data-tab="subject"]').click();
    await new Promise(r => setTimeout(r, 200));
    return {
      chips: [...document.querySelectorAll('#subjChips button')].map(e => e.innerText.replace(/\n/g, ' ')),
      body: document.getElementById('subjBody').innerText.slice(0, 1200),
    };
  });
  console.log('\n--- 과목별 등급표 ---');
  console.log('과목 칩:', JSON.stringify(subj.chips));
  console.log(subj.body);

  await page.screenshot({ path: 'shot-subject.png', fullPage: false });
  await page.evaluate(() => { document.querySelector('nav button[data-tab="student"]').click(); });
  await page.screenshot({ path: 'shot-student.png', fullPage: true });

  console.log('\nJS 오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
