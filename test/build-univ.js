/* univ/index.html 빌드 — 오프라인·CSP 환경에서 그대로 열리도록 전부 인라인한다.
   조각: src/univ/shell.html + test/xlsx.escaped.js + test/simcore.js
         + test/univcore.js + src/univ/app.js
   핵심 로직(simcore/univcore)은 테스트가 그대로 require 하는 파일이라 배포본과 항상 같다. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const parts = {
  XLSX: read('test/xlsx.escaped.js'),
  SIMCORE: read('test/simcore.js'),
  UNIVCORE: read('test/univcore.js'),
  APP: read('src/univ/app.js')
};

let html = read('src/univ/shell.html');
Object.keys(parts).forEach(k => {
  const token = `<!--{{${k}}}-->`;
  if (!html.includes(token)) throw new Error(`셸에 ${token} 자리가 없습니다`);
  html = html.split(token).join(parts[k]);
});

// 인라인한 스크립트 안에 </script>가 있으면 문서가 조기 종료된다 — 사전 차단
const bodyOnly = html.slice(html.indexOf('<script>'));
if (/<\/script\s*>/i.test(parts.XLSX + parts.SIMCORE + parts.UNIVCORE + parts.APP))
  throw new Error('인라인 스크립트에 </script> 문자열이 있습니다');
void bodyOnly;

const out = path.join(root, 'univ', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('빌드 완료:', path.relative(root, out), '·', (html.length / 1024).toFixed(0) + 'KB');
