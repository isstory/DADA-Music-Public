/**
 * YouTube Data API 사용량 추정 (태평양 시간 기준 일자). 실제 값은 Cloud Console에서 확인.
 * 실패한 호출도 할당량을 소모하므로 호출 전에 기록한다.
 */
const QUOTA_COST = {
  'search.list': 100,
  'videos.list': 1,
  'videos.getRating': 1,
  'playlists.list': 1,
  'playlists.insert': 50,
  'playlists.delete': 50,
  'playlists.update': 50,
  'playlistItems.list': 1,
  'playlistItems.insert': 50,
  'playlistItems.update': 50,
  'playlistItems.delete': 50,
};
const QUOTA_LIMIT = 10000;

const Quota = {
  day_() {
    return Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  },

  call(method, fn) {
    const props = PropertiesService.getScriptProperties();
    const key = 'quota_' + this.day_();
    const cur = JSON.parse(props.getProperty(key) || '{"units":0,"calls":{}}');
    cur.units += QUOTA_COST[method] || 0;
    cur.calls[method] = (cur.calls[method] || 0) + 1;
    props.setProperty(key, JSON.stringify(cur));
    return fn();
  },

  today() {
    try {
      const raw = PropertiesService.getScriptProperties().getProperty('quota_' + this.day_());
      const cur = raw ? JSON.parse(raw) : { units: 0 };
      return { used: cur.units, limit: QUOTA_LIMIT, day: this.day_() };
    } catch (e) {
      return { used: 0, limit: QUOTA_LIMIT, day: '' };
    }
  },
};
