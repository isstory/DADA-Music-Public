/**
 * DB 스프레드시트 준비. 없으면 만들고 시트·헤더·텍스트 서식을 맞춘다.
 * doGet 과 첫 DB 접근에서 자동 호출되며, 여러 번 실행해도 안전하다.
 */
function ensureDb_() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('SPREADSHEET_ID');
  if (existing && props.getProperty('DB_SCHEMA') === JSON.stringify(SCHEMA)) {
    return 'https://docs.google.com/spreadsheets/d/' + existing;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return setup();
  } finally {
    lock.releaseLock();
  }
}

/** 편집기에서 수동 실행도 가능 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('DADA Music DB');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  Object.keys(SCHEMA).forEach(function (name) {
    const cols = SCHEMA[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
  ['Sheet1', '시트1'].forEach(function (n) {
    const def = ss.getSheetByName(n);
    if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  });
  props.setProperty('DB_SCHEMA', JSON.stringify(SCHEMA));
  console.log('DB 준비 완료: ' + ss.getUrl());
  return ss.getUrl();
}

/** 동작 확인용: YouTube 고급 서비스 1 unit 호출 */
function checkYoutube() {
  const r = YouTube.Videos.list('snippet', { id: 'dvgZkm1xWPE' });
  console.log('YouTube 연결 OK: ' + (r.items[0] ? r.items[0].snippet.title : '결과 없음'));
}
