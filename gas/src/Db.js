/**
 * Google 시트를 테이블처럼 쓰는 작은 저장소.
 * 2인 사용 규모(수천 행)를 전제로 "읽기 = 시트 전체 읽기", "쓰기 = 스크립트 잠금 안에서" 로 단순하게 유지한다.
 * 모든 셀은 일반 텍스트 서식(@)이며, =,+,-,@ 로 시작하는 문자열은 수식으로 해석되지 않게 이스케이프한다.
 */
const SCHEMA = {
  users: ['key', 'email', 'name', 'picture', 'lastSeenAt'],
  tracks: ['videoId', 'title', 'artist', 'channel', 'kind', 'thumbnail', 'durationSec', 'cachedAt'],
  search_cache: ['query', 'videoIds', 'cachedAt'],
  reactions: ['userKey', 'videoId', 'reaction', 'updatedAt'],
  playlists: ['id', 'ownerKey', 'title', 'kind', 'createdAt', 'updatedAt'],
  playlist_items: ['playlistId', 'videoId', 'position', 'addedAt'],
  youtube_sync: ['playlistId', 'ownerKey', 'ytPlaylistId', 'syncedIds', 'failedIds', 'syncedAt', 'status', 'error'],
  radio_profiles: ['userKey', 'seedIds', 'region', 'size', 'playlistId', 'note', 'generatedAt', 'updatedAt'],
  radio_reasons: ['playlistId', 'videoId', 'reason'],
};

const Db = {
  _ss: null,
  _cache: {},

  ss_() {
    if (!this._ss) {
      ensureDb_();
      this._ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
    }
    return this._ss;
  },

  sheet_(name) {
    const sh = this.ss_().getSheetByName(name);
    if (!sh) throw new ApiError('config', '시트 없음: ' + name + ' (setup() 을 다시 실행하세요)');
    return sh;
  },

  /** 전체 행을 객체 배열로 (요청 1회 안에서는 캐시) */
  all(name) {
    if (this._cache[name]) return this._cache[name];
    const cols = SCHEMA[name];
    const sh = this.sheet_(name);
    const last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, cols.length).getValues();
    const out = rows.map(function (r) {
      const o = {};
      cols.forEach(function (k, j) { o[k] = r[j] === '' ? '' : String(r[j]); });
      return o;
    });
    this._cache[name] = out;
    return out;
  },

  filter(name, pred) { return this.all(name).filter(pred); },
  find(name, pred) { return this.all(name).find(pred) || null; },

  /** 행 추가 */
  insert(name, objs) {
    if (!objs.length) return;
    const cols = SCHEMA[name];
    const sh = this.sheet_(name);
    const values = objs.map(function (o) { return cols.map(function (k) { return Db.cell_(o[k]); }); });
    sh.getRange(sh.getLastRow() + 1, 1, values.length, cols.length).setValues(values);
    delete this._cache[name];
  },

  /** 테이블 전체를 주어진 행들로 교체 (수정·삭제·재정렬에 공통 사용) */
  rewrite(name, objs) {
    const cols = SCHEMA[name];
    const sh = this.sheet_(name);
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
    if (objs.length) {
      const values = objs.map(function (o) { return cols.map(function (k) { return Db.cell_(o[k]); }); });
      sh.getRange(2, 1, values.length, cols.length).setValues(values);
    }
    delete this._cache[name];
  },

  /** pred에 맞는 행을 mutate로 바꾸고(null 반환 시 삭제) 전체 재기록 */
  mutate(name, pred, mutate) {
    let changed = 0;
    const next = [];
    this.all(name).forEach(function (row) {
      if (!pred(row)) return next.push(row);
      changed++;
      const r = mutate(Object.assign({}, row));
      if (r) next.push(r);
    });
    if (changed) this.rewrite(name, next);
    return changed;
  },

  cell_(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  },
};

/** 쓰기 작업은 동시 요청 충돌 방지를 위해 스크립트 잠금 안에서 실행 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new ApiError('busy', '다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
  try {
    Db._cache = {};
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

const nowIso_ = function () { return new Date().toISOString(); };
