/**
 * Gemini 추천. 키는 Local.js(GEMINI_API_KEY, 깃 제외) 또는 스크립트 속성.
 * 모델이 곡을 지어낼 수 있으므로, 결과는 반드시 YouTube 실제 검색으로 확인한 뒤에만 쓴다 (Radio.js).
 */
const REGION_RULES = {
  kr: '한국 아티스트의 곡만 (K-pop, 발라드, 인디, 힙합, R&B, 록 등 장르 무관). 해외 아티스트 금지.',
  intl: '한국이 아닌 해외 아티스트의 곡만 (팝, 록, R&B, 힙합, 인디, J-pop 등). 한국 아티스트 금지.',
  mix: '한국 아티스트 곡과 해외 아티스트 곡을 대략 절반씩 섞어서.',
};

const Ai = {
  recommend(seeds, disliked, region, count) {
    const key = Config.get('GEMINI_API_KEY');
    const model = configOr_('GEMINI_MODEL', 'gemini-2.5-flash');
    const prompt = [
      '당신은 취향을 정확히 읽는 라디오 DJ입니다. 아래 "좋아하는 노래"와 분위기·장르·시대·음색이 비슷한 곡으로 라디오 목록을 만드세요.',
      '',
      '좋아하는 노래:',
      seeds.map(function (s) { return '- ' + s.artist + ' - ' + s.title; }).join('\n'),
      disliked.length ? '\n싫어하는 노래 (이런 느낌은 피하기):\n' + disliked.map(function (s) { return '- ' + s.artist + ' - ' + s.title; }).join('\n') : '',
      '',
      '조건:',
      '- 지역: ' + REGION_RULES[region],
      '- 정확히 ' + count + '곡. 실제로 발매되어 YouTube에서 찾을 수 있는 곡만. 존재가 확실하지 않은 곡은 넣지 말 것.',
      '- 위 "좋아하는 노래"에 있는 곡은 제외.',
      '- 같은 아티스트는 최대 2곡. 대략 60%는 잘 알려진 곡, 40%는 덜 알려졌지만 취향에 맞을 곡.',
      '- artist 와 title 은 YouTube에 올라간 공식 표기 그대로 (예: "IU", "아이유" 처럼 흔히 쓰는 이름). 피처링·괄호 설명은 빼기.',
      '- reason 은 이 곡을 고른 이유를 한국어 25자 이내로 (예: "Blueming 같은 밝은 기타 팝").',
      '- origin 은 한국 아티스트면 KR, 아니면 INTL.',
      '- note 는 이 라디오 전체를 소개하는 한국어 한 문장 (50자 이내).',
    ].join('\n');

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            note: { type: 'STRING' },
            songs: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  artist: { type: 'STRING' },
                  title: { type: 'STRING' },
                  reason: { type: 'STRING' },
                  origin: { type: 'STRING', enum: ['KR', 'INTL'] },
                },
                required: ['artist', 'title', 'reason', 'origin'],
              },
            },
          },
          required: ['note', 'songs'],
        },
      },
    };

    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code === 429) throw new ApiError('ai_busy', 'AI 사용량이 잠시 초과됐습니다. 1분 뒤 다시 시도하세요.');
    if (code === 400 || code === 403) throw new ApiError('config', 'Gemini API 키를 확인하세요. (' + code + ')');
    if (code === 404) throw new ApiError('config', 'Gemini 모델(' + model + ')을 찾을 수 없습니다. GEMINI_MODEL 설정을 확인하세요.');
    if (code !== 200) throw new ApiError('ai_error', 'AI 추천 요청이 실패했습니다 (' + code + '). 잠시 후 다시 시도하세요.');

    const json = JSON.parse(text);
    const part = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
    const out = part ? part.map(function (p) { return p.text || ''; }).join('') : '';
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch (e) {
      throw new ApiError('ai_error', 'AI 응답을 해석하지 못했습니다. 다시 시도하세요.');
    }
    return { note: String(parsed.note || ''), songs: (parsed.songs || []).filter(function (s) { return s.artist && s.title; }), model: model };
  },
};
