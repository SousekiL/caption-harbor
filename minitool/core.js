(function (root) {
  'use strict';
  function clean(text) {
    return String(text).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
  }
  function seconds(raw) {
    var parts = raw.replace(',', '.').split(':').map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some(function (x) { return !Number.isFinite(x) || x < 0; })) return null;
    if (parts[parts.length - 1] >= 60 || (parts.length === 3 && parts[1] >= 60)) return null;
    return parts.reduce(function (n, x) { return n * 60 + x; }, 0);
  }
  function parse(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('请先粘贴字幕或文字。');
    if (raw.length > 50000) throw new Error('内容超过 5 万字，请分成几份导入。');
    var text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var cues = [];
    function add(body, start) {
      body = clean(body);
      if (body) cues.push({ text: body, start: start });
    }
    if (text.indexOf('-->') !== -1) {
      text.split(/\n\s*\n/).forEach(function (block) {
        var lines = block.trim().split('\n');
        if (/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) return;
        var at = lines.findIndex(function (line) { return line.indexOf('-->') !== -1; });
        if (at < 0) return;
        var match = lines[at].match(/^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})(?:\s.*)?$/);
        if (!match) throw new Error('有一条字幕时间格式不正确，请检查后重试。');
        var start = seconds(match[1]), end = seconds(match[2]);
        if (start === null || end === null || end <= start) throw new Error('字幕结束时间必须晚于开始时间。');
        add(lines.slice(at + 1).join('\n'), start);
      });
    } else {
      text.split(/\n+/).forEach(function (line) {
        var match = line.match(/^\s*\[?((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s+(.+)$/);
        if (match) { var start = seconds(match[1]); if (start !== null) { add(match[2], start); return; } }
        (line.match(/[^.!?。！？]+[.!?。！？]*(?:["”’']|$)?/g) || []).forEach(function (part) { add(part, null); });
      });
    }
    if (!cues.length) throw new Error('没有找到可阅读的字幕，请检查内容。');
    if (cues.length > 800) throw new Error('超过 800 句，请分成几份导入。');
    return cues;
  }
  function clock(value) {
    if (value === null || !Number.isFinite(value)) return '';
    var n = Math.floor(value), h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, s = n % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }
  var demos = [
    { sentence: 'You do not need to learn everything at once.', term: 'at once', pos: 'phrase', ipa: '/ət wʌns/', zh: '同时；一下子。这里指一次学完所有内容。', en: 'All at the same time. Here, it means learning everything in one go.', example: 'Try one new habit instead of changing everything at once.', exampleZh: '先试着养成一个新习惯，不用一下子改变所有事情。', concept: '把学习任务拆小', conceptZh: '不用一次学完全部内容。先读懂一句字幕、记住一个表达，再看下一句。这就是这里说的分步学习。', conceptEn: 'You can learn a little at a time. Understand one caption and learn one expression, then move on to the next.' },
    { sentence: 'Small steps make a difference when you take them every day.', term: 'make a difference', pos: 'phrase', ipa: '', zh: '产生影响；带来改变。这里指每天做一点也有效果。', en: 'Have an effect or bring about a change. Here, small daily actions can matter.', example: 'Ten minutes of focused reading can make a difference.', exampleZh: '十分钟专注阅读也能带来改变。', concept: '每天做一点', conceptZh: '重点在“每天”。比如每天读几句字幕、复习一个词，把学习变成固定的小任务。', conceptEn: 'The key is doing it every day. Read a few captions or review one word as a small, regular task.' },
    { sentence: 'Choose one sentence that speaks to you.', term: 'speaks to you', pos: 'phrase', ipa: '', zh: '让你产生共鸣；触动你。这是比喻用法。', en: 'Feels personally meaningful or connects with your experience. This is a figurative use.', example: 'That story speaks to me because I had a similar experience.', exampleZh: '那个故事让我产生共鸣，因为我有过类似经历。', concept: '联系自己的经历', conceptZh: '选一句与你的经历或兴趣有关的话，记下为什么对它有感触。以后回看时，也能想起当时的理解。', conceptEn: 'Choose a sentence that relates to your life or interests. Note why it matters to you, so you can recall your interpretation later.' },
    { sentence: 'Write down what it means in your own words.', term: 'in your own words', pos: 'phrase', ipa: '', zh: '用自己的话表达，保留原来的意思。', en: 'Using your own way of expressing an idea while keeping its meaning.', example: 'Explain the main idea in your own words.', exampleZh: '用自己的话解释主要观点。', concept: '复述与改写', conceptZh: '先理解原句，再换一种说法。例如，读完一段字幕后，不看原文讲一遍大意，检查自己有没有读懂。', conceptEn: 'Understand the original, then explain it your own way. For example, put the captions aside and try to describe the main idea.' },
    { sentence: 'A useful word is easier to remember in context.', term: 'in context', pos: 'phrase', ipa: '/ɪn ˈkɒntekst/', zh: '结合语境；放在上下文中。通过周围的句子判断这个词在此处的意思。', en: 'With the surrounding words or situation taken into account, so you can see how an expression is being used.', example: 'Read the whole sentence to understand the word in context.', exampleZh: '读完整个句子，结合语境理解这个词。', concept: '语境学习', conceptZh: '同一个词可能有不同含义。把词与原句一起保存，可以回看它当时的用法。例如，“at once”在不同句子里可能强调“同时”，也可能强调“立即”。', conceptEn: 'A word can have more than one meaning. Keeping it with its source sentence helps you revisit the intended use. For example, “at once” can mean “simultaneously” or “immediately,” depending on context.' },
    { sentence: 'Return tomorrow, and keep your curiosity alive.', term: 'curiosity', pos: 'n.', ipa: '/ˌkjʊəriˈɒsəti/', zh: '好奇心；求知欲，想了解更多的兴趣。', en: 'A desire to know or learn more.', example: 'Her curiosity led her to ask another question.', exampleZh: '好奇心让她又问了一个问题。', concept: '记下还没弄懂的问题', conceptZh: '这句话是在鼓励你继续学习。可以先记下一个还没弄懂的问题，下次阅读时再查一查。', conceptEn: 'This is an invitation to keep learning. Write down one question you still have and look into it the next time you read.' }
  ];
  function demoFor(text) {
    var sentence = String(text || '').split('\n')[0].trim();
    return demos.find(function (entry) { return entry.sentence === sentence; }) || null;
  }
  function validate(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.docs) || !Array.isArray(value.words) || !Array.isArray(value.notes)) throw new Error('本地内容格式不正确');
    if (value.docs.length > 6 || value.words.length > 200 || value.notes.length > 200) throw new Error('本地内容超过上限');
    var ids = [];
    value.docs.forEach(function (d) {
      if (!d || typeof d.id !== 'string' || ids.includes(d.id) || typeof d.title !== 'string' || d.title.length > 80 || !Array.isArray(d.cues) || !d.cues.length || d.cues.length > 800 || !Array.isArray(d.read)) throw new Error('字幕记录无效');
      ids.push(d.id);
      var size = 0;
      d.cues.forEach(function (c) {
        if (!c || typeof c.text !== 'string' || !c.text.trim() || !(c.start === null || (Number.isFinite(c.start) && c.start >= 0))) throw new Error('字幕内容无效');
        size += c.text.length;
      });
      if (size > 50000 || d.read.some(function (n) { return !Number.isInteger(n) || n < 0 || n >= d.cues.length; })) throw new Error('阅读记录无效');
      d.read = Array.from(new Set(d.read));
    });
    value.words.concat(value.notes).forEach(function (r) {
      if (!r || typeof r.id !== 'string' || typeof r.docId !== 'string' || typeof r.title !== 'string' || typeof r.context !== 'string' || typeof r.text !== 'string' || r.text.length > 2000 || r.context.length > 50000 || typeof r.created !== 'string') throw new Error('收藏记录无效');
      ['meaning', 'pronunciation', 'partOfSpeech', 'example'].forEach(function (key) {
        if (r[key] !== undefined && typeof r[key] !== 'string') throw new Error('收藏记录无效');
      });
      if ((r.meaning || '').length > 1000 || (r.pronunciation || '').length > 80 || (r.partOfSpeech || '').length > 40 || (r.example || '').length > 1000) throw new Error('收藏记录无效');
      r.meaning = r.meaning || '';
      r.pronunciation = r.pronunciation || '';
      r.partOfSpeech = r.partOfSpeech || '';
      r.example = r.example || '';
    });
    return value;
  }
  var api = { parse: parse, clock: clock, validate: validate, demoFor: demoFor };
  root.HarborMini = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
