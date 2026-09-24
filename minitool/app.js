(function () {
  'use strict';
  var Core = window.HarborMini, KEY = 'caption-harbor-mini-v1', PAGE = 20;
  var view = 'read', query = '', page = 0, activeCapture = null, activeLookup = null, returnFocus = null, toastTimer, searchTimer, sequence = 0;
  function $(id) { return document.getElementById(id); }
  function id() { sequence += 1; return Date.now().toString(36) + '-' + sequence + '-' + Math.random().toString(36).slice(2, 8); }
  function initial() {
    return { version: 1, active: 'welcome', words: [], notes: [], docs: [{ id: 'welcome', title: '学习方法 · 示例字幕', read: [], cues: [
      { start: 0, text: 'You do not need to learn everything at once.\n不必一次学会所有事情。' },
      { start: 5, text: 'Small steps make a difference when you take them every day.\n每天做一点，也能带来改变。' },
      { start: 11, text: 'Choose one sentence that speaks to you.\n选一句让你有所感触的话。' },
      { start: 16, text: 'Write down what it means in your own words.\n用自己的话写下你对它的理解。' },
      { start: 22, text: 'A useful word is easier to remember in context.\n放在语境里的词，更容易记住。' },
      { start: 28, text: 'Return tomorrow, and keep your curiosity alive.\n明天继续，保持好奇心。' }
    ] }] };
  }
  function warn(text) { $('storage-warning').textContent = text; $('storage-warning').hidden = false; }
  var state = initial();
  try {
    var stored = localStorage.getItem(KEY);
    if (stored) {
      if (stored.length > 2000000) throw new Error('too large');
      state = Core.validate(JSON.parse(stored));
    }
  } catch (e) { warn('读取本地记录失败，暂时显示示例。'); }
  function current() { return state.docs.find(function (d) { return d.id === state.active; }) || state.docs[0] || null; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { warn('本地空间不足或不可用。当前修改仅在本次打开期间保留，请及时整理摘录。'); }
  }
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').hidden = true; }, 2500); }
  function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
  function highlight(node, text) {
    var start = 0, lower = text.toLowerCase(), needle = query.toLowerCase(), at;
    if (!needle) { node.textContent = text; return; }
    while ((at = lower.indexOf(needle, start)) !== -1) {
      node.appendChild(document.createTextNode(text.slice(start, at)));
      node.appendChild(el('mark', '', text.slice(at, at + needle.length)));
      start = at + needle.length;
    }
    node.appendChild(document.createTextNode(text.slice(start)));
  }
  function action(label, type, index, cls) { var b = el('button', cls || '', label); b.type = 'button'; b.dataset.action = type; b.dataset.index = String(index); return b; }
  function captionText(node, text, demo, index) {
    if (!demo || query) { highlight(node, text); return; }
    var at = text.indexOf(demo.term);
    if (at < 0) { node.textContent = text; return; }
    node.appendChild(document.createTextNode(text.slice(0, at)));
    var term = action(demo.term, 'lookup-word', index, 'demo-term');
    term.setAttribute('aria-label', '查词义：' + demo.term);
    node.appendChild(term);
    node.appendChild(document.createTextNode(text.slice(at + demo.term.length)));
  }
  function records() {
    var doc = current();
    var source = view === 'read' ? (doc ? doc.cues : []) : state[view].slice().reverse();
    return source.map(function (item, index) { return { item: item, index: index }; }).filter(function (entry) {
      var r = entry.item;
      return (r.text + ' ' + (r.context || '') + ' ' + (r.meaning || '') + ' ' + (r.title || '')).toLowerCase().indexOf(query.toLowerCase()) !== -1;
    });
  }
  function render() {
    var doc = current();
    if (doc) state.active = doc.id;
    $('document-select').textContent = '';
    state.docs.forEach(function (d) { var o = el('option', '', d.title); o.value = d.id; $('document-select').appendChild(o); });
    if (doc) $('document-select').value = doc.id;
    $('delete-doc').disabled = !doc;
    $('cue-count').textContent = doc ? doc.cues.length : '0';
    $('read-count').textContent = doc ? doc.read.length : '0';
    $('saved-count').textContent = state.words.length + state.notes.length;
    $('progress-fill').style.width = (doc ? 100 * doc.read.length / doc.cues.length : 0) + '%';
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) { var on = button.dataset.view === view; button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); });
    $('list-title').textContent = { read: '字幕', words: '生词本', notes: '笔记' }[view];
    $('demo-hint').hidden = view !== 'read' || !doc || !doc.cues.some(function(cue) { return !!Core.demoFor(cue.text); });
    $('search').placeholder = view === 'read' ? '搜索字幕' : '搜索全部' + (view === 'words' ? '生词' : '笔记');
    var rows = records(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    $('result-count').textContent = rows.length + (view === 'read' ? ' 句' : ' 条');
    $('page-label').textContent = (page + 1) + ' / ' + pages;
    $('previous-page').disabled = page === 0; $('next-page').disabled = page + 1 >= pages;
    $('list').textContent = '';
    if (!rows.length) $('list').appendChild(el('div', 'empty', query ? '没有找到匹配内容。' : view === 'read' ? '还没有字幕，点击上方“粘贴字幕”添加。' : view === 'words' ? '还没有生词。可在字幕下点击“收藏生词”。' : '还没有笔记。可在字幕下点击“记笔记”。'));
    var fragment = document.createDocumentFragment();
    rows.slice(page * PAGE, (page + 1) * PAGE).forEach(function (entry) {
      var r = entry.item, index = entry.index, isRead = view === 'read' && doc.read.includes(index);
      var card = el('article', 'card' + (isRead ? ' is-read' : '')); card.dataset.cue = index;
      var top = el('div', 'card-top');
      top.appendChild(el('span', '', view === 'read' ? String(index + 1).padStart(2, '0') + ' / ' + String(doc.cues.length).padStart(2, '0') : r.title));
      top.appendChild(el('span', '', Core.clock(r.start))); card.appendChild(top);
      var demo = view === 'read' ? Core.demoFor(r.text) : null;
      var text = el(view === 'words' ? 'h3' : 'p', view === 'words' ? 'card-title' : 'card-text');
      if (view === 'read') captionText(text, r.text, demo, index); else highlight(text, r.text || '原句摘录');
      card.appendChild(text);
      if (demo) {
        var lookupActions = el('div', 'lookup-actions');
        lookupActions.appendChild(action('查生词含义', 'lookup-word', index));
        lookupActions.appendChild(action('概念解释', 'lookup-concept', index));
        card.appendChild(lookupActions);
      }
      if (view !== 'read') {
        if (view === 'words' && (r.pronunciation || r.partOfSpeech)) {
          var meta = el('div', 'dictionary-meta');
          if (r.partOfSpeech) meta.appendChild(el('strong', 'dictionary-pos', r.partOfSpeech));
          if (r.pronunciation) meta.appendChild(el('span', 'dictionary-pronunciation', r.pronunciation));
          card.appendChild(meta);
        }
        if (r.meaning) { var meaning = el('p', 'card-meaning'); highlight(meaning, r.meaning); card.appendChild(meaning); }
        if (view === 'words' && r.example) {
          var example = el('div', 'card-example');
          example.appendChild(el('span', 'card-example-label', r.example === r.context ? '原字幕例句' : '我的例句'));
          var exampleText = el('p', 'card-example-text'); highlight(exampleText, r.example); example.appendChild(exampleText);
          card.appendChild(example);
        }
        var context = el('p', 'card-context'); highlight(context, r.context); card.appendChild(context);
      }
      var actions = el('div', 'card-actions');
      if (view === 'read') { actions.appendChild(action('收藏生词', 'word', index)); actions.appendChild(action('记笔记', 'note', index)); var readButton = action(isRead ? '已读 ✓' : '标记已读', 'read', index, 'read-action'); readButton.setAttribute('aria-pressed', String(isRead)); actions.appendChild(readButton); }
      else { actions.appendChild(action('回看原句', 'source', r.id)); actions.appendChild(action('移除', 'remove', r.id, 'read-action')); }
      card.appendChild(actions); fragment.appendChild(card);
    });
    $('list').appendChild(fragment);
  }
  function openModal(kind, title) {
    returnFocus = document.activeElement;
    ['import', 'capture', 'export', 'about', 'lookup'].forEach(function (name) { $(name + '-panel').hidden = name !== kind; });
    $('dialog-title').textContent = title; $('dialog-error').textContent = ''; $('modal').hidden = false;
    document.body.style.overflow = 'hidden';
    document.querySelector('.sheet').focus();
  }
  function closeModal() { $('modal').hidden = true; activeCapture = null; activeLookup = null; var selection = window.getSelection(); if (selection) selection.removeAllRanges(); document.body.style.overflow = ''; if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus(); }
  function showLookup(kind, index) {
    var doc = current(), cue = doc && doc.cues[index], demo = cue && Core.demoFor(cue.text);
    if (!demo) return;
    activeLookup = { kind: kind, index: index, docId: doc.id, title: doc.title, context: cue.text, start: cue.start, demo: demo };
    openModal('lookup', kind === 'word' ? '查生词含义' : '概念解释');
    renderLookup();
  }
  function renderLookup() {
    if (!activeLookup) return;
    var demo = activeLookup.demo, english = state.demoLanguage === 'en', root = $('lookup-result');
    root.textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-explanation]'), function(button) { button.setAttribute('aria-pressed', String(button.dataset.explanation === (english ? 'en' : 'zh'))); });
    if (activeLookup.kind === 'word') {
      root.appendChild(el('h3', 'lookup-headword', demo.term));
      var grammar = el('div', 'dictionary-meta');
      grammar.appendChild(el('strong', 'dictionary-pos', demo.pos));
      if (demo.ipa) grammar.appendChild(el('span', 'dictionary-pronunciation', demo.ipa));
      root.appendChild(grammar);
      root.appendChild(el('p', 'lookup-definition', english ? demo.en : demo.zh));
      root.appendChild(el('h4', 'lookup-subhead', english ? 'From the sample subtitles' : '示例字幕原句'));
      root.appendChild(el('blockquote', '', demo.sentence));
      root.appendChild(el('h4', 'lookup-subhead', english ? 'Additional example' : '补充例句'));
      root.appendChild(el('p', 'lookup-example', demo.example));
      if (!english) root.appendChild(el('p', 'lookup-translation', demo.exampleZh));
    } else {
      root.appendChild(el('h3', 'lookup-headword', english ? 'Understand the idea' : demo.concept));
      root.appendChild(el('blockquote', '', demo.sentence));
      root.appendChild(el('h4', 'lookup-subhead', english ? 'What this means' : '这句话在说什么'));
      root.appendChild(el('p', 'lookup-definition', english ? demo.conceptEn : demo.conceptZh));
    }
    $('lookup-save').textContent = activeLookup.kind === 'word' ? '收藏生词' : '保存概念笔记';
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-explanation]'), function(button) {
    button.addEventListener('click', function() { state.demoLanguage = button.dataset.explanation; save(); renderLookup(); });
  });
  $('lookup-save').addEventListener('click', function() {
    if (!activeLookup) return;
    var selected = activeLookup, demo = selected.demo, isWord = selected.kind === 'word', english = state.demoLanguage === 'en';
    var rows = isWord ? state.words : state.notes;
    var meaning = english ? demo.en : demo.zh;
    var note = (english ? 'Concept: ' + demo.term : '概念：' + demo.concept) + '\n' + (english ? demo.conceptEn : demo.conceptZh);
    var existing = rows.find(function(r) { return r.docId === selected.docId && r.index === selected.index && r.text === (isWord ? demo.term : note); });
    if (!existing && rows.length >= 200) { $('dialog-error').textContent = '已达到 200 条，请先整理并移除部分记录。'; return; }
    if (!existing) rows.push({id:id(),docId:selected.docId,title:selected.title,index:selected.index,context:selected.context,start:selected.start,text:isWord ? demo.term : note,meaning:isWord ? meaning : '',pronunciation:isWord ? demo.ipa : '',partOfSpeech:isWord ? demo.pos : '',example:isWord ? demo.example : '',created:new Date().toISOString()});
    save(); closeModal(); render(); toast(existing ? '已收藏' : isWord ? '已收藏生词和例句' : '已保存概念笔记');
  });
  function capture(type, index, card) {
    var doc = current(), cue = doc && doc.cues[index]; if (!cue) return;
    var selection = window.getSelection(), selected = '';
    if (selection && selection.rangeCount && card.contains(selection.getRangeAt(0).commonAncestorContainer)) selected = selection.toString().trim().slice(0, 100);
    activeCapture = { type: type, docId: doc.id, title: doc.title, index: index, context: cue.text, start: cue.start };
    openModal('capture', type === 'word' ? '收藏生词' : '添加笔记');
    $('capture-context').textContent = cue.text;
    $('word-fields').hidden = type !== 'word'; $('note-fields').hidden = type !== 'note';
    $('word-input').value = selected;
    $('word-pronunciation').value = '';
    $('word-part-of-speech').value = '';
    $('word-meaning').value = '';
    $('word-example').value = cue.text.slice(0, 1000);
    $('note-input').value = '';
    (type === 'word' ? $('word-input') : $('note-input')).focus();
  }
  $('list').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]'); if (!button) return;
    var type = button.dataset.action, index = button.dataset.index, doc = current();
    if (type === 'lookup-word' || type === 'lookup-concept') { showLookup(type === 'lookup-word' ? 'word' : 'concept', Number(index)); return; }
    if (type === 'word' || type === 'note') { capture(type, Number(index), button.closest('.card')); return; }
    if (type === 'read' && doc) { var n = Number(index), at = doc.read.indexOf(n); if (at < 0) doc.read.push(n); else doc.read.splice(at, 1); save(); render(); return; }
    var r = state[view].find(function (item) { return item.id === index; }); if (!r) return;
    if (type === 'remove') { if (!confirm('移除这条' + (view === 'words' ? '生词' : '笔记') + '？')) return; state[view] = state[view].filter(function (item) { return item.id !== index; }); save(); render(); }
    if (type === 'source') { var found = state.docs.find(function (d) { return d.id === r.docId; }); if (!found) { toast('原字幕已移除，收藏的原句仍保留。'); return; } state.active = found.id; view = 'read'; query = ''; $('search').value = ''; page = Math.floor(r.index / PAGE); save(); render(); var row = document.querySelector('[data-cue="' + r.index + '"]'); if (row) row.scrollIntoView(); }
  });
  $('capture-submit').addEventListener('click', function () {
    if (!activeCapture) return;
    var word = activeCapture.type === 'word', text = (word ? $('word-input') : $('note-input')).value.trim();
    if (word && !text) { $('dialog-error').textContent = '请填写要收藏的单词或短语。'; return; }
    var collection = word ? state.words : state.notes;
    var existing = word && collection.find(function (r) { return r.docId === activeCapture.docId && r.index === activeCapture.index && r.text.toLowerCase() === text.toLowerCase(); });
    if (!existing && collection.length >= 200) { $('dialog-error').textContent = '已达到 200 条，请先整理并移除部分记录。'; return; }
    if (existing) {
      existing.meaning = $('word-meaning').value.trim();
      existing.pronunciation = $('word-pronunciation').value.trim();
      existing.partOfSpeech = $('word-part-of-speech').value.trim();
      existing.example = $('word-example').value.trim();
    }
    else collection.push({ id: id(), docId: activeCapture.docId, title: activeCapture.title, index: activeCapture.index, context: activeCapture.context, start: activeCapture.start, text: text, meaning: word ? $('word-meaning').value.trim() : '', pronunciation: word ? $('word-pronunciation').value.trim() : '', partOfSpeech: word ? $('word-part-of-speech').value.trim() : '', example: word ? $('word-example').value.trim() : '', created: new Date().toISOString() });
    save(); closeModal(); render(); toast(existing ? '已更新这个词的释义' : word ? '生词已收藏' : '笔记已保存');
  });
  $('import-open').addEventListener('click', function () { openModal('import', '导入字幕'); $('import-title').focus(); });
  $('demo-open').addEventListener('click', function() {
    var demoDoc = state.docs.find(function(d) { return d.cues.some(function(cue) { return !!Core.demoFor(cue.text); }); });
    if (!demoDoc) {
      if (state.docs.length >= 6) { toast('请先移除一份字幕，再添加示例；已收藏的内容会保留。'); return; }
      demoDoc = initial().docs[0]; demoDoc.id = id(); state.docs.push(demoDoc);
    }
    state.active = demoDoc.id; view = 'read'; query = ''; page = 0; $('search').value = '';
    save(); render(); showLookup('word', demoDoc.cues.findIndex(function(cue) { return !!Core.demoFor(cue.text); }));
  });
  $('import-submit').addEventListener('click', function () {
    try {
      if (state.docs.length >= 6) throw new Error('已保存 6 份字幕，请先移除一份；它的生词和笔记会保留。');
      var cues = Core.parse($('import-text').value);
      var doc = { id: id(), title: $('import-title').value.trim() || '未命名字幕', cues: cues, read: [] };
      state.docs.push(doc); state.active = doc.id; view = 'read'; page = 0; query = ''; $('search').value = '';
      save(); closeModal(); $('import-text').value = ''; $('import-title').value = ''; render(); toast('已导入 ' + cues.length + ' 句字幕');
    } catch (e) { $('dialog-error').textContent = e.message; }
  });
  $('document-select').addEventListener('change', function () { state.active = this.value; page = 0; save(); render(); });
  $('delete-doc').addEventListener('click', function () { var doc = current(); if (!doc || !confirm('移除“' + doc.title + '”？已收藏的生词和笔记会保留。')) return; state.docs = state.docs.filter(function (d) { return d.id !== doc.id; }); state.active = state.docs[0] ? state.docs[0].id : ''; page = 0; save(); render(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) { button.addEventListener('click', function () { view = button.dataset.view; query = ''; page = 0; $('search').value = ''; clearTimeout(searchTimer); render(); }); });
  $('search').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { query = $('search').value.trim().slice(0, 150); page = 0; render(); }, 160); });
  $('previous-page').addEventListener('click', function () { page -= 1; render(); });
  $('next-page').addEventListener('click', function () { page += 1; render(); });
  $('about-open').addEventListener('click', function () { openModal('about', '关于字幕小港'); });
  $('select-store-url').addEventListener('click', function () { $('store-url').focus(); $('store-url').select(); toast('商店地址已选中，请手动复制后在电脑浏览器打开。'); });
  $('close-modal').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if ($('modal').hidden) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call($('modal').querySelectorAll('button,input,textarea,select,[tabindex="0"]'), function (node) { return !node.disabled && node.getClientRects().length; });
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement.className === 'sheet')) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $('export-open').addEventListener('click', function () {
    var lines = ['字幕小港 · 生词和笔记', ''];
    [['words', '生词'], ['notes', '笔记']].forEach(function (group) {
      lines.push('【' + group[1] + '】');
      state[group[0]].forEach(function (r) {
        lines.push(r.text || '原句摘录');
        if (r.pronunciation) lines.push('音标：' + r.pronunciation);
        if (r.partOfSpeech) lines.push('词性：' + r.partOfSpeech);
        if (r.meaning) lines.push('释义：' + r.meaning);
        if (r.example) lines.push('例句：' + r.example);
        lines.push('原句：' + r.context, '来源：' + r.title + (Core.clock(r.start) ? ' · ' + Core.clock(r.start) : ''), '');
      });
    });
    if (!state.words.length && !state.notes.length) { var doc = current(); lines.push('还没有生词或笔记。下面是当前字幕：', doc ? doc.title : '暂无字幕'); if (doc) doc.cues.forEach(function (cue) { lines.push((Core.clock(cue.start) ? '[' + Core.clock(cue.start) + '] ' : '') + cue.text); }); }
    $('export-text').value = lines.join('\n'); openModal('export', '查看摘录');
  });
  $('select-export').addEventListener('click', function () { $('export-text').focus(); $('export-text').select(); toast('文字已选中，请手动复制。'); });
  function viewport() { var vv = window.visualViewport; $('modal').style.height = (vv ? vv.height : window.innerHeight) + 'px'; }
  window.addEventListener('resize', viewport);
  if (window.visualViewport && window.visualViewport.addEventListener) window.visualViewport.addEventListener('resize', viewport);
  $("license-text").textContent = "MIT License\n\nCopyright (c) 2026 Zara Zhang\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n";
  viewport(); render();
})();
