// 최초 1회: Apps Script 프로젝트 생성. clasp 가 원격 기본 manifest 로 src/appsscript.json 을
// 덮어쓸 수 있으므로 생성 전후로 로컬 manifest(YouTube 고급 서비스·웹앱 설정)를 보존한다.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const manifestPath = new URL('./src/appsscript.json', import.meta.url);
if (fs.existsSync(new URL('./.clasp.json', import.meta.url))) {
  console.log('이미 .clasp.json 이 있습니다. 새로 만들 필요가 없습니다.');
  process.exit(0);
}
const manifest = fs.readFileSync(manifestPath, 'utf8');
execSync('npx clasp -u dada create-script --type standalone --title "DADA Music API" --rootDir src', { stdio: 'inherit' });
fs.writeFileSync(manifestPath, manifest);
console.log('\n✅ 프로젝트 생성 완료. 다음: npm run push');
