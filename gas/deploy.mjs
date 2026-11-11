// clasp push → 같은 배포 ID로 재배포 (웹앱 URL 고정). 최초 1회만 새 배포를 만든다.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const FILE = new URL('./.deployment.json', import.meta.url);
const run = (cmd) => execSync(`npx clasp -u dada ${cmd}`, { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });

console.log('▶ clasp push');
console.log(run('push --force'));

const desc = `DADA Music ${new Date().toISOString().slice(0, 16)}`;
let id = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).deploymentId : null;

if (id) {
  console.log(`▶ 재배포 ${id}`);
  console.log(run(`deploy -i ${id} -d "${desc}"`));
} else {
  console.log('▶ 최초 배포');
  const out = run(`deploy -d "${desc}"`);
  console.log(out);
  id = (out.match(/AKfy[\w-]+/) || [])[0];
  if (!id) throw new Error('배포 ID를 출력에서 찾지 못했습니다. `npx clasp deployments` 로 확인 후 .deployment.json 에 직접 넣으세요.');
  fs.writeFileSync(FILE, JSON.stringify({ deploymentId: id }, null, 2));
}

console.log(`\n✅ 웹앱 URL (web/.env.local 의 VITE_API_URL):\n   https://script.google.com/macros/s/${id}/exec\n`);
