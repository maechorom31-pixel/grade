/* ===== 대학별 교과 환산점수 비교 — UI ===== */
(function () {
'use strict';
var C = window.SimCore, U = window.UnivCore;
var LSKEY = 'univConv_v1';
var AREAS = ['국어', '수학', '영어', '사회', '과학', '체예', '기타'];
var SEMS = [[11, '1학년 1학기'], [12, '1학년 2학기'], [21, '2학년 1학기'],
            [22, '2학년 2학기'], [31, '3학년 1학기'], [32, '3학년 2학기']];

var state = blank();
var fileStatuses = [];
var cache = null;
var curStudentId = null;
var rankSort = 'univ';
var rankBan = 'all';

function blank() {
  return {
    transcripts: {},
    opt: { univ: 'hufs', variant: {}, semFrom: 11, semTo: 31, plainScope: 'all',
           kindOverride: {}, areaOverride: {} },
    savedAt: null
  };
}
function spec() {
  var id = U.UNIVS[state.opt.univ] ? state.opt.univ : 'hufs';
  return U.resolve(id, (state.opt.variant || {})[id]);
}
function invalidate() { cache = null; }

/* ---------- 저장 ---------- */
function save() {
  state.savedAt = new Date().toISOString();
  try { localStorage.setItem(LSKEY, JSON.stringify(state)); } catch (e) {}
  renderSaveState();
}
function load() {
  try {
    var raw = localStorage.getItem(LSKEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { state = blank(); }
  var b = blank();
  state.transcripts = state.transcripts || {};
  state.opt = state.opt || b.opt;
  Object.keys(b.opt).forEach(function (k) {
    if (state.opt[k] === undefined || state.opt[k] === null) state.opt[k] = b.opt[k];
  });
  state.opt.variant = state.opt.variant || {};
  if (!U.UNIVS[state.opt.univ]) state.opt.univ = 'hufs';
}
function renderSaveState() {
  document.getElementById('saveState').textContent = state.savedAt
    ? '이 컴퓨터에 자동 저장됨 · ' + new Date(state.savedAt).toLocaleString('ko-KR',
        { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '저장된 데이터 없음';
}

/* ---------- 학생 구성 ---------- */
function curGrade() {
  var g = 0;
  Object.keys(state.transcripts).forEach(function (b) {
    state.transcripts[b].records.forEach(function (r) {
      var y = parseInt(r.year, 10);
      if (y > g) g = y;
    });
  });
  return g || 3;
}
function buildStudents() {
  var G = curGrade(), map = {}, order = [];
  Object.keys(state.transcripts).forEach(function (b) {
    var t = state.transcripts[b];
    t.records.forEach(function (r) {
      var no = parseInt(r.no, 10);
      if (!no || !r.name) return;
      var id = t.ban + '-' + no;
      if (!map[id]) {
        map[id] = { id: id, ban: t.ban, no: no, name: r.name,
                    sid: String(G * 1000 + t.ban * 100 + no), records: [] };
        order.push(id);
      }
      map[id].records.push(r);
    });
  });
  order.sort(function (a, b) { return map[a].ban - map[b].ban || map[a].no - map[b].no; });
  return order.map(function (k) { return map[k]; });
}
function results() {
  if (cache) return cache;
  cache = U.computeAll(buildStudents(), spec(), state.opt);
  cache.byId = {};
  cache.rows.forEach(function (r) { cache.byId[r.id] = r; });
  return cache;
}
function hasData() { return Object.keys(state.transcripts).length > 0; }

/* ---------- 표기 유틸 ---------- */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
function f2(v) { return v === null || v === undefined ? '—' : v.toFixed(2); }
function f1(v) { return v === null || v === undefined ? '—' : v.toFixed(1); }
function n1(v) { return v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10); }
/* 교과 점수 표기 — 절사 규정이 있으면 그 자릿수로, 없으면 4자리 */
function fscore(v) {
  if (v === null || v === undefined) return '—';
  var sp = spec();
  return v.toFixed(sp.trunc || sp.round || 4);
}
function pctS(v) { return v === null || v === undefined ? '—' : v.toFixed(1) + '%'; }
function signed(v, d) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(d === undefined ? 1 : d);
}
function gcolor(g) { return 'background:var(--g' + Math.max(1, Math.min(9, Math.round(g))) + ')'; }
function semLabel(y, s) { return y + '-' + s; }
function cellVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  return typeof v === 'number' ? String(v) : esc(v);
}
/* 채택 근거 배지 */
function basisPill(it) {
  if (!it.included) return '<span class="pill off">제외</span>';
  var b = it.basis || '';
  var cls = /원점수/.test(b) ? 'raw' : /등급/.test(b) ? 'grade'
          : /성취도/.test(b) ? 'ach' : 'same';
  if (b === '동일') cls = 'same';
  return '<span class="pill ' + cls + '">' + esc(b) + '</span>';
}

/* ---------- 파일 적재 ---------- */
function handleFiles(files) {
  var list = Array.prototype.slice.call(files).filter(function (f) { return /\.xlsx$/i.test(f.name); });
  if (!list.length) return;
  var done = 0;
  list.forEach(function (f) {
    var fr = new FileReader();
    fr.onload = function (e) {
      var status;
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        var p = C.parseWorkbookRows(rows);
        if (!p || p.kind !== 'transcript') {
          status = { name: f.name, tag: '인식 실패', err: true,
                     desc: '나이스 교과학습발달상황(생기부) 형식이 아닙니다.' };
        } else if (p.ban === null) {
          status = { name: f.name, tag: '반 미상', err: true,
                     desc: '제목에서 "N학년 M반"을 찾지 못했습니다.' };
        } else if (!p.records.length) {
          status = { name: f.name, tag: '기록 없음', err: true, desc: '읽어낼 과목 기록이 없습니다.' };
        } else {
          state.transcripts[p.ban] = { ban: p.ban, fileName: f.name, records: p.records };
          var names = {}, sems = {};
          p.records.forEach(function (r) { names[r.name] = 1; if (r.year && r.sem) sems[r.year + '-' + r.sem] = 1; });
          status = { name: f.name, tag: p.ban + '반 생기부',
                     desc: '학생 ' + Object.keys(names).length + '명 · 과목기록 ' + p.records.length +
                           '건 · 학기 ' + Object.keys(sems).sort().join(', ') };
        }
      } catch (err) { status = { name: f.name, tag: '오류', err: true, desc: String(err) }; }
      fileStatuses.push(status);
      done++;
      if (done === list.length) { invalidate(); save(); renderAll(); }
    };
    fr.readAsArrayBuffer(f);
  });
}

/* ---------- 데이터 탭 ---------- */
function renderFiles() {
  document.getElementById('fileList').innerHTML = fileStatuses.map(function (s) {
    return '<div class="filerow"><span class="tag' + (s.err ? ' err' : '') + '">' + esc(s.tag) + '</span>' +
           '<span>' + esc(s.name) + '</span><span class="desc">' + esc(s.desc) + '</span></div>';
  }).join('');
}
function renderOptions() {
  var sel = document.getElementById('optUniv');
  if (!sel.options.length) {
    sel.innerHTML = Object.keys(U.UNIVS).map(function (k) {
      var s = U.UNIVS[k];
      return '<option value="' + k + '">' + esc(s.name + ' — ' + s.types) + '</option>';
    }).join('');
  }
  sel.value = state.opt.univ;
  [['optFrom', 'semFrom'], ['optTo', 'semTo']].forEach(function (p) {
    var e = document.getElementById(p[0]);
    if (!e.options.length)
      e.innerHTML = SEMS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
    e.value = state.opt[p[1]];
  });
  document.getElementById('optPlain').value = state.opt.plainScope;
  var sp = spec();
  renderVariant(sp);
  var bits = ['<b>' + esc(sp.name) + '</b> 반영교과: ' + esc(sp.areaNote)];
  if (sp.excludeCommon) bits.push('공통과목(' + sp.commonSubjects.join(' · ') + ') <b>미반영</b>');
  bits.push(esc(sp.ratioNote));
  if (sp.trunc) bits.push('소수점 이하 ' + sp.trunc + '자리 미만 절사');
  document.getElementById('optHint').innerHTML = bits.join(' · ') + '.' +
    '<br>비교군인 단순 평균등급은 석차등급이 산출된 과목만 학점 가중 평균합니다(성취도·P 과목 제외).' +
    ' 석차는 <b>적재된 학생 전체</b>를 모집단으로 매깁니다 — 학년 전체를 넣어야 실제 석차에 가깝습니다.';
}
/* 계열·전형 변형 선택 — 변형이 있는 대학에서만 나타난다 */
function renderVariant(sp) {
  var host = document.getElementById('optVariantWrap');
  var base = U.UNIVS[state.opt.univ];
  if (!base || !base.variants || !base.variants.length) { host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '<label for="optVariant">계열 · 전형</label>' +
    '<select id="optVariant">' + base.variants.map(function (v) {
      return '<option value="' + esc(v.key) + '"' + (v.key === sp.variantKey ? ' selected' : '') +
             '>' + esc(v.label) + '</option>'; }).join('') + '</select>';
  document.getElementById('optVariant').onchange = function () {
    state.opt.variant[state.opt.univ] = this.value;
    invalidate(); save(); renderAll();
  };
}
function semName(v) {
  for (var i = 0; i < SEMS.length; i++) if (SEMS[i][0] === v) return SEMS[i][1];
  return String(v);
}
function renderLoad() {
  var card = document.getElementById('loadCard');
  if (!hasData()) { card.hidden = true; return; }
  card.hidden = false;
  var res = results();
  var bans = Object.keys(state.transcripts).map(Number).sort(function (a, b) { return a - b; });
  var warnSubj = {};
  res.rows.forEach(function (r) { r.univ.warns.forEach(function (w) { warnSubj[w.subject] = w.warn; }); });
  var noScore = res.rows.filter(function (r) { return r.univ.score === null; });
  var renorm = res.rows.filter(function (r) { return r.univ.renormalized; });
  var h = '<table class="plain"><tbody>';
  h += '<tr><th style="width:170px">적재된 반</th><td>' + bans.map(function (b) {
        return b + '반 (' + esc(state.transcripts[b].fileName) + ')'; }).join(' · ') + '</td></tr>';
  h += '<tr><th>모집단</th><td class="num">학생 ' + res.rows.length + '명 · 환산점수 산출 ' + res.nUniv +
       '명 · 단순 평균등급 산출 ' + res.nPlain + '명</td></tr>';
  h += '<tr><th>반영 학기</th><td>' + semName(state.opt.semFrom) + ' ~ ' + semName(state.opt.semTo) + '</td></tr>';
  h += '<tr><th>확인 필요 과목</th><td>' + (Object.keys(warnSubj).length
        ? '<span class="warnnote">' + Object.keys(warnSubj).length + '개 과목 · 「과목 점검」 탭에서 확인하세요</span>'
        : '<span class="ok">없음</span>') + '</td></tr>';
  if (renorm.length)
    h += '<tr><th>반영비율 재조정</th><td class="warnnote">' + renorm.length +
         '명 — 한쪽 그룹에 반영 과목이 없어 남은 그룹만으로 산출했습니다</td></tr>';
  if (noScore.length)
    h += '<tr><th>산출 불가</th><td class="warnnote">' + noScore.length + '명 — 반영 과목 기록이 없습니다</td></tr>';
  h += '</tbody></table>';
  document.getElementById('loadBody').innerHTML = h;
}

/* ---------- 학생 조회 ---------- */
function renderSugg() {
  var el = document.getElementById('stuSugg');
  if (!hasData()) { el.innerHTML = ''; return; }
  var top = results().rows.slice().filter(function (r) { return r.verdict.delta !== null; })
    .sort(function (a, b) { return Math.abs(b.verdict.delta) - Math.abs(a.verdict.delta); }).slice(0, 6);
  el.innerHTML = top.length
    ? '<span style="font-size:.78rem;color:var(--faint);align-self:center">유·불리 차이가 큰 학생 →</span>' +
      top.map(function (r) {
        return '<button data-id="' + r.id + '">' + esc(r.name) + ' <span class="' +
          (r.verdict.tag === 'up' ? 'up' : r.verdict.tag === 'down' ? 'down' : 'flat') + '">' +
          signed(r.verdict.delta) + '%p</span></button>'; }).join('')
    : '';
  Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
    b.onclick = function () { selectStudent(b.getAttribute('data-id')); };
  });
}
function findStudent(q) {
  q = String(q || '').trim();
  if (!q) return null;
  var rows = results().rows, i;
  for (i = 0; i < rows.length; i++) if (rows[i].sid === q) return rows[i];
  for (i = 0; i < rows.length; i++) if (rows[i].name === q) return rows[i];
  for (i = 0; i < rows.length; i++) if (rows[i].name.indexOf(q) === 0) return rows[i];
  return null;
}
function selectStudent(id) {
  curStudentId = id;
  document.querySelector('nav button[data-tab="student"]').click();
  var r = results().byId[id];
  if (r) document.getElementById('stuQuery').value = r.sid;
  renderStudent();
}
function renderStudent() {
  var body = document.getElementById('stuBody');
  if (!hasData()) { body.innerHTML = '<div class="empty">생기부를 적재한 뒤 학번이나 이름으로 학생을 찾아보세요.</div>'; return; }
  var q = document.getElementById('stuQuery').value;
  var r = q ? findStudent(q) : (curStudentId ? results().byId[curStudentId] : null);
  if (!r) {
    body.innerHTML = '<div class="empty">' + (q ? '해당하는 학생을 찾지 못했습니다.' : '학번이나 이름을 입력해 주세요.') + '</div>';
    return;
  }
  curStudentId = r.id;
  body.innerHTML = studentHTML(r);
}

function studentHTML(r) {
  var sp = spec(), a = U.analyze(r.univ, sp), v = r.verdict, res = results();
  var h = '';

  h += '<div class="stuhead"><span class="name">' + esc(r.name) + '</span>' +
       '<span class="meta">' + esc(r.sid) + ' · ' + curGrade() + '학년 ' + r.ban + '반 ' + r.no + '번</span></div>';

  var arrow = v.tag === 'up' ? '▲' : v.tag === 'down' ? '▼' : '―';
  var vtxt = v.tag === 'up' ? sp.short + ' 환산이 유리합니다'
           : v.tag === 'down' ? sp.short + ' 환산이 불리합니다'
           : '두 기준의 차이가 거의 없습니다';
  h += '<div class="verdictbar ' + (v.tag === 'up' ? 'up' : v.tag === 'down' ? 'down' : '') + '">' +
       '<span class="big">' + arrow + ' ' + esc(vtxt) + '</span>' +
       '<span class="why">단순 평균등급 기준 상위 ' + pctS(r.plainRank ? r.plainRank.pct : null) +
       ' → ' + esc(sp.short) + ' 환산 기준 상위 ' + pctS(r.univRank ? r.univRank.pct : null) +
       ' (백분위 ' + signed(v.delta) + '%p' +
       (r.rankDelta !== null ? ' · 석차 ' + signed(r.rankDelta, 0) + '위' : '') + ')' +
       (r.univRank && r.univRank.tie > 1
         ? ' <b class="down">— 같은 점수 ' + r.univRank.tie + '명, 동점자 처리로 갈립니다</b>' : '') +
       '</span></div>';

  /* 좌우 비교 */
  h += '<div class="cmp">';
  h += '<div class="cmpbox"><div class="h">단순 평균등급 <em>비교군</em></div>' +
       '<div class="v num">' + f2(r.plain.gpa) + '<small>등급</small></div>' +
       '<div class="sub">' + (state.opt.plainScope === 'reflect' ? '대학이 실제 반영하는 과목만' : '전 교과') +
       ' · 석차등급 산출 과목 ' + r.plain.credits + '학점</div>' +
       '<div class="rk num">석차 <b>' + (r.plainRank ? r.plainRank.rank : '—') + '</b> / ' + res.nPlain + '명' +
       '<span class="pct">상위 ' + pctS(r.plainRank ? r.plainRank.pct : null) + '</span></div>' +
       '<div class="form num">학점×등급 합 ' + n1(r.plain.weighted) + ' ÷ 총 이수학점 ' + r.plain.credits + '</div></div>';

  var sub = (r.univ.equiv !== null ? '환산등급 상당 <b class="num">' + f2(r.univ.equiv) + '등급</b> · ' : '') +
            '반영 ' + r.univ.credits + '학점 ' + r.univ.included.length + '과목';
  var form;
  if (sp.mode === 'base') {
    form = '기본 ' + sp.basePoints + ' + 실질 ' + n1(r.univ.generalReal) +
           ' (평균 ' + n1(r.univ.generalAvg) + '점 × ' + sp.coef + ')';
    form += '  +  진로선택 ' + n1(r.univ.careerScore) +
            (r.univ.careerCompare
              ? ' (' + r.univ.careerCount + '과목 → 비교내신)'
              : ' (상위 ' + sp.careerTopN + '과목)');
    form += '  · 출결 100점 별도';
  } else if (sp.mode === 'weighted') {
    form = '공통·일반선택 ' + n1(r.univ.generalScore) + ' (' + sp.generalPct + '점 만점)';
    if (sp.careerPct > 0)
      form += '  +  진로선택 ' + n1(r.univ.careerScore) +
              ' (' + r.univ.careerCount + '과목 → 상한 ' + r.univ.careerCap + ')';
    if (r.univ.scoreMax !== null && r.univ.scoreMax < 100)
      form += '  · 총점 만점 ' + r.univ.scoreMax;
  } else if (sp.mode === 'grouped') {
    form = (r.univ.groups || []).filter(function (g) { return g.avg !== null; }).map(function (g) {
      return g.label + ' ' + n1(g.avg) + ' × ' + Math.round(g.weight * 100) + '%';
    }).join('  +  ') || '—';
    if (r.univ.renormalized) form += '  · 한쪽 그룹이 비어 남은 비율로 재조정';
  } else {
    form = '학점×환산 합 ' + n1(r.univ.weighted) + ' ÷ 총 학점 ' + r.univ.credits;
    if (sp.bonusPerCredit)
      form += ' = ' + n1(r.univ.base) + '  +  가산점 ' + n1(r.univ.bonus) +
              ' (' + r.univ.bonusCredits + '학점 × ' + sp.bonusPerCredit + ')';
  }
  h += '<div class="cmpbox accent"><div class="h"><em>' + esc(sp.name) + '</em> 교과 점수</div>' +
       '<div class="v num">' + fscore(r.univ.score) + '</div>' +
       '<div class="sub">' + sub + '</div>' +
       '<div class="rk num">석차 <b>' + (r.univRank ? r.univRank.rank : '—') + '</b> / ' + res.nUniv + '명' +
       '<span class="pct">상위 ' + pctS(r.univRank ? r.univRank.pct : null) + '</span></div>' +
       '<div class="form num">' + esc(form) + '</div>' + tiebreakLine(r, sp) + '</div>';
  h += '</div>';

  /* 요인 분해 */
  h += '<h3>왜 갈렸나 — 요인 분해</h3><div class="factor">' + factorBoxes(r, a, sp) + '</div>';

  /* 과목별 상세 */
  function sec(title, meta, items, empty) {
    h += '<h3>' + esc(title) + ' <span class="sub" style="font-weight:400;color:var(--muted);' +
         'font-size:.8rem">' + meta + '</span></h3>';
    h += items.length ? subjTable(items, true, sp)
       : '<div class="card" style="color:var(--faint)">' + empty + '</div>';
  }
  if (sp.mode === 'base') {
    sec('석차등급산출과목', (r.univ.generalItems || []).length + '과목 · ' + r.univ.credits +
        '학점 · 평균 ' + n1(r.univ.generalAvg) + '점',
        r.univ.generalItems || [], '반영된 과목이 없습니다.');
    var topSet = {};
    (r.univ.careerTop || []).forEach(function (x) { topSet[x.subject] = 1; });
    sec('진로선택과목',
        r.univ.careerCount + '과목' + (r.univ.careerCompare ? ' · 3과목 미만이라 비교내신 적용'
          : ' · 성취도 상위 ' + sp.careerTopN + '과목만 반영'),
        r.univ.careerItems || [], '반영된 진로선택 과목이 없습니다.');
  } else if (sp.mode === 'weighted') {
    (r.univ.areaGroups || []).forEach(function (g) {
      sec(g.label, '가중치 ' + g.weight + ' · ' + g.items.length + '과목 · ' + g.credits + '학점' +
          (g.avg !== null ? ' · 평균 ' + n1(g.avg) + '점' : ''),
          g.items, '이 교과에 반영된 과목이 없습니다.');
    });
    if (sp.careerPct > 0)
      sec('진로선택과목', r.univ.careerCount + '과목 → 최대 취득 비율 ' + r.univ.careerCap + '%' +
          (r.univ.careerAvg !== null ? ' · 평균 ' + n1(r.univ.careerAvg) + '점' : ''),
          r.univ.careerItems || [], '반영된 진로선택 과목이 없습니다.');
  } else if (sp.mode === 'grouped') {
    (r.univ.groups || []).forEach(function (g) {
      h += '<h3>' + esc(g.label) + ' <span class="sub" style="font-weight:400;color:var(--muted);font-size:.8rem">' +
           '반영비율 ' + Math.round(g.weight * 100) + '% · ' + g.items.length + '과목 · ' + g.credits + '학점' +
           (g.avg !== null ? ' · 평균 배점 ' + n1(g.avg) : ' · 반영 과목 없음') + '</span></h3>';
      h += g.items.length ? subjTable(g.items, true, sp)
         : '<div class="card" style="color:var(--faint)">이 그룹에 반영된 과목이 없습니다.</div>';
    });
  } else {
    h += '<h3>반영 과목 <span class="sub" style="font-weight:400;color:var(--muted);font-size:.8rem">' +
         r.univ.included.length + '과목 · ' + r.univ.credits + '학점</span></h3>';
    h += subjTable(r.univ.included, true, sp);
  }

  /* 체육·예술은 교과 점수에서 빠지지만 동점자 처리에 실제로 쓰인다.
     흐릿한 제외 목록에 묻지 않고 자기 자리에서 산정 과정을 보여 준다. */
  var peShown = artsPeSection(r, sp);
  h += peShown;

  var ex = r.univ.excluded.filter(function (it) {
    if (it.reason === '반영 학기 밖') return false;
    if (peShown && it.area === '체예') return false;   // 위에서 따로 보여 줬다
    return true;
  });
  var exSem = r.univ.excluded.length - ex.length;
  h += '<h3>제외 과목 <span class="sub" style="font-weight:400;color:var(--muted);font-size:.8rem">' +
       ex.length + '과목' + (exSem ? ' (반영 학기 밖 ' + exSem + '과목은 생략)' : '') + '</span></h3>';
  h += ex.length ? subjTable(ex, false, sp) : '<div class="card" style="color:var(--faint)">제외된 과목이 없습니다.</div>';

  h += '<p class="footnote">「채택」은 ' + esc(sp.name) + ' 산식이 실제로 반영한 값입니다. ' + esc(sp.formula) + '. ' +
       (sp.trunc ? '결과는 소수점 이하 ' + sp.trunc + '자리 미만에서 절사합니다. ' : '') +
       (r.univ.equiv !== null
         ? '「환산등급 상당」은 교과 점수를 등급환산표에 역으로 대입해 감을 잡기 위한 참고값이며 요강에 있는 개념은 아닙니다.'
         : '이 대학은 배점 척도가 등급과 대응하지 않아 「환산등급 상당」을 내지 않습니다.') + '</p>';
  return h;
}

/* 체육·예술 교과 산정 표 — 동점자 처리 지표를 쓰는 규격에서만 펼친다 */
function artsPeSection(r, sp) {
  if (!sp.tiebreakers || !sp.tiebreakers.length) return '';
  var pe = r.univ.artsPe, P = U.ARTS_PE_POINT;
  var head = '<h3>체육 · 예술 교과 <span class="sub" style="font-weight:400;color:var(--muted);' +
    'font-size:.8rem">동점자 처리 지표 · 교과 점수에는 들어가지 않습니다</span></h3>';
  if (!pe.count)
    return head + '<div class="card" style="color:var(--faint)">반영 학기 안에 체육·예술 과목 기록이 없습니다.</div>';

  var sum = 0;
  var rows = pe.items.slice().sort(function (a, b) {
    return (a.year * 10 + a.sem) - (b.year * 10 + b.sem) || a.subject.localeCompare(b.subject);
  }).map(function (it) {
    var pt = P[it.ach];
    sum += pt;
    var currL = it.curr === 'career' ? '진로선택' : it.curr === 'general' ? '일반선택' : '—';
    return '<tr><td class="num">' + semLabel(it.year, it.sem) + '</td>' +
      '<td>' + esc(it.category || '—') + '</td><td>' + esc(it.subject) + '</td>' +
      '<td class="c" style="font-size:.78rem;color:var(--muted)">' + currL + '</td>' +
      '<td class="r num">' + (it.credit || '—') + '</td>' +
      '<td class="c"><b>' + esc(it.ach) + '</b></td>' +
      '<td class="r num usecell">' + pt + '</td></tr>';
  }).join('');

  var d = pe.dist;
  var h = head + '<div class="tblwrap"><table class="plain"><thead><tr>' +
    '<th>학기</th><th>교과</th><th>과목</th><th class="c">구분</th><th class="r">학점</th>' +
    '<th class="c">성취도</th><th class="r">배점</th></tr></thead><tbody>' + rows +
    '<tr style="border-top:2px solid var(--line)"><td colspan="4" style="font-weight:700">평균</td>' +
    '<td class="r num" style="color:var(--muted)">' + pe.credits + '</td>' +
    '<td class="c" style="font-size:.78rem;color:var(--muted)">' +
      ['A', 'B', 'C'].filter(function (k) { return d[k]; })
        .map(function (k) { return k + ' ' + d[k]; }).join(' · ') + '</td>' +
    '<td class="r num"><b style="font-size:1.05rem">' + pe.avg.toFixed(2) + '</b></td></tr>' +
    '</tbody></table></div>';

  h += '<p class="footnote" style="margin-top:10px">배점은 <b>A 3점 · B 2점 · C 1점</b>. ' +
    '배점 합 ' + sum + ' ÷ ' + pe.count + '과목 = <b>' + pe.avg.toFixed(2) + '점</b>입니다. ' +
    '요강이 「성취도 평균」이라고만 해 과목 단위로 평균했고, 이수단위로 가중하면 ' +
    pe.avgByCredit.toFixed(2) + '점입니다. ' + esc(sp.name) + '는 이 값이 동점자 처리 기준이라, ' +
    '교과 점수가 같은 학생끼리는 여기서 갈립니다.</p>';

  if (sp.tiebreakSteps && sp.tiebreakSteps.length) {
    h += '<div class="card" style="margin-top:12px"><div style="font-size:.78rem;font-weight:700;' +
      'color:var(--muted);margin-bottom:8px">' + esc(sp.name) + ' 동점자 처리 순서</div><ol style="' +
      'margin:0 0 0 18px;font-size:.83rem;color:var(--muted);line-height:1.8">' +
      sp.tiebreakSteps.map(function (t, i) {
        var can = i === 1;
        return '<li>' + esc(t) + (can
          ? ' <span class="pill ach">이 도구가 산출</span>'
          : ' <span class="pill off">자료 없어 미산출</span>') + '</li>';
      }).join('') + '</ol></div>';
  }
  return h;
}

/* 동점자 처리 보조 지표 — 교과 점수에는 안 들어가지만 실제 선발에 쓰인다 */
function tiebreakLine(r, sp) {
  if (!sp.tiebreakers || !sp.tiebreakers.length) return '';
  var pe = r.univ.artsPe, d = pe.dist;
  var body = pe.avg === null ? '체육·예술 과목 기록 없음'
    : '<b class="num">' + pe.avg.toFixed(2) + '</b> <span style="color:var(--faint)">(' +
      pe.count + '과목 · ' + ['A', 'B', 'C'].filter(function (k) { return d[k]; })
        .map(function (k) { return k + ' ' + d[k]; }).join(' · ') + ')</span>';
  return '<div class="tiebreak"><span class="tb">동점자</span> 체육·예술 성취도 평균 ' + body + '</div>';
}

/* 요인 분해 카드 — 규격 구조에 따라 달라진다 */
function factorBoxes(r, a, sp) {
  var h = '';
  function box(t, n, cls, d) {
    return '<div class="fbox"><div class="t">' + t + '</div><div class="n ' + (cls || '') + '">' + n +
           '</div><div class="d">' + d + '</div></div>';
  }
  if (sp.excludeCommon) {
    h += box('공통과목 미반영',
      a.commonGrade === null ? '—' : f2(a.commonGrade) + '등급', 'num',
      a.commonCredits
        ? a.commonItems.length + '개 공통과목(' + a.commonCredits + '학점)이 산식에서 통째로 빠졌습니다. ' +
          '반영된 일반선택 평균등급 ' + f2(a.inGrade) + '등급과 비교하면 미반영이 ' +
          (a.commonGrade > a.inGrade ? '<b class="up">유리</b>하게' : '<b class="down">불리</b>하게') + ' 작용합니다.'
        : '반영 학기 안에 공통과목 기록이 없습니다.');
  }

  if (sp.mode === 'base') {
    h += box('석차등급산출과목', n1(r.univ.generalScore), 'num',
      r.univ.credits + '학점 · 이수단위 가중평균 <b>' + n1(r.univ.generalAvg) + '점</b>. ' +
      '기본점수 ' + sp.basePoints + '점은 전원 동일하고, 성적으로 갈리는 실질점수는 ' +
      '<b>' + n1(r.univ.generalReal) + ' / ' + sp.realMax + '점</b>입니다.');
    h += box('진로선택 <span style="color:var(--faint)">' +
             (r.univ.careerCompare ? '비교내신' : '상위 ' + sp.careerTopN + '과목') + '</span>',
      n1(r.univ.careerScore), r.univ.careerCompare ? 'down' : 'num',
      r.univ.careerCompare
        ? r.univ.careerCount + '과목만 이수해 <b class="down">비교내신</b>이 적용됐습니다. ' +
          '석차등급산출과목 실질점수 × ' + sp.compareCoef + ' (최저 ' + sp.compareMin + '점). ' +
          '이수한 진로선택 성적은 반영되지 않습니다.'
        : r.univ.careerCount + '과목 중 성취도가 높은 상위 ' + sp.careerTopN + '과목(' +
          r.univ.careerTop.map(function (x) { return x.ach; }).join(' · ') + ')만 반영했습니다. ' +
          '최대 ' + sp.careerMax + '점.');
  } else if (sp.mode === 'weighted') {
    (a.areaGroups || []).forEach(function (g) {
      h += box(esc(g.label) + ' <span style="color:var(--faint)">가중치 ' + g.weight + '</span>',
        g.avg === null ? '—' : n1(g.avg), 'num',
        g.avg === null ? '이수 과목이 없어 가중치에서 빠졌습니다 (나머지로 재정규화).'
          : g.items.length + '과목 · ' + g.credits + '학점. 최종 점수에 <b>' +
            n1(g.contrib) + '점</b>을 실었습니다.');
    });
    if (sp.careerPct > 0)
      h += box('진로선택 <span style="color:var(--faint)">상한 ' + a.careerCap + '</span>',
        a.careerScore === null ? '—' : n1(a.careerScore), a.capLoss > 0 ? 'down' : 'num',
        a.careerCount + '과목 이수 → 최대 취득 비율 <b>' + a.careerCap + '%</b>. ' +
        (a.capLoss > 0
          ? '3과목 이상이었다면 ' + sp.careerPct + '%였을 텐데 ' +
            '<b class="down">총점 만점이 ' + a.scoreMax + '점으로 내려갔습니다</b>.'
          : '상한을 온전히 확보했습니다.'));
  } else if (sp.mode === 'grouped') {
    (r.univ.groups || []).forEach(function (g) {
      var cnt = a.convCount[g.key] || {};
      var dist = Object.keys(cnt).sort().map(function (k) {
        return k + ' ' + cnt[k] + '학점'; }).join(' · ') || '반영 과목 없음';
      var worst = Object.keys(sp.pointOf).reduce(function (m, k) {
        return sp.pointOf[k] < sp.pointOf[m] ? k : m; });
      var lostCr = cnt[worst] || 0;
      h += box(esc(g.label) + ' <span style="color:var(--faint)">' + Math.round(g.weight * 100) + '%</span>',
        g.avg === null ? '—' : n1(g.avg), 'num',
        dist + '.' + (g.avg !== null
          ? ' 최종 점수에 ' + n1(g.avg * g.weight) + '점을 실었습니다.' +
            (lostCr ? ' <b class="down">' + worst + '(' + sp.pointOf[worst] + '점) ' + lostCr +
                      '학점</b>이 이 그룹 평균을 끌어내렸습니다.' : ' 감점 구간 과목이 없습니다.')
          : ''));
    });
  } else {
    h += box('원점수 상윗값 채택',
      signed(a.rawGainPoint, 2) + '점', a.rawGainPoint > 0 ? 'up' : 'flat',
      a.rawWin.length + '개 과목(' + a.rawWinCredits + '학점)에서 원점수환산이 등급환산보다 높아 채택됐습니다.' +
      (a.rawWin.length ? ' 이 이득이 없었다면 교과 점수는 ' +
         fscore(U.truncDiv(r.univ.weighted - a.rawGainPoint * a.totalCredits, r.univ.credits, sp.trunc)) + '입니다.' : ''));

    var achTxt = ['A', 'B', 'C'].filter(function (k) { return a.achCount[k]; })
        .map(function (k) { return k + ' ' + a.achCount[k] + '과목'; }).join(' · ');
    if (sp.bonusPerCredit)
      h += box('이수학점 가산점', '+' + n1(r.univ.bonus) + '점', 'up',
        '반영교과 안에서 이수한 <b>' + r.univ.bonusCredits + '학점</b> × ' + sp.bonusPerCredit +
        '입니다. 환산 대상이 아닌 이수(P) 과목도 학점 합에는 들어갑니다. ' +
        '성적이 같아도 <b>많이 이수할수록 유리</b>하고, 이 가산점 때문에 총점이 ' +
        sp.scaleMax + '점을 넘을 수 있습니다.');
    h += box('진로선택 성취도', a.careerAvg === null ? '—' : n1(a.careerAvg), 'num',
      a.careerCredits
        ? achTxt + ' · ' + a.careerCredits + '학점 · 평균 환산점수입니다. 공통·일반선택 평균 환산은 ' +
          n1(a.generalAvg) + '점 — ' + (a.careerAvg > a.generalAvg
            ? '진로선택이 점수를 <b class="up">끌어올리고</b> 있습니다.'
            : '진로선택이 점수를 <b class="down">끌어내리고</b> 있습니다.')
        : '반영교과에 진로선택 과목이 없습니다.');
  }

  h += box('반영교과 밖 제외', a.offGrade === null ? '—' : f2(a.offGrade) + '등급', 'num',
    a.offCredits
      ? a.offItems.length + '개 과목(' + a.offCredits + '학점)이 반영교과가 아니라 빠졌습니다. ' +
        '반영된 일반선택 평균등급 ' + f2(a.inGrade) + '등급과 비교하면 제외가 ' +
        (a.offGrade > a.inGrade ? '<b class="up">유리</b>하게' : '<b class="down">불리</b>하게') + ' 작용합니다.'
      : '반영교과 밖에서 빠진 등급 과목이 없습니다.');
  return h;
}

function subjTable(items, inc, sp) {
  var extra = sp.detail || [];
  var h = '<div class="tblwrap"><table class="plain"><thead><tr>' +
    '<th>학기</th><th>교과</th><th>과목</th><th class="c">계열</th><th class="r">학점</th>' +
    '<th class="c">등급</th><th class="r">원점수</th><th class="c">성취도</th>' +
    extra.map(function (c) { return '<th class="r">' + esc(c.h) + '</th>'; }).join('') +
    '<th class="r">채택</th><th>' + (inc ? '근거' : '제외 사유') + '</th></tr></thead><tbody>';
  items.slice().sort(function (a, b) {
    return (a.year * 10 + a.sem) - (b.year * 10 + b.sem) ||
           a.area.localeCompare(b.area) || a.subject.localeCompare(b.subject);
  }).forEach(function (it) {
    /* 계열은 교육과정 구분을 먼저 보이고, 표에 없는 과목만 산출 방식으로 표기한다 */
    var kindL = it.curr === 'common' ? '공통과목' : it.curr === 'general' ? '일반선택'
              : it.curr === 'career' ? '진로선택'
              : it.kind === 'general' ? '등급 산출' : it.kind === 'career' ? '성취도 산출'
              : it.kind === 'pass' ? '이수(P)' : '—';
    h += '<tr class="' + (inc ? (/원점수/.test(it.basis) ? 'rawwin' : '') : 'excl') + '">' +
      '<td class="num">' + semLabel(it.year, it.sem) + '</td>' +
      '<td>' + esc(it.category || '—') + '</td>' +
      '<td>' + esc(it.subject) + (it.warn ? '<span class="warnmark" title="' + esc(it.warn) + '">확인</span>' : '') + '</td>' +
      '<td class="c" style="font-size:.78rem;color:var(--muted)">' + kindL + '<br>' + esc(it.area) + '</td>' +
      '<td class="r num">' + (it.credit || '—') + '</td>' +
      '<td class="c">' + (it.grade ? '<span class="gchip" style="' + gcolor(it.grade) + '">' + it.grade + '</span>' : '—') + '</td>' +
      '<td class="r num">' + (it.raw === null || it.raw === undefined ? '—' : it.raw) + '</td>' +
      '<td class="c">' + esc(it.ach || '—') + '</td>' +
      extra.map(function (c) { return '<td class="r num">' + cellVal(c.get(it)) + '</td>'; }).join('') +
      '<td class="r num usecell">' + (it.use === null ? '—' : it.use) + '</td>' +
      '<td style="font-size:.8rem">' + (inc ? basisPill(it) : esc(it.reason)) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/* ---------- 순위 비교 ---------- */
function renderRank() {
  var ctrl = document.getElementById('rankCtrl'), body = document.getElementById('rankBody');
  if (!hasData()) { ctrl.innerHTML = ''; body.innerHTML = '<div class="empty">생기부를 먼저 적재해 주세요.</div>'; return; }
  var res = results(), sp = spec();
  var bans = Object.keys(state.transcripts).map(Number).sort(function (a, b) { return a - b; });
  ctrl.innerHTML = '<div class="rankctrl">' +
    '<div class="f"><label for="rkSort">정렬</label><select id="rkSort">' +
      '<option value="univ">' + esc(sp.short) + ' 환산 석차</option>' +
      '<option value="plain">단순 평균등급 석차</option>' +
      '<option value="delta">유리한 순 (백분위 상승)</option>' +
      '<option value="deltaDown">불리한 순 (백분위 하락)</option>' +
      '<option value="id">학번</option></select></div>' +
    '<div class="f"><label for="rkBan">반</label><select id="rkBan">' +
      '<option value="all">전체</option>' +
      bans.map(function (b) { return '<option value="' + b + '">' + b + '반</option>'; }).join('') +
      '</select></div></div>';
  document.getElementById('rkSort').value = rankSort;
  document.getElementById('rkBan').value = rankBan;
  document.getElementById('rkSort').onchange = function () { rankSort = this.value; renderRank(); };
  document.getElementById('rkBan').onchange = function () { rankBan = this.value; renderRank(); };

  function rk(x) { return x ? x.rank : 1e9; }
  function dv(x) { return x.verdict.delta === null ? -1e9 : x.verdict.delta; }
  var rows = res.rows.filter(function (r) { return rankBan === 'all' || String(r.ban) === rankBan; });
  rows.sort(function (a, b) {
    if (rankSort === 'id') return a.ban - b.ban || a.no - b.no;
    if (rankSort === 'plain') return rk(a.plainRank) - rk(b.plainRank);
    if (rankSort === 'delta') return dv(b) - dv(a);
    if (rankSort === 'deltaDown') return dv(a) - dv(b);
    /* 교과 점수가 같으면 동점자 처리 지표(체육·예술 성취도 평균)로 한 번 더 가른다 */
    return rk(a.univRank) - rk(b.univRank) || tb(b) - tb(a);
  });
  function tb(x) { var v = x.univ.artsPe && x.univ.artsPe.avg; return v === null || v === undefined ? -1 : v; }

  var hasTB = !!(sp.tiebreakers && sp.tiebreakers.length);
  var upN = res.rows.filter(function (r) { return r.verdict.tag === 'up'; }).length;
  var dnN = res.rows.filter(function (r) { return r.verdict.tag === 'down'; }).length;
  var showEquiv = sp.equivScale != null;

  var h = '<p class="footnote" style="margin:0 0 14px">모집단 ' + res.rows.length + '명 · ' +
    esc(sp.short) + ' 환산에서 백분위가 오른 학생 <b class="up">' + upN + '명</b>, 내린 학생 <b class="down">' +
    dnN + '명</b>. 행을 누르면 해당 학생 상세로 이동합니다.' +
    (hasTB ? ' <b class="warnnote">동점자가 있으면 「체예 성취도」(A 3 · B 2 · C 1)로 한 번 더 정렬합니다 — ' +
             esc(sp.name) + '는 이 지표가 동점자 처리 기준입니다.</b>' : '') + '</p>';
  h += '<div class="tblwrap"><table class="plain ranktbl"><thead><tr>' +
    '<th>학번</th><th>이름</th><th class="r">단순 평균등급</th><th class="r">석차</th>' +
    '<th class="r">' + esc(sp.short) + ' 교과점수</th>' +
    (sp.bonusPerCredit ? '<th class="r">가산점</th>' : '') +
    (showEquiv ? '<th class="r">환산등급 상당</th>' : '') +
    '<th class="r">석차</th>' +
    (hasTB ? '<th class="r">동점</th><th class="r">체예 성취도</th>' : '') +
    '<th class="r">석차 변화</th><th class="r">백분위 변화</th><th>판정</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var cls = r.verdict.tag === 'up' ? 'up' : r.verdict.tag === 'down' ? 'down' : 'flat';
    h += '<tr class="rankrow" data-id="' + r.id + '">' +
      '<td class="num">' + r.sid + '</td><td class="nm">' + esc(r.name) + '</td>' +
      '<td class="r num">' + f2(r.plain.gpa) + '</td>' +
      '<td class="r num">' + (r.plainRank ? r.plainRank.rank : '—') + '</td>' +
      '<td class="r num">' + fscore(r.univ.score) + '</td>' +
      (sp.bonusPerCredit
        ? '<td class="r num" style="color:var(--up)">+' + n1(r.univ.bonus) +
          ' <span style="color:var(--faint);font-size:.78rem">' + r.univ.bonusCredits + '학점</span></td>'
        : '') +
      (showEquiv ? '<td class="r num">' + f2(r.univ.equiv) + '</td>' : '') +
      '<td class="r num">' + (r.univRank ? r.univRank.rank : '—') + '</td>' +
      (hasTB
        ? '<td class="r num" style="color:' + (r.univRank && r.univRank.tie > 1 ? 'var(--down)' : 'var(--faint)') + '">' +
            (r.univRank && r.univRank.tie > 1 ? r.univRank.tie + '명' : '—') + '</td>' +
          '<td class="r num"><b>' + (r.univ.artsPe.avg === null ? '—' : r.univ.artsPe.avg.toFixed(2)) + '</b></td>'
        : '') +
      '<td class="r num dv ' + cls + '">' + (r.rankDelta === null ? '—' : signed(r.rankDelta, 0)) + '</td>' +
      '<td class="r num dv ' + cls + '">' + signed(r.verdict.delta) + '%p</td>' +
      '<td class="' + cls + '" style="font-size:.82rem">' + esc(r.verdict.label) + '</td></tr>';
  });
  body.innerHTML = h + '</tbody></table></div>';
  Array.prototype.forEach.call(body.querySelectorAll('tr.rankrow'), function (tr) {
    tr.onclick = function () { selectStudent(tr.getAttribute('data-id')); };
  });
}

/* ---------- 과목 점검 ---------- */
function renderSubject() {
  var body = document.getElementById('subjBody');
  if (!hasData()) { body.innerHTML = '<div class="empty">생기부를 먼저 적재해 주세요.</div>'; return; }
  var sp = spec(), res = results(), map = {};
  res.rows.forEach(function (r) {
    r.univ.items.forEach(function (it) {
      var k = it.subject;
      if (!map[k]) map[k] = { subject: k, category: it.category, area: it.area, kind: it.kind,
                              curr: it.curr, n: 0, inc: 0, warn: it.warn, autoLabel: it.autoLabel,
                              common: it.common, sems: {} };
      map[k].n++;
      if (it.included) map[k].inc++;
      if (it.year && it.sem) map[k].sems[it.year + '-' + it.sem] = 1;
      if (it.warn && !map[k].warn) map[k].warn = it.warn;
    });
  });
  var keys = Object.keys(map).sort(function (a, b) {
    var A = map[a], B = map[b];
    return (B.warn ? 1 : 0) - (A.warn ? 1 : 0) ||
           AREAS.indexOf(A.area) - AREAS.indexOf(B.area) || a.localeCompare(b);
  });
  var warnN = keys.filter(function (k) { return map[k].warn; }).length;

  var h = '<div class="card"><h2>과목 판정 점검 <span class="sub">자동 판정이 어긋난 과목을 여기서 바로잡습니다</span></h2>' +
    '<p style="font-size:.84rem;color:var(--muted)">계열은 <b>2015 개정 교육과정 과목표</b>로 확정합니다 — ' +
    '공통과목 · 일반선택 · 진로선택이 과목명으로 정해지고, 표가 기대하는 성적(석차등급 · 성취도 · P)이 생기부에 없으면 ' +
    '기재값대로 처리하되 「확인」을 붙입니다. 교과영역은 나이스 「교과」 열 → 교육과정 표 → 과목명 추론 순으로 판정합니다. ' +
    '두 값 모두 아래에서 과목 단위로 덮어쓸 수 있고, 설정은 이 컴퓨터에 저장됩니다.' +
    (warnN ? ' <b class="warnnote">확인이 필요한 과목 ' + warnN + '개가 위쪽에 있습니다.</b>' : '') + '</p></div>';

  h += '<div class="tblwrap"><table class="plain"><thead><tr>' +
    '<th>과목</th><th>나이스 교과</th><th>학기</th><th class="r">기록</th>' +
    '<th>교육과정 자동 분류</th><th>계열</th><th>교과영역</th><th class="c">반영</th><th>확인</th>' +
    '</tr></thead><tbody>';
  keys.forEach(function (k) {
    var m = map[k];
    var ko = state.opt.kindOverride[k] || '', ao = state.opt.areaOverride[k] || '';
    h += '<tr class="subjrow">' +
      '<td><b>' + esc(k) + '</b>' + (m.common ? '<span class="pill same" style="margin-left:6px">공통</span>' : '') + '</td>' +
      '<td style="color:var(--muted)">' + esc(m.category || '—') + '</td>' +
      '<td class="num" style="color:var(--muted);font-size:.8rem">' + Object.keys(m.sems).sort().join(', ') + '</td>' +
      '<td class="r num">' + m.n + '건</td>' +
      '<td style="color:var(--muted);font-size:.8rem">' + esc(m.autoLabel) + '</td>' +
      '<td><select data-kind="' + esc(k) + '" class="' + (ko ? 'edited' : '') + '">' +
        optTag('', '자동 (' + kindLabel(m.kind, m.curr) + ')', ko) + optTag('general', '공통·일반선택', ko) +
        optTag('career', '진로선택·성취도', ko) + optTag('skip', '산출 제외', ko) + '</select></td>' +
      '<td><select data-area="' + esc(k) + '" class="' + (ao ? 'edited' : '') + '">' +
        optTag('', '자동 (' + m.area + ')', ao) +
        AREAS.map(function (x) { return optTag(x, x, ao); }).join('') + '</select></td>' +
      '<td class="c">' + (m.inc ? '<span class="ok">반영</span>' : '<span style="color:var(--faint)">제외</span>') + '</td>' +
      '<td style="font-size:.78rem" class="warnnote">' + esc(m.warn || '') + '</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<p class="footnote">' + esc(sp.name) + ' 반영교과는 ' + esc(sp.areaNote) + '입니다' +
    (sp.excludeCommon ? '. 「공통」 배지가 붙은 과목(' + sp.commonSubjects.join(' · ') + ')은 요강상 반영하지 않아 교과영역과 무관하게 빠집니다' : '') +
    '. 교과영역을 「체예」나 「기타」로 두면 산출에서 빠지고, 반영교과로 바꾸면 즉시 포함됩니다.</p>';
  body.innerHTML = h;

  Array.prototype.forEach.call(body.querySelectorAll('select[data-kind]'), function (s) {
    s.onchange = function () {
      var k = s.getAttribute('data-kind');
      if (s.value) state.opt.kindOverride[k] = s.value; else delete state.opt.kindOverride[k];
      invalidate(); save(); renderAll();
    };
  });
  Array.prototype.forEach.call(body.querySelectorAll('select[data-area]'), function (s) {
    s.onchange = function () {
      var k = s.getAttribute('data-area');
      if (s.value) state.opt.areaOverride[k] = s.value; else delete state.opt.areaOverride[k];
      invalidate(); save(); renderAll();
    };
  });
}
function optTag(v, label, cur) {
  return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(label) + '</option>';
}
function kindLabel(k, curr) {
  if (curr === 'common') return '공통과목';
  if (curr === 'general') return '일반선택';
  if (curr === 'career') return '진로선택';
  return k === 'general' ? '공통·일반선택' : k === 'career' ? '진로선택·성취도'
       : k === 'pass' ? '이수(P)' : '판정 불가';
}

/* ---------- 산출 기준 ---------- */
function renderSpec() {
  var sp = spec();
  var h = '<div class="card"><h2>' + esc(sp.name) + ' <span class="sub">' + esc(sp.types) + '</span></h2>' +
    '<table class="plain"><tbody>' +
    '<tr><th style="width:150px">적용 대상</th><td>' + esc(sp.target) + '</td></tr>' +
    '<tr><th>반영 비율</th><td>' + esc(sp.ratioNote) + '</td></tr>' +
    '<tr><th>반영 교과</th><td>' + esc(sp.areaNote) + '</td></tr>' +
    (sp.excludeCommon
      ? '<tr><th>공통과목</th><td><b>반영하지 않음</b> — ' + esc(sp.commonSubjects.join(', ')) + '</td></tr>' : '') +
    '<tr><th>점수산출지표</th><td>' + esc(sp.rawNote) + '</td></tr>' +
    (sp.trunc ? '<tr><th>절사</th><td>계산은 소수점 이하 ' + sp.trunc + '자리 미만에서 절사</td></tr>' : '') +
    '</tbody></table>' +
    '<div class="formula" style="margin-top:16px">교과 점수 = ' + esc(sp.formula) + '</div></div>';

  h += '<div class="conv">' + (sp.specTables ? sp.specTables(sp) : []).map(function (t) {
    return '<div class="card"><h2>' + esc(t.title) + '</h2><table class="plain"><thead><tr>' +
      t.head.map(function (x, i) { return '<th class="' + (i === 0 ? 'c' : 'r') + '">' + esc(x) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + t.rows.map(function (row) {
        return '<tr>' + row.map(function (c, i) {
          var v = c.grade ? '<span class="gchip" style="' + gcolor(c.grade) + '">' + c.v + '</span>'
                : c.strong ? '<b>' + esc(c.v) + '</b>'
                : c.num ? Number(c.v).toLocaleString() : esc(c.v);
          return '<td class="' + (i === 0 ? 'c' : 'r num') + '">' + v + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }).join('') + '</div>';

  h += '<p class="footnote">이 화면의 표는 요강 원문을 그대로 옮긴 것이고, 실제 계산도 이 값만 사용합니다. ' +
    (sp.id === 'hufs'
      ? '원점수 구간은 모두 <b>이상 ~ 미만</b>입니다 — 국어 85점은 2등급 구간(85 이상 90 미만)이라 960점, ' +
        '수학 85점도 2등급 구간(80 이상 90 미만)이라 960점입니다. 다만 국어 82점은 890점인데 수학 82점은 960점으로 갈립니다. ' +
        '학교장추천전형과 논술전형은 같은 산식을 쓰며, 논술전형에서는 동점자 발생 시에만 활용됩니다.'
      : '진로선택과목은 성취도가 아니라 <b>원점수</b>로 변환등급을 매기는 점에 주의하세요 — 성취도가 A라도 원점수가 70점 미만이면 B 또는 E가 됩니다. ' +
        '두 그룹의 평균을 각각 낸 뒤 진로선택 60% + 일반선택 40%로 합치므로, 과목 수가 적은 그룹의 과목 하나가 점수에 크게 작용합니다. ' +
        '요강에 절사 규정이 없어 절사하지 않고 소수 4자리까지 표시합니다.') +
    (sp.excludeCommon
      ? ' 공통과목(1학년 국어·수학·영어·통합사회·통합과학·한국사)은 아예 반영하지 않으므로, 1학년 성적이 나빠도 이 전형에서는 직접적인 손해가 없습니다.'
      : '') + '</p>';
  document.getElementById('specBody').innerHTML = h;
}

/* ---------- 전체 렌더 ---------- */
function renderAll() {
  renderSaveState(); renderFiles(); renderOptions(); renderLoad();
  renderSugg(); renderStudent(); renderRank(); renderSubject(); renderSpec();
}

/* ---------- 이벤트 ---------- */
var drop = document.getElementById('drop'), fileInput = document.getElementById('fileInput');
drop.addEventListener('click', function () { fileInput.click(); });
fileInput.addEventListener('change', function () { handleFiles(fileInput.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach(function (ev) {
  drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
});
['dragleave', 'drop'].forEach(function (ev) {
  drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
});
drop.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });
window.addEventListener('dragover', function (e) { e.preventDefault(); });
window.addEventListener('drop', function (e) { e.preventDefault(); });

Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
  b.onclick = function () {
    Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (x) { x.classList.remove('on'); });
    Array.prototype.forEach.call(document.querySelectorAll('section.tab'), function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    document.getElementById('tab-' + b.getAttribute('data-tab')).classList.add('on');
  };
});

document.getElementById('stuQuery').addEventListener('input', renderStudent);
['optUniv', 'optFrom', 'optTo', 'optPlain'].forEach(function (id) {
  document.getElementById(id).addEventListener('change', function () {
    if (id === 'optUniv') state.opt.univ = this.value;
    if (id === 'optFrom') state.opt.semFrom = parseInt(this.value, 10);
    if (id === 'optTo') state.opt.semTo = parseInt(this.value, 10);
    if (id === 'optPlain') state.opt.plainScope = this.value;
    invalidate(); save(); renderAll();
  });
});
document.getElementById('btnReset').addEventListener('click', function () {
  if (!confirm('적재한 생기부와 과목 설정을 모두 지웁니다. 계속할까요?')) return;
  state = blank(); fileStatuses = []; curStudentId = null;
  try { localStorage.removeItem(LSKEY); } catch (e) {}
  invalidate(); renderAll();
});

load(); renderAll();
})();
