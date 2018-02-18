{
  // represents an editor (.tc==0) or a tracer (.tc==1)
  // holds a ref to a CodeMirror instance (.cm),
  // handles most CodeMirror commands in editors (e.g. .LN(), .QT(), .TL(), ...)
  function Ed(ide, opts) { // constructor
    const ed = this;
    ed.ACB_VALUE = { pairs: '()[]{}', explode: '{}' }; // value for CodeMirror's "autoCloseBrackets" option when on
    ed.ide = ide;
    ed.id = opts.id;
    ed.name = opts.name;
    ed.tc = opts.tc;
    ed.HIGHLIGHT_LINE = 0;
    ed.decorations = [];
    ed.hlDecorations = [];
    ed.stopDecorations = [];
    ed.dom = I.ed_tmpl.cloneNode(1);
    ed.dom.id = null;
    ed.dom.style.display = '';
    ed.$e = $(ed.dom);
    ed.jumps = [];
    ed.focusTS = 0;
    ed.dom.oncontextmenu = D.oncmenu;
    ed.oText = '';
    ed.oStop = []; // remember original text and "stops" to avoid pointless saving on EP
    ed.stop = new Set(); // remember original text and "stops" to avoid pointless saving on EP
    const me = monaco.editor.create(ed.dom.querySelector('.ride_win_cm'), {
      automaticLayout: true,
      autoIndent: true,
      cursorStyle: D.prf.blockCursor() ? 'block' : 'line',
      cursorBlinking: D.prf.blinkCursor() ? 'blink' : 'solid',
      folding: true,
      fontFamily: 'apl',
      glyphMargin: true,
      language: 'apl',
      lineNumbers: !!D.prf.lineNums() && (x => `[${x - 1}]`),
      matchBrackets: true,
      mouseWheelZoom: true,
      renderIndentGuides: true,
      showFoldingControls: 'always',
      wordBasedSuggestions: false,
    });
    ed.monaco = me;

    ed.monaco_ready = new Promise((resolve) => {
      // ugly hack as monaco doesn't have a built in event for when the editor is ready?!
      // https://github.com/Microsoft/monaco-editor/issues/115
      const didScrollChangeDisposable = me.onDidScrollChange(() => {
        didScrollChangeDisposable.dispose();
        resolve(true);
      });
    });
    me.dyalogCmds = ed;
    ed.tracer = me.createContextKey('tracer', !!ed.tc);
    ed.mapKeys();
    // ed.cm = CM(ed.dom.querySelector('.ride_win_hide'), {
    //   lineNumbers: !!D.prf.lineNums(),
    //   firstLineNumber: 0,
    //   lineNumberFormatter: i => `[${i}]`,
    //   smartIndent: !D.prf.ilf() && D.prf.indent() >= 0,
    //   indentUnit: D.prf.indent(),
    //   scrollButtonHeight: 12,
    //   matchBrackets: !!D.prf.matchBrackets(),
    //   autoCloseBrackets: !!D.prf.autoCloseBrackets() && ACB_VALUE,
    //   foldGutter: !!D.prf.fold(),
    //   scrollbarStyle: 'simple',
    //   keyMap: 'dyalog',
    //   extraKeys: { 'Shift-Tab': 'indentLess', Tab: 'indentOrComplete', Down: 'downOrXline' },
    //   viewportMargin: Infinity,
    //   cursorBlinkRate: D.prf.blinkCursor() * CM.defaults.cursorBlinkRate,
    // });
    if (D.prf.blockCursor()) CM.addClass(ed.cm.getWrapperElement(), 'cm-fat-cursor');
    ed.isCode = 1;
    ed.breakpoints = D.prf.breakPts();
    // ed.cm.dyalogCmds = ed;
    // ed.cm.on('cursorActivity', ed.cursorActivity.bind(ed));
    // ed.cm.on('gutterClick', (cm, l, g) => { // g:gutter
    //   if (g === 'breakpoints' || g === 'CodeMirror-linenumbers') {
    //     cm.setCursor({ line: l, ch: 0 });
    //     ed.BP(ed.cm);
    //   }
    // });
    me.onMouseDown((e) => {
      const t = e.target;
      const l = t.position.lineNumber - 1;
      if (t.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        ed.stop.has(l) ? ed.stop.delete(l) : ed.stop.add(l);
        ed.setStop();
        ed.tc && D.send('SetLineAttributes', { win: ed.id, stop: ed.getStops() });
      }
    });
    // ed.cm.on('scroll', (c) => { const i = c.getScrollInfo(); ed.btm = i.clientHeight + i.top; });
    // ed.cm.on('focus', () => { ed.focusTS = +new Date(); ed.ide.focusedWin = ed; });
    // D.util.cmOnDblClick(ed.cm, (x) => { ed.ED(ed.cm); x.preventDefault(); x.stopPropagation(); });
    // ed.processAutocompleteReply=D.ac(ed)
    ed.processAutocompleteReply = (x) => {
      if (me.model.ac && me.model.ac.complete) {
        me.model.ac.complete(x.options.map(i => ({ label: i })));
      }
    };
    ed.tb = ed.dom.querySelector('.toolbar');
    ed.tb.onmousedown = (x) => {
      if (x.target.matches('.tb_btn')) {
        x.target.classList.add('armed');
        x.preventDefault();
      }
    };
    ed.tb.onmouseout = (x) => {
      if (x.target.matches('.tb_btn')) {
        x.target.classList.remove('armed');
        x.preventDefault();
      }
    };
    ed.tb.onmouseup = ed.tb.onmouseout;
    ed.tb.onclick = (x) => {
      const t = x.target;
      if (t.matches('.tb_hid,.tb_case')) { t.classList.toggle('pressed'); ed.hls(); return !1; }
      if (t.matches('.tb_btn')) {
        const c = t.className.replace(/^.*\btb_([A-Z]{2,3})\b.*$/, '$1');
        if (ed[c]) ed[c](ed.me);
        else if (CM.commands[c]) CM.commands[c](ed.me);
        return !1;
      }
      return !0;
    };
    ed.setTC(!!ed.tc);
    // this.vt = D.vt(this);
    this.setLN(D.prf.lineNums());
    ed.firstOpen = true;
  }
  Ed.prototype = {
    mapKeys() {
      const me = this.monaco;
      const kc = monaco.KeyCode;
      const km = monaco.KeyMod;
      const ctrlcmd = {
        Ctrl: D.mac ? km.WinCtrl : km.CtrlCmd,
        Cmd: km.CtrlCmd,
        Esc: kc.Escape,
        '\\': kc.US_BACKSLASH,
        // '`': kc.US_BACKTICK,
        ']': kc.US_CLOSE_SQUARE_BRACKET,
        ',': kc.US_COMMA,
        '.': kc.US_DOT,
        '=': kc.US_EQUAL,
        '-': kc.US_MINUS,
        '[': kc.US_OPEN_SQUARE_BRACKET,
        '\'': kc.US_QUOTE,
        ';': kc.US_SEMICOLON,
        '/': kc.US_SLASH,
      };
      function addCmd(map) {
        Object.keys(map).forEach((ks) => {
          const nkc = ks.split('-').reduce(((a, ko) => {
            const k = ko.replace(/^[A-Z0-9]$/, 'KEY_$&')
              .replace(/^Numpad(.*)/, (m, p) => `NUMPAD_${p.toUpperCase()}`)
              .replace(/^(Up|Left|Right|Down)$/, '$1Arrow')
              .replace(/--/g, '-US_MINUS')
              .replace(/^'(.)'$/, '$1');
            return a | (ctrlcmd[k] || km[k] || kc[k]); // eslint-disable-line no-bitwise
          }), 0);
          if (nkc) {
            const cmd = map[ks];
            let cond;
            if (cmd === 'ER' || cmd === 'TC') cond = 'tracer';
            else if (nkc === kc.Escape) cond = '!suggestWidgetVisible && !editorHasMultipleSelections && !findWidgetVisible && !inSnippetMode';
            me.addCommand(nkc, () => CM.commands[cmd](me), cond);
          }
        });
      }
      addCmd(CM.keyMap.dyalogDefault);
      addCmd(CM.keyMap.dyalog);
    },
    updGutters() {
      // const g = [];
      const ed = this;
      const me = ed.monaco;
      me.glyphMargin = ed.isCode && ed.breakpoints;
      // if (ed.isCode && ed.breakpoints) g.push('breakpoints');
      // if (cm.getOption('lineNumbers')) g.push('CodeMirror-linenumbers');
      // if (cm.getOption('foldGutter')) g.push('cm-foldgutter');
      // cm.setOption('gutters', g);
    },
    createBPEl() { // create breakpoint element
      const e = this.dom.ownerDocument.createElement('div');
      e.className = 'breakpoint'; e.innerHTML = '●'; return e;
    },
    getStops() { // returns an array of line numbers
      return [...this.stop].sort((x, y) => x - y);
    },
    cursorActivity() { // handle "cursor activity" event from CodeMirror
      // xline:the line number of the empty line inserted when you press <down> at eof
      const ed = this;
      if (ed.xline == null) return;
      const n = ed.cm.lineCount();
      const l = ed.cm.getCursor().line;
      if (l === ed.xline && l === n - 1 && /^\s*$/.test(ed.cm.getLine(n - 1))) return;
      if (l < ed.xline && ed.xline === n - 1 && /^\s*$/.test(ed.cm.getLine(n - 1))) {
        ed.cm.replaceRange('', { line: n - 2, ch: ed.cm.getLine(n - 2).length }, { line: n - 1, ch: 0 }, 'D');
      }
      delete ed.xline;
    },
    scrollToCursor() { // approx. to 1/3 of editor height; might not work near the top or bottom
      const h = this.dom.clientHeight;
      const cc = this.cm.cursorCoords(true, 'local');
      const x = cc.left;
      const y = cc.top;
      this.cm.scrollIntoView({
        left: x,
        right: x,
        top: y - (h / 3),
        bottom: y + (2 * (h / 3)),
      });
    },
    hl(l) { // highlight - set current line in tracer
      const ed = this;
      const me = ed.monaco;
      if (l == null) {
        ed.hlDecorations = [];
      } else {
        const lm = l + 1;
        ed.hlDecorations = [{
          range: new monaco.Range(lm, 1, lm, 1),
          options: {
            isWholeLine: true,
            className: 'highlighted',
          },
        }];
        me.setPosition({ lineNumber: lm, column: 0 });
        me.revealLineInCenter(l);
      }
      ed.setDecorations();
    },
    setBP(x) { // update the display of breakpoints
      const ed = this;
      ed.breakpoints = !!x;
      ed.updGutters();
    },
    setLN(x) { // update the display of line numbers and the state of the "[...]" button
      const ed = this;
      // ed.cm.setOption('lineNumbers', !!x);
      ed.monaco.lineNumbers = !!D.prf.lineNums() && (l => `[${l - 1}]`);
      ed.updGutters();
      const a = ed.tb.querySelectorAll('.tb_LN');
      for (let i = 0; i < a.length; i++) a[i].classList.toggle('pressed', !!x);
    },
    setTC(x) {
      const ed = this;
      ed.tc = x;
      ed.tracer.set(x);
      ed.dom.classList.toggle('tracer', !!x);
      ed.hl(null);
      ed.updGutters();
      ed.setRO(x);
    },
    setRO(x) {
      const ed = this;
      // ed.cm.setOption('readOnly',x)/*;this.rp.hidden=x*/
      ed.monaco.updateOptions({ readOnly: x });
      if (x) {
        ed.dom.getElementsByClassName('tb_AO')[0].style.display = 'none';
        ed.dom.getElementsByClassName('tb_DO')[0].style.display = 'none';
        ed.dom.getElementsByClassName('tb_RP')[0].style.display = 'none';
      }
    },
    setStop() {
      const ed = this;
      // const { cm } = ed;
      // for (let k = 0; k < ed.oStop.length; k++) {
      //   cm.setGutterMarker(ed.oStop[k], 'breakpoints', ed.createBPEl());
      // }
      ed.stopDecorations = [...ed.stop].map(x => ({
        range: new monaco.Range(x + 1, 1, x + 1, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'breakpoint',
        },
      }));
      ed.setDecorations();
    },
    setDecorations() {
      const ed = this;
      ed.decorations = ed.monaco.deltaDecorations(
        ed.decorations,
        [...ed.stopDecorations, ...ed.hlDecorations],
      );
    },
    updSize() {},
    saveScrollPos() {
      // workaround for CodeMirror scrolling up to
      // the top under GoldenLayout when editor is closed
      // const ed = this;
      // if (ed.btm == null) {
      //   const i = ed.cm.getScrollInfo();
      //   ed.btm = i.clientHeight + i.top;
      // }
    },
    restoreScrollPos() {
      // const ed = this;
      // if (ed.btm != null) {
      //   const i = ed.cm.getScrollInfo();
      //   ed.cm.scrollTo(0, ed.btm - i.clientHeight);
      // } else { ed.cm.scrollTo(0, 0); }
    },
    updateSIStack(x) {
      this.dom.querySelector('.si_stack').innerHTML = x.stack.map(o => `<option>${o}`).join('');
    },
    stateChanged() {
      const w = this;
      w.updSize();
      // w.cm.refresh();
      if (w.updGutters) w.updGutters();
      w.restoreScrollPos();
    },
    open(ee) { // ee:editable entity
      const ed = this;
      const { cm } = ed;
      const me = ed.monaco;
      me.model.winid = ed.id;
      me.model.onDidChangeContent((x) => {
        if (!me.dyalogBQ && x.changes.length === 1
          && x.changes[0].text === D.prf.prefixKey()) CM.commands.BQC(me);
      });
      me.model.setValue(ed.oText = ee.text.join('\n'));
      me.model.setEOL(monaco.editor.EndOfLineSequence.LF);
      // to preserve jumps, convert LineHandle-s to line numbers
      ed.jumps.forEach((x) => { x.n = x.lh.lineNo(); });
      // cm.setValue(ed.oText=ee.text.join('\n')) //.setValue() invalidates old LineHandle-s
      // look up new LineHandle-s, forget numbers
      ed.jumps.forEach((x) => { x.lh = cm.getLineHandle(x.n); delete x.n; });
      // cm.clearHistory();
      me.focus();
      // entityType:            16 NestedArray        512 AplClass
      // 1 DefinedFunction      32 QuadORObject      1024 AplInterface
      // 2 SimpleCharArray      64 NativeFile        2048 AplSession
      // 4 SimpleNumericArray  128 SimpleCharVector  4096 ExternalFunction
      // 8 MixedSimpleArray    256 AplNamespace
      ed.isCode = [1, 256, 512, 1024, 2048, 4096].indexOf(ee.entityType) >= 0;
      // cm.setOption('mode', ed.isCode ? 'apl' : 'text');
      me.language = ed.isCode ? 'apl' : 'text';
      // cm.setOption('foldGutter', ed.isCode && !!D.prf.fold());
      me.folding = ed.isCode && !!D.prf.fold();
      if (ed.isCode && D.prf.indentOnOpen()) ed.RD(me);
      ed.setRO(ee.readOnly || ee.debugger);
      ed.setBP(ed.breakpoints);
      const line = ee.currentRow;
      let col = ee.currentColumn || 0;
      if (line === 0 && col === 0 && ee.text.length === 1
        && /\s?[a-z|@]+$/.test(ee.text[0])) col = ee.text[0].length;
      me.setPosition({ lineNumber: line + 1, column: col + 1 });
      me.revealLineInCenter(line + 1);
      ed.oStop = (ee.stop || []).slice(0).sort((x, y) => x - y);
      ed.stop = new Set(ed.oStop);
      ed.setStop();
      D.prf.floating() && $('title', ed.dom.ownerDocument).text(ee.name);
    },
    blockCursor(x) { this.cm.getWrapperElement().classList.toggle('cm-fat-cursor', !!x); },
    blinkCursor(x) { this.cm.setOption('cursorBlinkRate', x); },
    hasFocus() { return this.monaco.isFocused(); },
    focus() {
      let q = this.container;
      let p = q && q.parent;
      const l = q && q.layoutManager;
      const m = l && l._maximisedItem;
      if (m && m !== (p && p.parent)) m.toggleMaximise();
      while (p) {
        p.setActiveContentItem && p.setActiveContentItem(q);
        q = p; p = p.parent;
      } // reveal in golden layout
      window.focused || window.focus(); // this.cm.focus()
      this.monaco.focus();
    },
    insert(ch) { this.cm.getOption('readOnly') || this.cm.replaceSelection(ch); },
    saved(err) {
      if (err) {
        this.isClosing = 0;
        $.err('Cannot save changes');
      } else {
        this.isClosing && D.send('CloseWindow', { win: this.id });
      }
    },
    close() {
      if (D.prf.floating()) {
        window.onbeforeunload = null;
        I.ide.removeChild(I.ide.firstChild);
        D.el.getCurrentWindow().hide();
      }
    },
    prompt(x) {
      this.setRO(this.tc || !x);
      this.tc && this.dom.classList.toggle('pendent', !x);
    },
    die() { this.setRO(1); },
    getDocument() { return this.dom.ownerDocument; },
    refresh() { this.cm.refresh(); },
    cword() { // apl identifier under cursor
      const c = this.cm.getCursor();
      const s = this.cm.getLine(c.line);
      const r = `[${D.syn.letter}0-9]*`; // r:regex fragment used for a name
      return (
        ((RegExp(`⎕?${r}$`).exec(s.slice(0, c.ch)) || [])[0] || '') + // match left  of cursor
        ((RegExp(`^${r}`).exec(s.slice(c.ch)) || [])[0] || '') // match right of cursor
      ).replace(/^\d+/, ''); // trim leading digits
    },
    autoCloseBrackets(x) { this.cm.setOption('autoCloseBrackets', x); },
    indent(x) { this.cm.setOption('smartIndent', x >= 0); this.cm.setOption('indentUnit', x); },
    fold(x) { this.cm.setOption('foldGutter', this.isCode && !!x); this.updGutters(); },
    matchBrackets(x) { this.cm.setOption('matchBrackets', !!x); },
    zoom(z) {
      const w = this;
      const b = w.getDocument().body;
      const top = w.cm.heightAtLine(w.cm.lastLine(), 'local') < w.btm;
      const i = w.cm.getScrollInfo();
      const line = w.cm.lineAtHeight(top ? i.top : w.btm, 'local');
      const diff = w.btm - (line * w.cm.defaultTextHeight());
      const ch = i.clientHeight;
      b.className = `zoom${z} ${b.className.split(/\s+/).filter(s => !/^zoom-?\d+$/.test(s)).join(' ')}`;
      w.refresh();
      w.btm = (w.cm.defaultTextHeight() * line)
        + (top ? ch + 5 : diff)
        + (w.cm.getScrollInfo().clientHeight - ch);
    },

    ReplyFormatCode(lines) {
      const w = this;
      const u = w.cm.getCursor();
      w.saveScrollPos();
      w.monaco.setValue(lines.join('\n'));
      w.setStop();
      if (w.tc) {
        w.hl(w.HIGHLIGHT_LINE);
        u.line = w.HIGHLIGHT_LINE;
      }
      if (w.firstOpen !== undefined && w.firstOpen === true) {
        if (lines.length === 1 && /\s?[a-z|@]+$/.test(lines[0])) u.ch = w.cm.getLine(u.line).length;
        else if (lines[0][0] === ':') u.ch = 0;
        else u.ch = 1;
        w.firstOpen = false;
      }
      w.restoreScrollPos();
      w.cm.setCursor(u);
      if (D.ide.hadErr) {
        D.ide.wins[0].focus(); D.ide.hadErr = 0;
      } else { w.focus(); }
    },
    SetHighlightLine(line) {
      const w = this;
      if (w && w.hl) {
        w.hl(line);
        w.focus();
        w.HIGHLIGHT_LINE = line;
      }
    },
    ValueTip(x) {
      // this.vt.processReply(x);
      const me = this.monaco;
      if (me.model.vt && me.model.vt.complete) {
        const vt = me.model.vt;
        const l = vt.position.lineNumber;
        const s = me.model.getLineContent(l);
        vt.complete({
          range: new monaco.Range(l, x.startCol + 1, l, x.endCol + 1),
          contents: [
            s.slice(x.startCol, x.endCol),
            { language: 'apl', value: x.tip.join('\n') }
          ],
        });
      }
    },
    ED(me) {
      this.addJump();
      // D.ide.Edit({win:this.id,pos:cm.indexFromPos(cm.getCursor()),text:cm.getValue()})
      D.ide.Edit({
        win: this.id,
        pos: me.model.getOffsetAt(me.getPosition()),
        text: me.getValue(),
      });
    },
    QT() { D.send('CloseWindow', { win: this.id }); },
    BK(cm) { this.tc ? D.send('TraceBackward', { win: this.id }) : cm.execCommand('undo'); },
    FD(cm) { this.tc ? D.send('TraceForward', { win: this.id }) : cm.execCommand('redo'); },
    STL(cm) {
      if (!this.tc) return;
      let steps = cm.getCursor().line - this.HIGHLIGHT_LINE;
      const cmd = steps > 0 ? 'TraceForward' : 'TraceBackward';
      steps = Math.abs(steps);
      for (let i = 0; i < steps; i++) { D.send(cmd, { win: this.id }); }
    },
    EP(me) { this.isClosing = 1; this.FX(me); },
    FX(me) {
      const ed = this;
      const v = me.getModel().getValue(monaco.editor.EndOfLinePreference.LF);
      const stop = ed.getStops();
      if (ed.tc || (v === ed.oText && `${stop}` === `${ed.oStop}`)) { // if tracer or unchanged
        D.send('CloseWindow', { win: ed.id }); return;
      }
      if (!ed.monaco) {
        for (let i = 0; i < stop.length; i++) me.setGutterMarker(stop[i], 'breakpoints', null);
      }
      // D.send('SaveChanges', { win: ed.id, text: v.split('\n'), stop: [] });
      D.send('SaveChanges', { win: ed.id, text: v.split('\n'), stop });
    },
    TL(cm) { // toggle localisation
      const name = this.cword();
      if (!name) return;
      const ts = (((cm.getTokenAt(cm.getCursor()) || {}).state || {}).a || [])
        .map(x => x.t)
        .filter(t => /^(∇|\{|namespace|class|interface)$/.test(t));
      if (ts.includes('{') || (ts.length && !ts.includes('∇'))) return;
      const l0 = cm.getCursor().line;
      let f; // f:found?
      let l;
      for (l = l0 - 1; l >= 0; l--) {
        const b = cm.getLineTokens(l);
        for (let i = b.length - 1; i >= 0; i--) if (b[i].type === 'apl-trad') { f = 1; break; }
        if (f) break;
      }
      if (l < 0) l = 0;
      const u = cm.getLine(l).split('⍝');
      let s = u[0]; // s:the part before the first "⍝"
      const com = u.slice(1).join('⍝'); // com:the rest
      const a = s.split(';');
      const head = a[0].replace(/\s+$/, '');
      let tail = a.length > 1 ? a.slice(1) : [];
      tail = tail.map(x => x.replace(/\s+/g, ''));
      const i = tail.indexOf(name); i < 0 ? tail.push(name) : tail.splice(i, 1);
      s = [head].concat(tail.sort()).join(';') + (com ? ` ${com}` : '');
      cm.replaceRange(s, { line: l, ch: 0 }, { line: l, ch: cm.getLine(l).length }, 'D');
    },
    LN() { D.prf.lineNums.toggle(); },
    TVO() { D.prf.fold.toggle(); },
    TVB() { D.prf.breakPts.toggle(); },
    TC() { D.send('StepInto', { win: this.id }); D.ide.getSIS(); },
    AC(cm) { // align comments
      if (cm.getOption('readOnly')) return;
      const ed = this;
      const ll = cm.lastLine();
      const o = cm.listSelections(); // o:original selections
      const sels = cm.somethingSelected() ? o : [{
        anchor: { line: 0, ch: 0 },
        head: { line: ll, ch: cm.getLine(ll).length },
      }];
      const a = sels.map((sel) => { // a:info about individual selections
        let p = sel.anchor;
        let q = sel.head;
        if ((p.line - q.line || p.ch - q.ch) > 0) { const h = p; p = q; q = h; } // p:from, q:to
        const l = ed.cm.getRange({ line: p.line, ch: 0 }, q, '\n').split('\n'); //  l:lines
        const u = l.map(x => x.replace(/'[^']*'?/g, y => ' '.repeat(y.length))); // u:scrubbed strings
        const c = u.map(x => x.indexOf('⍝')); // c:column index of ⍝
        return {
          p, q, l, u, c,
        };
      });
      const m = Math.max(...a.map(sel => Math.max(...sel.c)));
      a.forEach((sel) => {
        const r = sel.l.map((x, i) => {
          const ci = sel.c[i];
          return ci < 0 ? x : x.slice(0, ci) + ' '.repeat(m - ci) + x.slice(ci);
        });
        r[0] = r[0].slice(sel.p.ch); ed.cm.replaceRange(r.join('\n'), sel.p, sel.q, 'D');
      });
      cm.setSelections(o);
    },
    ER(mo) {
      if (this.tc) { D.send('RunCurrentLine', { win: this.id }); D.ide.getSIS(); return; }
      if (D.prf.autoCloseBlocks()) {
        // var u=cm.getCursor(),l=u.line,s=cm.getLine(l),m
        const u = mo.getPosition();
        const l = u.lineNumber;
        const md = mo.getModel();
        const s = md.getLineContent(l);
        let m;
        const re = /^(\s*):(class|disposable|for|if|interface|namespace|property|repeat|section|select|trap|while|with)\b([^⋄{]*)$/i;
        // if(u.ch===s.length&&(m=re.exec(s))&&!D.syn.dfnDepth(cm.getStateAfter(l-1))){
        md.getLineTokens(l, false);
        const state = md._lines[l - 1].getState().clone();
        if (u.column === s.length + 1 && (m = re.exec(s)) && !D.syn.dfnDepth(state)) {
          const [, pre, kwc, post] = m;
          let l1 = l + 1;
          const end = md.getLineCount();
          const kw = kwc[0].toUpperCase() + kwc.slice(1).toLowerCase();
          while (l1 <= end && /^\s*(?:$|⍝)/.test(md.getLineContent(l1))) l1 += 1; // find the next non-blank line
          const s1 = md.getLineContent(l1) || '';
          const pre1 = s1.replace(/\S.*$/, '');
          if (pre.length > pre1.length ||
            (pre.length === pre1.length && !/^\s*:(?:end|else|andif|orif|case|until|access)/i.test(s1))) {
            let r = `:${kw}${post}\n${pre}:End`;
            D.prf.autoCloseBlocksEnd() || (r += kw);
            // cm.replaceRange(r, { line: l, ch: pre.length }, { line: l, ch: s.length });
            mo.executeEdits('editor', [{ range: new monaco.Range(l, pre.length, l, s.length), text: r }]);
            mo.trigger('editor', 'editor.action.formatDocument');
            // cm.execCommand('indentAuto');cm.execCommand('goLineUp');cm.execCommand('goLineEnd')
          }
        }
      }
      // cm.getOption('mode') === 'apl' ? cm.execCommand('newlineAndIndent')
      //   : cm.replaceSelection('\n', 'end');
      mo.trigger('editor', 'type', { text: '\n' });
    },
    BH() { D.send('ContinueTrace', { win: this.id }); },
    RM() { D.send('Continue', { win: this.id }); },
    MA() { D.send('RestartThreads', { win: this.id }); },
    CBP() { // Clear trace/stop/monitor for this object
      const ed = this;
      const n = ed.cm.lineCount();
      for (let i = 0; i < n; i++) ed.cm.setGutterMarker(i, 'breakpoints', null);
      ed.tc && D.send('SetLineAttributes', {
        win: ed.id,
        stop: ed.getStops(),
        trace: [],
        monitor: [],
      });
    },
    BP(me) { // toggle breakpoint
      const ed = this;
      const t = ed.stop.has(me.getSelection().positionLineNumber - 1);
      me.getSelections().forEach((s) => {
        let p = { l: s.selectionStartLineNumber - 1, c: s.selectionStartColumn - 1 };
        let q = { l: s.positionLineNumber - 1, c: s.positionColumn - 1 };
        if (p.l > q.l) { const h = p; p = q; q = h; }
        const l1 = q.l - (p.l < q.l && q.c > 1);
        for (let { l } = p; l <= l1; l++) {
          // ed.stop.has(l1) ? ed.stop.delete(l1) : ed.stop.add(l1);
          t ? ed.stop.delete(l1) : ed.stop.add(l1);
        }
      });
      ed.setStop();
      // const sels = cm.listSelections();
      // for (let i = 0; i < sels.length; i++) {
      //   let p = sels[i].anchor;
      //   let q = sels[i].head;
      //   if (p.line > q.line) { const h = p; p = q; q = h; }
      //   const l1 = q.line - (p.line < q.line && !q.ch);
      //   for (let l = p.line; l <= l1; l++) {
      //     cm.setGutterMarker(
      //       l, 'breakpoints',
      //       (cm.getLineHandle(l).gutterMarkers || {}).breakpoints ? null : this.createBPEl(),
      //     );
      //   }
      // }
      this.tc && D.send('SetLineAttributes', { win: this.id, stop: this.getStops() });
    },
    RD(me) {
      if (D.prf.ilf()) {
        const text = me.getValue().split('\n');
        D.send('FormatCode', { win: this.id, text });
      // } else if (cm.somethingSelected()) {
      //   cm.execCommand('indentAuto');
      // } else {
      //   const u = cm.getCursor();
      //   cm.execCommand('SA');
      //   cm.execCommand('indentAuto');
      //   cm.setCursor(u);
      }
    },
    VAL(cm) {
      const a = cm.getSelections();
      let s;
      if (a.length !== 1) s = '';
      else if (!a[0]) s = this.cword();
      else if (a[0].indexOf('\n') < 0) [s] = a;
      s && this.ide.exec([`      ${s}`], 0);
    },
    addJump() {
      const j = this.jumps;
      const u = this.cm.getCursor();
      j.push({ lh: this.cm.getLineHandle(u.line), ch: u.ch }) > 10 && j.shift();
    },
    getUnsaved() {
      const { cm } = this;
      const v = cm.getValue();
      return (v !== cm.oText) ? v : false;
    },
    JBK(cm) { const p = this.jumps.pop(); p && cm.setCursor({ line: p.lh.lineNo(), ch: p.ch }); },
    indentOrComplete(cm) {
      if (cm.somethingSelected()) { cm.execCommand('indentMore'); return; }
      const c = cm.getCursor();
      const s = cm.getLine(c.line);
      const ch = s[c.ch - 1];
      if (!ch || ch === ' ') { cm.execCommand('insertSoftTab'); return; }
      this.autocompleteWithTab = 1;
      D.send('GetAutocomplete', { line: s, pos: c.ch, token: this.id });
    },
    downOrXline(cm) {
      const l = cm.getCursor().line;
      if (l !== cm.lastLine() || /^\s*$/.test(cm.getLine(l))) { cm.execCommand('goLineDown'); return; }
      cm.execCommand('goDocEnd');
      cm.execCommand('newlineAndIndent');
      this.xline = l + 1;
    },
    onbeforeunload(e) { // called when the user presses [X] on the OS window
      const ed = this;
      if (D.prf.floating() && D.ide.connected) { e.returnValue = false; }
      if (ed.ide.dead) {
        D.nww && D.nww.close(true); // force close window
      } else if (ed.tc || (ed.cm.getValue() === ed.oText && `${ed.getStops()}` === `${ed.oStop}`)) {
        ed.EP(ed.cm);
      } else {
        setTimeout(() => {
          window.focus();
          const r = D.el.dialog.showMessageBox(D.elw, {
            title: 'Save?',
            buttons: ['Yes', 'No', 'Cancel'],
            cancelId: -1,
            message: `The object "${ed.name}" has changed.\nDo you want to save the changes?`,
          });
          if (r === 0) ed.EP(ed.monaco);
          else if (r === 1) ed.QT(ed.monaco);
          return '';
        }, 10);
      }
    },
  };
  D.Ed = Ed;
}
