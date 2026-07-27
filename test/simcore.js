
/* ═══════ 핵심 로직 (Node 검증 완료본과 동일) ═══════ */
/* ===== 등급 시뮬레이터 핵심 로직 (브라우저/Node 공용) ===== */
(function (global) {
  'use strict';

  var CUM_RATIOS = [0.04, 0.11, 0.23, 0.40, 0.60, 0.77, 0.89, 0.96, 1.00];
  var CUM_RATIOS_5 = [0.10, 0.34, 0.66, 0.90, 1.00];

  /* 과목명 → 교과영역 (v4.0 이식) */
  function inferArea(name) {
    var s = String(name || '');
    if (/국어|화법|작문|언어와\s*매체|문학|독서|매체|고전/.test(s)) return '국어';
    if (/수학|미적분|기하|확률과\s*통계|대수|해석|경제\s*수학|실용\s*수학/.test(s)) return '수학';
    if (/영어|영독|영작|영미/.test(s)) return '영어';
    if (/사회|역사|지리|경제|법|정치|윤리|사상|세계|동아시아|한국사|통합사회/.test(s)) return '사회';
    if (/물리|화학|생명|지구|과학/.test(s)) return '과학';
    if (/체육|스포츠|운동|음악|미술|예술|연극|디자인|공예|연주|합창/.test(s)) return '체예';
    return '기타';
  }
  /* 나이스 교과(category) 우선, 없으면 과목명으로 추론 */
  function categoryToArea(category, name) {
    var c = String(category || '');
    if (c.indexOf('국어') >= 0) return '국어';
    if (c.indexOf('수학') >= 0) return '수학';
    if (c.indexOf('영어') >= 0) return '영어';
    if (c.indexOf('사회') >= 0 || c.indexOf('한국사') >= 0 || c.indexOf('역사') >= 0 || c.indexOf('도덕') >= 0) return '사회';
    if (c.indexOf('과학') >= 0) return '과학';
    if (c.indexOf('체육') >= 0 || c.indexOf('예술') >= 0) return '체예';
    return inferArea(name);
  }

  /* ---------- 교육과정별 산출 방식 자동 분류 ----------
     2015 개정(현 고3): 공통·일반선택 → 9등급, 진로선택·체육예술·교양 → 성취도만
     2022 개정(고1·2): 대부분 5등급, 사회·과학 융합선택 및 체육예술·과학탐구실험 → 성취도만
     두 교육과정에 동명 과목이 있으면 2015로 우선 판정(수동 변경 가능) */
  function normSubj(s) {
    return String(s || '').replace(/[\s·]/g, '').replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2');
  }
  function setOf(arr) { var o = {}; arr.forEach(function (x) { o[x] = 1; }); return o; }

  var S2022_5 = setOf(['공통국어1','공통국어2','공통수학1','공통수학2','공통영어1','공통영어2',
    '기본수학1','기본수학2','기본영어1','기본영어2','통합사회1','통합사회2','통합과학1','통합과학2',
    '한국사1','한국사2','화법과언어','독서와작문','대수','미적분1','미적분2','세계시민과지리',
    '사회와문화','현대사회와윤리','물리학','화학','생명과학','지구과학','주제탐구독서','문학과영상',
    '직무의사소통','직무수학','영어발표와토론','심화영어','심화영어독해와작문','직무영어',
    '한국지리탐구','도시의미래탐구','동아시아역사기행','정치','법과사회','인문학과윤리','국제관계의이해',
    '역학과에너지','전자기와양자','물질과에너지','화학반응의세계','세포와물질대사','생물의유전',
    '지구시스템과학','행성우주과학','독서토론과글쓰기','매체의사소통','언어생활탐구','수학과문화',
    '실용통계','실생활영어회화','미디어영어','세계문화와영어']);
  var S2022_ACH = setOf(['역사로탐구하는현대세계','금융과경제생활','윤리문제탐구',
    '기후변화와지속가능한세계','과학의역사와문화','기후변화와환경생태','융합과학탐구',
    '과학탐구실험1','과학탐구실험2','스포츠문화','스포츠과학','스포츠생활1','스포츠생활2','음악연주와창작']);
  var S2015_9 = setOf(['국어','수학','영어','한국사','통합사회','통합과학','화법과작문','독서',
    '언어와매체','문학','수학1','수학2','미적분','확률과통계','영어회화','영어1','영어2',
    '영어독해와작문','한국지리','세계지리','세계사','동아시아사','경제','정치와법','사회문화',
    '생활과윤리','윤리와사상','물리학1','화학1','생명과학1','지구과학1','기술가정','정보',
    '한문1','일본어1','중국어1','독일어1','프랑스어1','스페인어1','러시아어1','아랍어1','베트남어1']);
  var S2015_ACH = setOf(['과학탐구실험','실용국어','심화국어','고전읽기','실용수학','기하','경제수학',
    '수학과제탐구','인공지능수학','기본수학','실용영어','영어권문화','진로영어','영미문학읽기',
    '여행지리','사회문제탐구','고전과윤리','물리학2','화학2','생명과학2','지구과학2','과학사',
    '생활과과학','융합과학','체육','운동과건강','스포츠생활','체육탐구','음악','미술','연극',
    '음악연주','음악감상과비평','미술창작','미술감상과비평','농업생명과학','공학일반','창의경영',
    '해양문화와기술','가정과학','지식재산일반','인공지능기초','프로그래밍','한문2','일본어2','중국어2','독일어2',
    '프랑스어2','스페인어2','러시아어2','아랍어2','베트남어2','철학','논리학','심리학','교육학',
    '종교학','진로와직업','보건','환경','실용경제','논술']);

  /* → {curr:'2015'|'2022'|null, type:'9'|'5'|'ach'|null, label} */
  function classifySubject(name) {
    var n = normSubj(name);
    if (S2015_9[n])  return { curr: '2015', type: '9',   label: '2015 공통·일반선택 (자동)' };
    if (S2015_ACH[n])return { curr: '2015', type: 'ach', label: '2015 진로선택·체예 등 (자동)' };
    if (S2022_5[n])  return { curr: '2022', type: '5',   label: '2022 상대평가 5등급 (자동)' };
    if (S2022_ACH[n])return { curr: '2022', type: 'ach', label: '2022 성취도 산출 (자동)' };
    return { curr: null, type: null, label: '자동 인식 실패 — 확인 필요' };
  }

  /* ---------- 유틸 ---------- */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function trimStr(v) { return String(v === null || v === undefined ? '' : v).trim(); }
  function isName(s) { return /^[가-힣]{2,5}$/.test(s); }

  /* 학번(숫자 지수표기 포함) → 문자열 */
  function sidStr(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return v.toFixed(0);
    return trimStr(v);
  }

  /* ---------- 일람표 파서 (다중 페이지 지원) ----------
     '번호' 헤더가 나올 때마다 새 블록으로 과목 열을 다시 인식하고,
     학생은 번호(A열) 기준으로 블록 간 병합한다.
     반환: { kind:'roster', exam, ban, subjects:[{key,category,credit}],
             students:[{no,sid,name,scores:{key:val}}],
             footer:{attend:{key:n}, deptCount:{key:n}} } */
  function parseRoster(rows) {
    var ban = null, exam = null;
    for (var i = 0; i < rows.length; i++) {
      var joined = rows[i].map(trimStr).join(' ');
      if (ban === null) {
        var mBan = joined.match(/(\d)\s*학년\s*(\d+)\s*반/);
        if (mBan) ban = parseInt(mBan[2], 10);
      }
      if (exam === null) {
        var mExam = joined.match(/(\d)\s*차\s*시험/);
        if (mExam) exam = parseInt(mExam[1], 10);
      }
      if (ban !== null && exam !== null) break;
    }
    if (ban === null) return null;

    var subjects = [], subjSeen = {};
    var stuMap = {}, stuOrder = [];
    var attend = {}, deptCount = {};
    var block = null;   // {subjCols:{col:key}, nameCol}

    function readHeader(row) {
      var subjCols = {}, nameCol = -1, any = false;
      for (var c = 0; c < row.length; c++) {
        var h = trimStr(row[c]);
        if (h === '성명' || h === '성 명' || h === '성  명') nameCol = c;
        var m = h.match(/^(.+?):(.+?)\((\d+(?:\.\d+)?)\)$/);
        if (m) {
          var key = m[2].trim();
          if (!subjSeen[key]) {
            subjSeen[key] = true;
            subjects.push({ key: key, category: m[1].trim(), credit: parseFloat(m[3]) });
          }
          subjCols[c] = key;
          any = true;
        }
      }
      if (!any) return null;
      return { subjCols: subjCols, nameCol: nameCol >= 0 ? nameCol : 2 };
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var a = row[0];
      var aStr = trimStr(a).replace(/\s/g, '');
      if (aStr === '') continue;

      if (aStr === '번호') {                       // 새 블록 헤더 (페이지 반복 포함)
        var b = readHeader(row);
        if (b) block = b;
        continue;
      }
      if (!block) continue;

      if (typeof a === 'number' || /^\d+(\.0)?$/.test(aStr)) {
        var no = Math.round(parseFloat(a));
        var name = trimStr(row[block.nameCol]);
        var st = stuMap[no];
        if (!st) {
          if (!isName(name)) continue;             // 첫 등장은 유효한 이름 필요
          st = stuMap[no] = { no: no, sid: sidStr(row[block.nameCol - 1]), name: name, scores: {} };
          stuOrder.push(no);
        } else {
          if (isName(name) && !st.name) st.name = name;
          if (!st.sid) st.sid = sidStr(row[block.nameCol - 1]);
        }
        for (var c in block.subjCols) {
          var v = num(row[c]);
          if (v !== null) st.scores[block.subjCols[c]] = v;
        }
      } else if (aStr.indexOf('학과응시생수') >= 0) {
        for (var c in block.subjCols) {
          var t = trimStr(row[c]).match(/(\d+)/);
          if (t) deptCount[block.subjCols[c]] = parseInt(t[1], 10);
        }
      } else if (aStr.indexOf('응시생수') >= 0) {
        for (var c in block.subjCols) {
          var t = trimStr(row[c]).match(/(\d+)/);
          if (t) attend[block.subjCols[c]] = parseInt(t[1], 10);
        }
      }
    }
    if (!subjects.length || !stuOrder.length) return null;
    var students = stuOrder.map(function (no) { return stuMap[no]; });
    return { kind: 'roster', exam: exam || 1, ban: ban, subjects: subjects,
             students: students, footer: { attend: attend, deptCount: deptCount } };
  }

  /* ---------- 생기부(교과학습발달상황) 파서 ----------
     v4.0 parseNaisSheet 이식. 반환:
     { kind:'transcript', ban:N|null, records:[{no,name,year,sem,category,subject,
       credit,raw,avg,std,grade,ach,cnt}] } */
  function parseH(val) {
    var s = trimStr(val);
    if (!s) return null;
    var m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
    if (m) return { raw: parseFloat(m[1]), avg: parseFloat(m[2]), std: parseFloat(m[3]) };
    var m2 = s.match(/^(\d+(?:\.\d+)?)/);
    if (m2) return { raw: parseFloat(m2[1]), avg: null, std: null };
    return null;
  }
  /* 성취도(수강자수) — 'A' · 'A(250)' · 'A (250)' · 소문자 모두 허용.
     체육·예술 과목은 수강자수 없이 성취도만 적히는 경우가 많다. */
  function parseI(val) {
    var s = trimStr(val);
    if (!s) return null;
    if (s === 'P' || s === 'p') return { ach: 'P', cnt: 0 };
    var m = s.match(/^([A-Ea-e])(?:\s*\(\s*(\d+)\s*\))?/);
    if (m) return { ach: m[1].toUpperCase(), cnt: m[2] ? parseInt(m[2], 10) : 0 };
    return null;
  }
  /* 성취도가 표준 열(I)에 없을 때만 쓰는 보정 —
     원점수가 없는 과목(체육·예술 등)에서 열이 한 칸씩 밀려 나오는 출력이 있다.
     성취도·석차등급이 둘 다 비었을 때만, 그리고 셀 전체가 성취도 토큰일 때만 인정한다. */
  function parseIShifted(row) {
    for (var c = 7; c <= 11; c++) {
      if (c === 8) continue;
      var s = trimStr(row[c]);
      if (!s) continue;
      if (/^[A-Ea-e]\s*(\(\s*\d+\s*\))?$/.test(s) || s === 'P' || s === 'p') return parseI(s);
    }
    return null;
  }
  /* 성취도별 분포비율 — 진로선택 과목은 석차등급 열에 'A(75.7) B(20.9) C(3.5)' 형태로 들어온다.
     성취도(수강자수) 'A(120)'과 헷갈리지 않도록 두 개 이상 잡힐 때만 분포로 인정한다. */
  function parseDist(val) {
    var s = trimStr(val);
    if (!s) return null;
    var re = /([A-E])\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g, m, out = {}, n = 0;
    while ((m = re.exec(s))) { out[m[1]] = parseFloat(m[2]); n++; }
    return n >= 2 ? out : null;
  }
  function parseJ(val) {
    var s = trimStr(val);
    if (!s || s === 'P') return null;
    var n = parseFloat(s);
    return (isNaN(n) || n < 1 || n > 9) ? null : Math.round(n);
  }

  function parseTranscript(rows) {
    var ban = null;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var joined = rows[i].map(trimStr).join(' ');
      var m = joined.match(/(\d)\s*학년\s*(\d+)\s*반/);
      if (m) { ban = parseInt(m[2], 10); break; }
    }
    var records = [];
    var lNo = '', lName = '', lYear = '', lSem = '';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var sA = trimStr(row[0]).replace(/\s/g, '');
      var sB = trimStr(row[1]);
      var sF = trimStr(row[5]);
      if (sA === '번호') continue;
      if (sA.indexOf('이수학점') >= 0) continue;
      if (!sF || sF === '과 목' || sF === '과목') continue;

      if (trimStr(row[0]) !== '') lNo = Math.round(parseFloat(row[0])) || lNo;
      if (sB !== '' && !/성\s*명/.test(sB)) lName = sB;
      if (trimStr(row[2]) !== '') lYear = Math.round(parseFloat(row[2])) || lYear;
      if (trimStr(row[3]) !== '') lSem = Math.round(parseFloat(row[3])) || lSem;
      if (!lName || !isName(lName)) continue;

      var h = parseH(row[7]), ach = parseI(row[8]), g = parseJ(row[9]);
      if (!ach && g === null) ach = parseIShifted(row);   // 열이 밀린 출력 보정
      var dist = g === null ? parseDist(row[9]) : null;   // 진로선택 성취도별 분포비율
      records.push({
        no: lNo, name: lName, year: lYear, sem: lSem,
        category: trimStr(row[4]), subject: sF,
        credit: parseFloat(row[6]) || 0,
        raw: h ? h.raw : null, avg: h ? h.avg : null, std: h ? h.std : null,
        grade: g, ach: ach ? ach.ach : '', cnt: ach ? ach.cnt : null,
        dist: dist
      });
    }
    return { kind: 'transcript', ban: ban, records: records };
  }

  /* ---------- 교과목별 일람표 파서 ----------
     반환: { kind:'subjectRoster', exam, subject:{key,category,credit},
             scores:[{ban,no,score}], attend:{ban:n} } */
  function parseSubjectRoster(rows) {
    var exam = null, subject = null;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var joined = rows[i].map(trimStr).join(' ');
      var mE = joined.match(/(\d)\s*차\s*시험/);
      if (mE) exam = parseInt(mE[1], 10);
      var mS = joined.match(/교과목\s*:\s*(.+?):(.+?)\(\s*(\d+(?:\.\d+)?)\s*\)/);
      if (mS) subject = { key: mS[2].trim(), category: mS[1].trim(), credit: parseFloat(mS[3]) };
    }
    var hIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (trimStr(rows[i][0]).replace(/\s/g, '') === '반번호') { hIdx = i; break; }
    }
    if (hIdx < 0 || !subject) return null;
    var banCols = {};
    for (var c = 1; c < rows[hIdx].length; c++) {
      var v = num(rows[hIdx][c]);
      if (v !== null && v >= 1 && v <= 20) banCols[c] = Math.round(v);
    }
    var scores = [], attend = {};
    for (var i = hIdx + 1; i < rows.length; i++) {
      var row = rows[i];
      var a = row[0];
      var aStr = trimStr(a).replace(/\s/g, '');
      if (aStr === '') continue;
      if (typeof a === 'number' || /^\d+(\.0)?$/.test(aStr)) {
        var no = Math.round(parseFloat(a));
        for (var c in banCols) {
          var v = num(row[c]);
          if (v !== null) scores.push({ ban: banCols[c], no: no, score: v });
        }
      } else if (aStr.indexOf('응시생수') >= 0) {
        for (var c in banCols) {
          var t = trimStr(row[c]).match(/(\d+)/);
          if (t) attend[banCols[c]] = parseInt(t[1], 10);
        }
      } else if (aStr.indexOf('총') === 0 || aStr.indexOf('평균') >= 0) {
        break;
      }
    }
    return { kind: 'subjectRoster', exam: exam || 1, subject: subject, scores: scores, attend: attend };
  }

  /* ---------- 명렬표 파서 ----------
     반·번호·성명(·학번) 열 구조. 반 열이 없으면 제목의 "N학년 M반" 사용.
     반환: { kind:'namelist', students:[{ban,no,name,sid}] } */
  function parseNamelist(rows) {
    var banTitle = null;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var m = rows[i].map(trimStr).join(' ').match(/(\d)\s*학년\s*(\d+)\s*반/);
      if (m) { banTitle = parseInt(m[2], 10); break; }
    }
    var hIdx = -1, cols = { ban: -1, no: -1, name: -1, sid: -1 };
    for (var i = 0; i < rows.length; i++) {
      var noC = -1, nmC = -1, bnC = -1, sdC = -1;
      for (var c = 0; c < rows[i].length; c++) {
        var v = trimStr(rows[i][c]).replace(/\s/g, '');
        if (v === '번호') noC = c;
        else if (v === '성명' || v === '이름') nmC = c;
        else if (v === '반' || v === '학급') bnC = c;
        else if (v === '학번') sdC = c;
      }
      if (noC >= 0 && nmC >= 0) { hIdx = i; cols = { ban: bnC, no: noC, name: nmC, sid: sdC }; break; }
    }
    if (hIdx < 0) return null;
    var students = [];
    for (var i = hIdx + 1; i < rows.length; i++) {
      var row = rows[i];
      var no = num(row[cols.no]);
      var name = trimStr(row[cols.name]);
      if (no === null || !isName(name)) continue;
      var ban = cols.ban >= 0 ? num(row[cols.ban]) : banTitle;
      if (ban === null) continue;
      students.push({ ban: Math.round(ban), no: Math.round(no), name: name,
                      sid: cols.sid >= 0 ? sidStr(row[cols.sid]) : '' });
    }
    if (!students.length) return null;
    return { kind: 'namelist', students: students };
  }

  /* ---------- 파일 종류 판별 + 파싱 ---------- */
  function parseWorkbookRows(rows) {
    var head = rows.slice(0, 8).map(function (r) { return r.map(trimStr).join(' '); }).join(' ');
    if (head.indexOf('교과목별 일람표') >= 0) return parseSubjectRoster(rows);
    if (head.indexOf('학급별 일람표') >= 0) return parseRoster(rows);
    if (head.indexOf('교과학습발달상황') >= 0) return parseTranscript(rows);
    if (head.indexOf('명렬') >= 0) return parseNamelist(rows);
    // 폴백: 헤더 특징으로 재시도
    var r = parseRoster(rows);
    if (r && r.students.length > 0 && r.subjects.length > 0) return r;
    var t = parseTranscript(rows);
    if (t && t.records.length > 0) return t;
    var nl = parseNamelist(rows);
    if (nl && nl.students.length >= 3) return nl;
    return null;
  }

  /* ---------- 등급 엔진 ----------
     entries: [{id, score}] 점수 보유자 전원(인정점 포함)
     n: 수강자수(제외 반영 후)
     반환: { n, cuts:[누적인원×9], byId:{id:{score,rank,tie,mid,midPct,grade,boundaryTie}},
             groups:[{score,rank,tie,grade,boundaryTie,ids}] } */
  function computeGrades(entries, n, ratios) {
    var R = ratios || CUM_RATIOS;
    var G = R.length;
    var cuts = R.map(function (r, i) {
      return i === G - 1 ? n : Math.round(n * r);
    });
    var sorted = entries.slice().sort(function (a, b) { return b.score - a.score; });
    var groups = [];
    var i = 0;
    while (i < sorted.length) {
      var j = i;
      while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
      groups.push({ score: sorted[i].score, rank: i + 1, tie: j - i,
                    ids: sorted.slice(i, j).map(function (e) { return e.id; }) });
      i = j;
    }
    function bandOf(pos) {
      for (var g = 0; g < G; g++) if (pos <= cuts[g]) return g + 1;
      return G;
    }
    var byId = {};
    groups.forEach(function (grp) {
      var first = bandOf(grp.rank);
      var last = bandOf(grp.rank + grp.tie - 1);
      grp.mid = grp.rank + (grp.tie - 1) / 2;
      grp.midPct = grp.mid / n * 100;
      if (grp.tie > 1 && first !== last) {
        // 동석차가 등급 경계에 걸친 경우에만 중간석차백분율 적용
        var g = G;
        for (var k = 0; k < G; k++) {
          if (grp.midPct <= R[k] * 100 + 1e-9) { g = k + 1; break; }
        }
        grp.grade = g;
        grp.boundaryTie = true;
      } else {
        grp.grade = first;
        grp.boundaryTie = false;
      }
      grp.ids.forEach(function (id) {
        byId[id] = { score: grp.score, rank: grp.rank, tie: grp.tie, mid: grp.mid,
                     midPct: grp.midPct, grade: grp.grade, boundaryTie: grp.boundaryTie };
      });
    });
    return { n: n, cuts: cuts, byId: byId, groups: groups, bands: G };
  }

  /* 통계: 평균·모표준편차 */
  function stats(scores) {
    if (!scores.length) return null;
    var sum = 0;
    scores.forEach(function (s) { sum += s; });
    var avg = sum / scores.length, v = 0;
    scores.forEach(function (s) { v += (s - avg) * (s - avg); });
    return { avg: avg, std: Math.sqrt(v / scores.length), count: scores.length };
  }

  /* 학기별·누적 평균등급 (석차등급 있는 과목만, 학점 가중) */
  function gpaFromRecords(records) {
    var semMap = {}; // '1-1' -> {cr, wt}
    records.forEach(function (r) {
      if (r.grade === null || r.grade <= 0 || r.credit <= 0) return;
      var k = r.year + '-' + r.sem;
      if (!semMap[k]) semMap[k] = { cr: 0, wt: 0 };
      semMap[k].cr += r.credit;
      semMap[k].wt += r.credit * r.grade;
    });
    var sems = Object.keys(semMap).sort();
    var totCr = 0, totWt = 0;
    var perSem = sems.map(function (k) {
      totCr += semMap[k].cr; totWt += semMap[k].wt;
      return { sem: k, credits: semMap[k].cr, gpa: semMap[k].wt / semMap[k].cr };
    });
    return { perSem: perSem, credits: totCr, gpa: totCr > 0 ? totWt / totCr : null };
  }

  var api = { CUM_RATIOS: CUM_RATIOS, CUM_RATIOS_5: CUM_RATIOS_5,
              inferArea: inferArea, categoryToArea: categoryToArea,
              classifySubject: classifySubject,
              parseWorkbookRows: parseWorkbookRows,
              computeGrades: computeGrades, stats: stats, gpaFromRecords: gpaFromRecords,
              parseRoster: parseRoster, parseTranscript: parseTranscript,
              parseSubjectRoster: parseSubjectRoster, parseNamelist: parseNamelist, sidStr: sidStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.SimCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

