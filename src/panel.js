/*
 * Figure Suite — the drawing panel: source editor, live preview, exports.
 */

class TemplatePicker extends FuzzySuggestModal {
  constructor(app, onPick) {
    super(app);
    this.onPick = onPick;
    this.append = false;
    this.setPlaceholder('Pick a template…');
    this.setInstructions([
      { command: '↵', purpose: 'replace the source (undo with Mod+Z)' },
      { command: 'shift ↵', purpose: 'append as another block' },
    ]);
    this.scope.register(['Shift'], 'Enter', (evt) => {
      this.append = true;
      if (this.chooser && this.chooser.useSelectedItem) this.chooser.useSelectedItem(evt);
      return false;
    });
  }

  getItems() { return TEMPLATES; }

  getItemText(t) { return `${t.group} › ${t.name}`; }

  onChooseItem(t, evt) { this.onPick(t, this.append || !!(evt && evt.shiftKey)); }
}

/** Obsidian's interface language → 'zh' or 'en' for the syntax reference. */
function uiLanguage() {
  try {
    const l = window.localStorage.getItem('language') || '';
    return l.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) {
    return 'en';
  }
}

/** Append text with `code` spans to el. */
function richText(el, text) {
  String(text).split('`').forEach((part, k) => {
    if (!part) return;
    if (k % 2) el.createEl('code', { text: part });
    else el.appendText(part);
  });
}

