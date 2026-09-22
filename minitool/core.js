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
    });
    return value;
  }
  var api = { parse: parse, clock: clock, validate: validate };
  root.HarborMini = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