class FigureModal extends Modal {
  /**
   * opts: { source, target: { editor, file } | null, editing: { file } | null }
   */
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.target = opts.target || null;
    this.editing = opts.editing || null;
    this.initial = opts.source ?? '';
    this.restored = !!opts.restored;
    this.zoom = 1;
    this.result = null;
    this.dirty = false;
    this.finished = false;
  }

  get settings() { return this.plugin.settings; }

  onOpen() {
    const { modalEl, contentEl } = this;
    modalEl.addClass('fs-modal');
    contentEl.empty();
    this.titleEl.setText(this.editing ? `Edit figure — ${this.editing.file.name}` : this.restored ? 'New figure (draft restored)' : 'New figure');

    // toolbar
    const bar = contentEl.createDiv('fs-toolbar');
    this.button(bar, 'layout-template', 'Templates', () => new TemplatePicker(this.app, (t, append) => this.insertTemplate(t, append)).open());
    this.button(bar, 'file-plus', 'New (clear)', () => this.setSource('', true));
    this.helpBtn = this.button(bar, 'circle-help', 'Syntax help', () => this.toggleHelp());
    bar.createDiv('fs-spacer');
    this.button(bar, 'zoom-out', 'Zoom out', () => this.setZoom(this.zoom / 1.25));
    this.zoomLabel = bar.createEl('button', { cls: 'fs-zoom-label', text: '100%', attr: { 'aria-label': 'Reset zoom' } });
    this.zoomLabel.onclick = () => this.setZoom(1);
    this.button(bar, 'zoom-in', 'Zoom in', () => this.setZoom(this.zoom * 1.25));
    this.button(bar, 'maximize', 'Fit', () => this.fit());

    // main area
    const main = contentEl.createDiv('fs-main');
    const left = main.createDiv('fs-left');
    this.textarea = left.createEl('textarea', {
      cls: 'fs-source',
      attr: {
        spellcheck: 'false',
        autocapitalize: 'off',
        autocomplete: 'off',
        placeholder: 'Pick a template (first toolbar button), or type e.g.\n\ntree\n  15\n    6\n    18\n\narray A\n  5 2 4 6 1 3\n  shade: 2',
      },
    });
    this.errorsEl = left.createDiv('fs-errors');
    const right = main.createDiv('fs-right');
    this.previewEl = right.createDiv('fs-preview');
    if (this.settings.background === 'transparent') this.previewEl.addClass('fs-transparent');
    this.paper = this.previewEl.createDiv('fs-paper');
    this.statusEl = right.createDiv('fs-status');
    this.helpEl = main.createDiv('fs-help');
    this.helpEl.hide();

    // footer
    const foot = contentEl.createDiv('fs-footer');
    const nameWrap = foot.createDiv('fs-name');
    this.nameInput = nameWrap.createEl('input', { type: 'text', cls: 'fs-name-input' });
    this.nameInput.value = this.editing ? this.editing.file.basename : this.defaultName();
    this.extLabel = nameWrap.createSpan({ cls: 'fs-ext' });
    if (this.editing) this.nameInput.disabled = true;
    this.formatSel = foot.createEl('select', { cls: 'dropdown' });
    [['png', 'PNG'], ['svg', 'SVG']].forEach(([v, t]) => this.formatSel.createEl('option', { value: v, text: t }));
    this.formatSel.value = this.editing ? this.editing.file.extension : this.settings.format;
    if (this.editing) this.formatSel.disabled = true;
    this.scaleSel = foot.createEl('select', { cls: 'dropdown' });
    [1, 2, 3, 4].forEach((v) => this.scaleSel.createEl('option', { value: String(v), text: `${v}×` }));
    const scale = this.editing && this.editing.scale ? Math.min(4, Math.max(1, this.editing.scale)) : this.settings.pngScale;
    this.scaleSel.value = String(scale);
    const syncFormat = () => {
      this.extLabel.setText(`.${this.formatSel.value}`);
      this.scaleSel.toggle(this.formatSel.value === 'png');
    };
    this.formatSel.onchange = syncFormat;
    syncFormat();
    foot.createDiv('fs-spacer');
    this.textBtn(foot, 'Copy PNG', () => this.copy('png'));
    this.textBtn(foot, 'Copy SVG', () => this.copy('svg'));
    const canInsert = this.editing || (this.target && this.target.editor);
    // without an editor the primary button already saves (and copies the link)
    if (!this.editing && canInsert) this.textBtn(foot, 'Save file', () => this.save(false));
    this.primary = this.textBtn(foot, this.editing ? 'Update' : canInsert ? 'Insert' : 'Save & copy link', () => (this.editing ? this.update() : this.save(!!canInsert)), true);
    this.primary.setAttr('aria-label', 'Mod+Enter');

    this.wireEditor();
    this.wirePreviewDrag();
    this.textarea.value = this.initial;
    this.render();
    setTimeout(() => this.textarea.focus(), 30);
    // fit once the modal has its final size
    this.resizeObs = new ResizeObserver(() => {
      if (this.userZoomed || !this.previewEl.clientWidth) return;
      this.fit(true);
    });
    this.resizeObs.observe(this.previewEl);
  }

  /* ---------- small UI helpers ---------- */

  button(parent, icon, label, onClick) {
    const b = parent.createEl('button', { cls: 'clickable-icon fs-icon-btn', attr: { 'aria-label': label } });
    setIcon(b, icon);
    if (!b.querySelector('svg')) b.setText(label); // icon name unknown to this Obsidian build
    b.onclick = onClick;
    return b;
  }

  textBtn(parent, text, onClick, cta = false) {
    const b = parent.createEl('button', { text, cls: cta ? 'mod-cta' : '' });
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try { await onClick(); } catch (err) { console.error(err); new Notice(`Figure Suite: ${err.message || err}`); } finally { b.disabled = false; }
    };
    return b;
  }

  defaultName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${this.settings.prefix || 'figure'}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  toggleHelp() {
    const show = !this.helpEl.isShown();
    if (show && !this.helpEl.childElementCount) this.buildHelp();
    this.helpEl.toggle(show);
    this.helpBtn.toggleClass('is-active', show);
    if (show && this.helpSearch) this.helpSearch.focus();
  }

  /** The syntax reference: section links, search, and examples that can be inserted. */
  buildHelp() {
    const el = this.helpEl;
    el.empty();
    const pref = this.settings.helpLanguage;
    const lang = pref === 'en' || pref === 'zh' ? pref : uiLanguage();
    const t = (o) => o[lang] || o.en;
    const L = lang === 'zh'
      ? { search: '搜索语法…', insert: '插入', none: '没有匹配的内容。', other: 'English', inserted: '已插入到末尾' }
      : { search: 'Search the syntax…', insert: 'Insert', none: 'Nothing matches.', other: '中文', inserted: 'Added at the end' };

    const head = el.createDiv('fs-help-head');
    this.helpSearch = head.createEl('input', { type: 'search', cls: 'fs-help-search', attr: { placeholder: L.search, spellcheck: 'false' } });
    const langBtn = head.createEl('button', { text: L.other, cls: 'fs-help-lang', attr: { 'aria-label': 'Language of this reference' } });
    langBtn.onclick = async () => {
      this.settings.helpLanguage = lang === 'zh' ? 'en' : 'zh';
      await this.plugin.saveSettings();
      this.buildHelp();
    };
    const close = head.createEl('button', { cls: 'fs-help-close clickable-icon', attr: { 'aria-label': 'Close' } });
    setIcon(close, 'x');
    if (!close.querySelector('svg')) close.setText('×');
    close.onclick = () => this.toggleHelp();

    const nav = el.createDiv('fs-help-nav');
    const body = el.createDiv('fs-help-body');
    const empty = body.createDiv({ cls: 'fs-help-empty', text: L.none });
    empty.hide();
    const sections = [];
    for (const sec of HELP) {
      const secEl = body.createDiv({ cls: 'fs-help-section' });
      secEl.createEl('h4', { text: t(sec.title) });
      const link = nav.createEl('button', { text: t(sec.title), cls: 'fs-help-chip' });
      link.onclick = () => secEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const entries = [];
      for (const it of sec.items) {
        let itemEl;
        let text;
        if (it.p) {
          itemEl = secEl.createEl('p');
          richText(itemEl, t(it.p));
          text = t(it.p);
        } else if (it.ref) {
          itemEl = secEl.createDiv('fs-help-ref');
          const rows = [];
          for (const [syntax, desc] of it.ref) {
            const row = itemEl.createDiv('fs-help-row');
            row.createEl('code', { text: syntax, cls: 'fs-help-syntax' });
            richText(row.createDiv('fs-help-desc'), t(desc));
            rows.push({ el: row, text: `${syntax} ${t(desc)}`.toLowerCase() });
          }
          entries.push({ el: itemEl, rows });
          continue;
        } else if (it.ex) {
          itemEl = secEl.createDiv('fs-help-example');
          const bar = itemEl.createDiv('fs-help-example-bar');
          bar.createSpan({ text: t(it.note), cls: 'fs-help-note' });
          const ins = bar.createEl('button', { text: L.insert, cls: 'fs-help-insert' });
          ins.onclick = () => {
            this.insertTemplate({ source: it.ex }, true);
            new Notice(L.inserted);
          };
          itemEl.createEl('pre', { text: it.ex });
          text = `${t(it.note)} ${it.ex}`;
        }
        entries.push({ el: itemEl, text: String(text).toLowerCase() });
      }
      sections.push({ el: secEl, link, title: t(sec.title).toLowerCase(), entries });
    }

    const filter = () => {
      const q = this.helpSearch.value.trim().toLowerCase();
      let any = false;
      for (const sec of sections) {
        let hit = false;
        const all = !q || sec.title.includes(q);
        for (const e of sec.entries) {
          if (e.rows) {
            let rowHit = false;
            for (const r of e.rows) { const ok = all || r.text.includes(q); r.el.toggle(ok); rowHit = rowHit || ok; }
            e.el.toggle(rowHit);
            hit = hit || rowHit;
          } else {
            const ok = all || e.text.includes(q);
            e.el.toggle(ok);
            hit = hit || ok;
          }
        }
        sec.el.toggle(hit);
        sec.link.toggleClass('is-dim', !hit);
        any = any || hit;
      }
      empty.toggle(!any);
    };
    this.helpSearch.addEventListener('input', filter);
    this.helpSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.helpSearch.value) { e.preventDefault(); e.stopPropagation(); this.helpSearch.value = ''; filter(); }
    });
  }

  /* ---------- source editing ---------- */

  setSource(text, undoable) {
    const ta = this.textarea;
    if (undoable) {
      ta.focus();
      ta.select();
      const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
      if (!ok) ta.value = text;
    } else ta.value = text;
    this.onInput();
  }

  insertTemplate(t, append) {
    const cur = this.textarea.value;
    const next = append && cur.trim() ? `${cur.replace(/\s+$/, '')}\n\n${t.source}\n` : `${t.source}\n`;
    this.setSource(next, true);
    this.userZoomed = false;
    window.clearTimeout(this.timer);
    this.render();
    this.fit(true);
  }

  onInput() {
    this.dirty = true;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.render();
      if (!this.editing) this.plugin.saveDraft(this.textarea.value);
    }, 90);
  }

  wireEditor() {
    const ta = this.textarea;
    ta.addEventListener('input', () => this.onInput());
    ta.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        this.primary.click();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        this.indent(e.shiftKey ? -1 : 1);
        return;
      }
      if (mod && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        this.toggleComment();
        return;
      }
      if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const before = ta.value.slice(0, ta.selectionStart);
        const line = before.slice(before.lastIndexOf('\n') + 1);
        let indent = (line.match(/^[ \t]*/) || [''])[0];
        const head = line.trim().split(/\s+/)[0];
        if (!indent && BLOCK_KINDS.includes(head) && !['arrow', 'text', 'space'].includes(head)) indent = '  ';
        document.execCommand('insertText', false, `\n${indent}`);
      }
    });
  }

  /** Indent / dedent the selected lines (or insert spaces at the caret). */
  indent(dir) {
    const ta = this.textarea;
    const v = ta.value;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    if (dir > 0 && s === e) { document.execCommand('insertText', false, '  '); return; }
    const lineEnd = v.indexOf('\n', e - (e > s && v[e - 1] === '\n' ? 1 : 0));
    const end = lineEnd < 0 ? v.length : lineEnd;
    const block = v.slice(lineStart, end);
    const changed = block.split('\n').map((l) => (dir > 0 ? `  ${l}` : l.replace(/^( {1,2}|\t)/, ''))).join('\n');
    ta.setSelectionRange(lineStart, end);
    document.execCommand('insertText', false, changed);
    ta.setSelectionRange(lineStart, lineStart + changed.length);
  }

  /** Mod+/: comment out the selected lines with `//`, or uncomment them. */
  toggleComment() {
    const ta = this.textarea;
    const v = ta.value;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const lineEnd = v.indexOf('\n', e - (e > s && v[e - 1] === '\n' ? 1 : 0));
    const end = lineEnd < 0 ? v.length : lineEnd;
    const lines = v.slice(lineStart, end).split('\n');
    const filled = lines.filter((l) => l.trim());
    const allCommented = filled.length && filled.every((l) => /^\s*\/\//.test(l));
    const changed = lines.map((l) => {
      if (!l.trim()) return l;
      if (allCommented) return l.replace(/^(\s*)\/\/ ?/, '$1');
      const m = l.match(/^\s*/)[0];
      return `${m}// ${l.slice(m.length)}`;
    }).join('\n');
    ta.setSelectionRange(lineStart, end);
    document.execCommand('insertText', false, changed);
    ta.setSelectionRange(lineStart, lineStart + changed.length);
  }

  gotoLine(n) {
    const ta = this.textarea;
    const lines = ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
    ta.scrollTop = Math.max(0, (n - 4) * lh);
  }

  /* ---------- preview ---------- */

  render() {
    let res;
    try {
      res = renderFigure(this.textarea.value, this.plugin.renderSettings());
    } catch (err) {
      console.error(err);
      this.errorsEl.empty();
      this.errorsEl.createDiv({ cls: 'fs-error', text: `Internal error: ${err.message}` });
      return;
    }
    this.result = res;
    const doc = new DOMParser().parseFromString(res.svg, 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    this.paper.empty();
    if (res.empty) {
      this.paper.addClass('is-empty');
      this.paper.createDiv({ cls: 'fs-empty', text: 'Type a block (array, table, tree, graph, list, chains…) or pick a template.' });
    } else {
      this.paper.removeClass('is-empty');
      this.paper.appendChild(svg);
      this.svgEl = svg;
      if (!this.userZoomed && !this.drag) this.fit(true); else this.applyZoom();
    }
    this.errorsEl.empty();
    for (const err of res.errors) {
      const row = this.errorsEl.createDiv({ cls: err.warn ? 'fs-error is-warn' : 'fs-error' });
      row.createSpan({ cls: 'fs-error-line', text: `Line ${err.line}` });
      row.createSpan({ text: ` ${err.msg}` });
      row.onclick = () => this.gotoLine(err.line);
    }
    this.statusEl.setText(res.empty ? '' : `${res.width} × ${res.height} px${res.hits.length ? ' · drag graph nodes to move them' : ''}`);
  }

  applyZoom() {
    if (!this.svgEl || !this.result) return;
    this.svgEl.setAttribute('width', String(this.result.width * this.zoom));
    this.svgEl.setAttribute('height', String(this.result.height * this.zoom));
    this.zoomLabel.setText(`${Math.round(this.zoom * 100)}%`);
  }

  setZoom(z, user = true) {
    if (user) this.userZoomed = true;
    this.zoom = Math.min(6, Math.max(0.2, z));
    this.applyZoom();
  }

  /** Fit to the pane (only shrinking/enlarging up to 2× when `soft`). */
  fit(soft) {
    if (!this.result || this.result.empty) return;
    const box = this.previewEl.getBoundingClientRect();
    if (!box.width) return;
    const z = Math.min((box.width - 48) / this.result.width, (box.height - 48) / this.result.height);
    this.setZoom(soft ? Math.min(2, Math.max(0.3, z)) : z, !soft);
  }

  wirePreviewDrag() {
    const el = this.previewEl;
    const toSvg = (e) => {
      const rect = this.svgEl.getBoundingClientRect();
      const k = this.result.width / rect.width;
      return [(e.clientX - rect.left) * k, (e.clientY - rect.top) * k];
    };
    const hitAt = (e) => {
      if (!this.svgEl || !this.result) return null;
      const [x, y] = toSvg(e);
      let best = null;
      for (const h of this.result.hits) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d <= h.r + 3 && (!best || d < best.d)) best = { h, d };
      }
      return best && best.h;
    };
    el.addEventListener('pointermove', (e) => {
      if (this.drag) return;
      el.toggleClass('fs-can-drag', !!hitAt(e));
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const hit = hitAt(e);
      if (!hit) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      // measure the move from the pointer delta: the paper re-centres as the figure grows
      const k = this.result.width / this.svgEl.getBoundingClientRect().width;
      const base = new Map(this.result.hits.filter((h) => h.block === hit.block).map((h) => [h.id, [h.ux, h.uy]]));
      this.drag = { hit, cx: e.clientX, cy: e.clientY, k, base, source: this.textarea.value, moved: false, block: hit.block };
      el.addClass('fs-dragging');
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      let ux = d.hit.ux + ((e.clientX - d.cx) * d.k) / d.hit.unit;
      let uy = d.hit.uy - ((e.clientY - d.cy) * d.k) / d.hit.unit;
      if (!e.altKey) { ux = Math.round(ux * 10) / 10; uy = Math.round(uy * 10) / 10; }
      const pos = new Map(d.base);
      pos.set(d.hit.id, [ux, uy]);
      d.next = setGraphPositions(d.source, d.block, pos);
      d.moved = true;
      this.textarea.value = d.next;
      this.render();
    });
    const end = () => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      el.removeClass('fs-dragging');
      if (!d.moved || d.next === d.source) return;
      // one undo step for the whole drag
      this.textarea.value = d.source;
      this.setSource(d.next, true);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
  }

  /* ---------- output ---------- */

  exportSettings(format) {
    return { ...this.plugin.renderSettings(), pngScale: Number(this.scaleSel.value), embedSource: this.settings.embedSource, format };
  }

  async build(format) {
    const source = this.textarea.value;
    if (!source.trim() || (this.result && this.result.empty)) throw new Error('Nothing to export yet');
    return exportFigure(source, format, this.exportSettings(format));
  }

  async copy(format) {
    const out = await this.build(format);
    if (format === 'png') await copyPng(out.bytes);
    else await copyText(new TextDecoder().decode(out.bytes));
    new Notice(`Copied ${format.toUpperCase()} to clipboard`);
  }

  async save(insert) {
    const format = this.formatSel.value;
    const out = await this.build(format);
    const raw = (this.nameInput.value.trim() || this.defaultName()).replace(/\.(png|svg)$/i, '').replace(/[\\/:*?"<>|#^[\]]/g, '-');
    const notePath = this.target && this.target.file ? this.target.file.path : '';
    const path = await this.app.fileManager.getAvailablePathForAttachment(`${raw}.${out.ext}`, notePath);
    const file = await this.app.vault.createBinary(path, out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength));
    const link = this.plugin.embedLink(file, notePath, out);
    if (insert && this.target && this.target.editor) {
      this.plugin.insertOnOwnLine(this.target.editor, link);
      new Notice(`Inserted ${file.name}`);
    } else {
      await copyText(link).catch(() => {});
      new Notice(`Saved ${file.path} — embed link copied`);
    }
    this.finished = true;
    this.plugin.saveDraft('');
    this.close();
  }

  async update() {
    const file = this.editing.file;
    const out = await this.build(file.extension);
    const oldWidth = file.extension === 'png' ? pngCssWidth(new Uint8Array(await this.app.vault.readBinary(file))) : null;
    await this.app.vault.modifyBinary(file, out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength));
    await this.plugin.refreshLinkWidths(file, oldWidth, out);
    this.plugin.refreshEmbeds(file);
    this.plugin.sourceCache.delete(file.path);
    const px = out.ext === 'png' ? ` at ${out.scale}× (${Math.round(out.width * out.scale)}×${Math.round(out.height * out.scale)} px, shown ${Math.round(out.width)} px wide)` : '';
    new Notice(`Updated ${file.name}${px}`);
    this.finished = true;
    this.close();
  }

  close() {
    if (this.dirty && !this.finished && !this.confirming && this.textarea.value.trim()) {
      this.confirming = true;
      const bar = this.contentEl.createDiv('fs-confirm');
      bar.createSpan({ text: this.editing ? 'Unsaved changes to this figure.' : 'Close the panel? The figure stays as a draft.' });
      const keep = bar.createEl('button', { text: 'Keep editing' });
      const leave = bar.createEl('button', { text: this.editing ? 'Discard' : 'Close', cls: this.editing ? 'mod-warning' : '' });
      const save = bar.createEl('button', { text: this.primary.textContent, cls: 'mod-cta' });
      const done = () => { bar.remove(); this.confirming = false; };
      keep.onclick = () => { done(); this.textarea.focus(); };
      leave.onclick = () => { this.finished = !!this.editing; done(); this.dirty = false; super.close(); };
      save.onclick = () => { done(); this.primary.click(); };
      bar.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); keep.click(); } });
      keep.focus();
      return;
    }
    if (this.confirming) return;
    super.close();
  }

  onClose() {
    window.clearTimeout(this.timer);
    if (this.resizeObs) this.resizeObs.disconnect();
    if (!this.editing && !this.finished) this.plugin.saveDraft(this.textarea.value);
    this.contentEl.empty();
  }
}
