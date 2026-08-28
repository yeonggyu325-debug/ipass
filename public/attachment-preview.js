(function (global) {
  'use strict';

  const ASSETS = {
    pdf: '/vendor/attachment-preview/pdf.min.mjs',
    pdfWorker: '/vendor/attachment-preview/pdf.worker.min.mjs',
    pptx: '/vendor/attachment-preview/pptx-renderer.es.js',
    rhwp: '/vendor/attachment-preview/rhwp.js',
    rhwpWasm: '/vendor/attachment-preview/rhwp_bg.wasm',
    jszip: '/vendor/attachment-preview/jszip.min.js',
    docx: '/vendor/attachment-preview/docx-preview.min.js',
    xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
  };
  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const OFFICE_FALLBACK = new Set(['xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx']);
  const HANGUL_FALLBACK = new Set(['hwp', 'hwpx']);
  const ICONS = {
    pdf: 'PDF', xls: 'XLS', xlsx: 'XLSX', doc: 'DOC', docx: 'DOCX',
    ppt: 'PPT', pptx: 'PPTX', hwp: 'HWP', hwpx: 'HWPX',
    jpg: 'IMG', jpeg: 'IMG', png: 'IMG', webp: 'IMG'
  };
  const state = {
    options: null,
    active: null,
    requestNumber: 0,
    abortController: null,
    pdfDocument: null,
    pdfRenderTask: null,
    pptxViewer: null,
    pptxObserver: null,
    hwpDocument: null,
    objectUrls: new Set(),
    scripts: new Map(),
    modules: new Map(),
    dom: null
  };

  const nameOf = file => String(file?.file_name || file?.original_name || '첨부파일');
  const sizeOf = file => Number(file?.file_size || file?.size_bytes || 0);
  const extensionOf = file => {
    const name = nameOf(file);
    const part = name.split('.').pop();
    return part && part !== name ? part.toLowerCase() : '';
  };
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const formatBytes = bytes => {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${Math.round(value / 1024 / 1024 * 10) / 10} MB`;
  };

  function loadScript(url, globalCheck) {
    if (globalCheck?.()) return Promise.resolve();
    if (state.scripts.has(url)) return state.scripts.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => globalCheck && !globalCheck()
        ? reject(new Error('미리보기 구성요소를 초기화하지 못했습니다.'))
        : resolve();
      script.onerror = () => reject(new Error('미리보기 구성요소를 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });
    state.scripts.set(url, promise);
    return promise;
  }

  function loadModule(url) {
    if (!state.modules.has(url)) state.modules.set(url, import(url));
    return state.modules.get(url);
  }

  function injectStyles() {
    if (document.getElementById('attachment-preview-styles')) return;
    const style = document.createElement('style');
    style.id = 'attachment-preview-styles';
    style.textContent = `
      .ap-overlay{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:16px;background:rgba(18,29,39,.66)}
      .ap-overlay.ap-hidden{display:none}.ap-modal{width:min(1120px,98vw);height:min(880px,95vh);display:flex;flex-direction:column;overflow:hidden;border-radius:15px;background:#fff;box-shadow:0 25px 70px rgba(12,24,34,.32);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}
      .ap-head{min-height:64px;padding:11px 14px 11px 17px;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid #e3e8eb;background:#fff}.ap-title{display:flex;align-items:center;gap:11px;min-width:0}.ap-icon{width:42px;height:42px;display:grid;place-items:center;flex:none;border-radius:10px;background:#edf5fd;color:#2773ad;font-size:10px;font-weight:850}.ap-title-copy{min-width:0}.ap-title-copy strong{display:block;max-width:660px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#24313a;font-size:14px}.ap-title-copy span{display:block;margin-top:4px;color:#89949c;font-size:9.5px}.ap-head-actions,.ap-toolbar{display:flex;align-items:center;gap:7px}.ap-button{height:34px;padding:0 11px;border:1px solid #dce2e6;border-radius:8px;background:#fff;color:#667681;font-size:10px;font-weight:760;cursor:pointer}.ap-button:hover{background:#f5f8fa}.ap-button:disabled{opacity:.42;cursor:default}.ap-close{width:34px;padding:0;font-size:18px}.ap-toolbar{min-height:44px;padding:6px 14px;border-bottom:1px solid #e5eaed;background:#f7f9fa;overflow-x:auto}.ap-toolbar:empty{display:none}.ap-spacer{flex:1}.ap-counter{min-width:72px;text-align:center;color:#596a75;font-size:10px;font-weight:760}.ap-body{position:relative;flex:1;min-height:0;overflow:auto;background:#edf1f4;padding:16px}.ap-center{min-height:100%;display:grid;place-items:center;padding:40px 20px;text-align:center;color:#77858f;font-size:12px;line-height:1.7}.ap-center strong{display:block;margin-bottom:7px;color:#455560;font-size:14px}.ap-center .ap-large-icon{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:16px;background:#fff;color:#40789e;font-size:13px;font-weight:850;box-shadow:0 6px 18px rgba(34,55,70,.08)}.ap-link{display:inline-flex;height:35px;align-items:center;margin-top:14px;padding:0 12px;border-radius:8px;background:#2878d4;color:#fff;text-decoration:none;font-size:10px;font-weight:780}
      .ap-pdf-stage{min-height:100%;display:grid;place-items:start center}.ap-pdf-canvas{display:block;max-width:100%;height:auto;background:#fff;box-shadow:0 5px 22px rgba(30,49,63,.17)}.ap-image-stage,.ap-hwp-stage{min-width:100%;min-height:100%;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;padding:4px 4px 24px}.ap-image,.ap-hwp-page{display:block;flex:none;max-width:none;max-height:none;border-radius:7px;background:#fff;box-shadow:0 5px 22px rgba(30,49,63,.13);user-select:none}.ap-hwp-page{border-radius:2px}
      .ap-sheet{min-width:100%;border-collapse:collapse;background:#fff;font-size:10px}.ap-sheet th,.ap-sheet td{padding:6px 8px;border:1px solid #dfe5e9;white-space:nowrap}.ap-sheet th{position:sticky;top:-16px;z-index:2;background:#f5f7f8;color:#60717c}.ap-sheet-limit{margin-bottom:9px;padding:8px 10px;border-radius:7px;background:#fff7df;color:#8b6a28;font-size:9.5px}.ap-docx{min-height:100%;padding:16px;background:#dfe4e8;border-radius:8px}.ap-docx .docx-wrapper{padding:16px!important;background:transparent!important}.ap-pptx{min-height:100%;display:flex;align-items:flex-start;justify-content:center;overflow:visible;box-sizing:border-box;padding:12px 12px 32px;border-radius:8px;background:#ccd4db}.ap-pptx>div{max-width:none;flex:none}.ap-web-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}.ap-note{position:absolute;left:14px;right:14px;bottom:12px;z-index:3;padding:9px 11px;border-radius:8px;background:rgba(32,43,53,.9);color:#fff;text-align:center;font-size:9.5px;line-height:1.5}.ap-error{color:#b94e47}
      @media(max-width:680px){.ap-overlay{padding:5px}.ap-modal{width:100%;height:98vh}.ap-title-copy strong{max-width:45vw}.ap-head{padding-left:10px}.ap-body{padding:8px}.ap-toolbar{padding:6px 8px}.ap-button{padding:0 8px}.ap-docx{padding:4px}.ap-docx .docx-wrapper{padding:4px!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (state.dom) return state.dom;
    injectStyles();
    const overlay = document.createElement('div');
    overlay.className = 'ap-overlay ap-hidden';
    overlay.innerHTML = `
      <section class="ap-modal" role="dialog" aria-modal="true" aria-labelledby="ap-preview-name">
        <header class="ap-head">
          <div class="ap-title"><span class="ap-icon" data-ap="icon">FILE</span><div class="ap-title-copy"><strong id="ap-preview-name" data-ap="name">첨부파일</strong><span data-ap="meta">읽기 전용 미리보기</span></div></div>
          <div class="ap-head-actions"><button class="ap-button" type="button" data-ap="download">다운로드</button><button class="ap-button ap-close" type="button" data-ap="close" aria-label="닫기">×</button></div>
        </header>
        <nav class="ap-toolbar" data-ap="toolbar" aria-label="미리보기 도구"></nav>
        <div class="ap-body" data-ap="body"><div class="ap-center">파일을 선택하세요.</div></div>
      </section>`;
    document.body.appendChild(overlay);
    const get = role => overlay.querySelector(`[data-ap="${role}"]`);
    state.dom = { overlay, icon: get('icon'), name: get('name'), meta: get('meta'), download: get('download'), close: get('close'), toolbar: get('toolbar'), body: get('body') };
    state.dom.close.addEventListener('click', close);
    state.dom.download.addEventListener('click', async () => {
      if (!state.active || !state.options?.download) return;
      state.dom.download.disabled = true;
      try { await state.options.download(state.active); }
      finally { state.dom.download.disabled = false; }
    });
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.classList.contains('ap-hidden')) close(); });
    return state.dom;
  }

  function button(label, handler, title) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'ap-button';
    element.textContent = label;
    if (title) element.title = title;
    element.addEventListener('click', handler);
    return element;
  }

  function resetRenderState() {
    state.requestNumber += 1;
    state.abortController?.abort();
    state.abortController = new AbortController();
    try { state.pdfRenderTask?.cancel(); } catch (_) { /* no-op */ }
    try { state.pdfDocument?.destroy(); } catch (_) { /* no-op */ }
    try { state.pptxViewer?.destroy(); } catch (_) { /* no-op */ }
    try { state.pptxObserver?.disconnect(); } catch (_) { /* no-op */ }
    try { state.hwpDocument?.free(); } catch (_) { /* no-op */ }
    state.pdfRenderTask = null;
    state.pdfDocument = null;
    state.pptxViewer = null;
    state.pptxObserver = null;
    state.hwpDocument = null;
    for (const url of state.objectUrls) URL.revokeObjectURL(url);
    state.objectUrls.clear();
    if (state.dom) {
      state.dom.toolbar.replaceChildren();
      state.dom.body.replaceChildren();
    }
  }

  function showLoading(message = '미리보기를 준비하는 중입니다...') {
    state.dom.body.innerHTML = `<div class="ap-center" role="status">${escapeHtml(message)}</div>`;
  }

  function showError(message) {
    state.dom.toolbar.replaceChildren();
    state.dom.body.innerHTML = `<div class="ap-center ap-error"><div><span class="ap-large-icon">!</span><strong>미리보기를 열지 못했습니다.</strong>${escapeHtml(message)}</div></div>`;
  }

  async function fetchBuffer(url, signal) {
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`파일을 불러오지 못했습니다 (${response.status}).`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length > state.options.maxPreviewBytes) throw new Error('웹 미리보기 허용 크기를 초과했습니다. 다운로드하여 확인해 주세요.');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > state.options.maxPreviewBytes) throw new Error('웹 미리보기 허용 크기를 초과했습니다. 다운로드하여 확인해 주세요.');
    return buffer;
  }

  function renderImage(url, name) {
    let scale = 1;
    let naturalWidth = 0;
    let naturalHeight = 0;
    const stage = document.createElement('div');
    stage.className = 'ap-image-stage';
    const image = document.createElement('img');
    image.className = 'ap-image';
    image.src = url;
    image.alt = name;
    const counter = document.createElement('span');
    counter.className = 'ap-counter';
    const applyScale = () => {
      if (!naturalWidth || !naturalHeight) return;
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      image.style.width = `${width}px`;
      image.style.height = `${height}px`;
      stage.style.width = `${Math.max(state.dom.body.clientWidth - 32, width + 8)}px`;
      counter.textContent = `${Math.round(scale * 100)}%`;
    };
    const fit = () => {
      if (!naturalWidth || !naturalHeight) return;
      const widthScale = Math.max(.1, (state.dom.body.clientWidth - 48) / naturalWidth);
      const heightScale = Math.max(.1, (state.dom.body.clientHeight - 48) / naturalHeight);
      scale = Math.min(1, widthScale, heightScale);
      applyScale();
    };
    const zoomOut = button('－', () => { scale = Math.max(.1, scale - .1); applyScale(); }, '축소');
    const zoomIn = button('＋', () => { scale = Math.min(5, scale + .1); applyScale(); }, '확대');
    const actual = button('100%', () => { scale = 1; applyScale(); }, '원본 크기');
    const fitButton = button('화면 맞춤', fit);
    const spacer = document.createElement('span');
    spacer.className = 'ap-spacer';
    state.dom.toolbar.replaceChildren(fitButton, actual, spacer, zoomOut, counter, zoomIn);
    image.addEventListener('load', () => {
      naturalWidth = image.naturalWidth;
      naturalHeight = image.naturalHeight;
      fit();
    }, { once: true });
    image.addEventListener('error', () => showError('이미지를 불러오지 못했습니다.'), { once: true });
    stage.appendChild(image);
    state.dom.body.replaceChildren(stage);
  }

  let textMeasureContext = null;
  let textMeasureFont = '';

  async function ensureRhwp() {
    global.measureTextWidth = (font, text) => {
      textMeasureContext ||= document.createElement('canvas').getContext('2d');
      if (!textMeasureContext) return String(text || '').length * 8;
      if (font !== textMeasureFont) {
        textMeasureContext.font = font;
        textMeasureFont = font;
      }
      return textMeasureContext.measureText(String(text || '')).width;
    };
    const module = await loadModule(ASSETS.rhwp);
    await module.default({ module_or_path: ASSETS.rhwpWasm });
    return module;
  }

  async function renderHangul(ticket, requestNumber) {
    const [buffer, module] = await Promise.all([
      fetchBuffer(ticket.source_url, state.abortController.signal),
      ensureRhwp()
    ]);
    if (requestNumber !== state.requestNumber) return;
    const documentModel = new module.HwpDocument(new Uint8Array(buffer));
    if (requestNumber !== state.requestNumber) return documentModel.free();
    state.hwpDocument = documentModel;
    const pageCount = documentModel.pageCount();
    if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('표시할 한글 문서 페이지가 없습니다.');
    let pageNumber = 0;
    let scale = 1;
    let pageRenderNumber = 0;
    let currentUrl = '';
    let naturalWidth = 0;
    let naturalHeight = 0;
    const previous = button('◀ 이전', () => { if (pageNumber > 0) { pageNumber -= 1; draw(true); } });
    const pageCounter = document.createElement('span');
    pageCounter.className = 'ap-counter';
    const next = button('다음 ▶', () => { if (pageNumber < pageCount - 1) { pageNumber += 1; draw(true); } });
    const zoomCounter = document.createElement('span');
    zoomCounter.className = 'ap-counter';
    const applyScale = image => {
      if (!naturalWidth || !naturalHeight) return;
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      image.style.width = `${width}px`;
      image.style.height = `${height}px`;
      image.parentElement.style.width = `${Math.max(state.dom.body.clientWidth - 32, width + 8)}px`;
      zoomCounter.textContent = `${Math.round(scale * 100)}%`;
    };
    const fit = () => {
      const image = state.dom.body.querySelector('.ap-hwp-page');
      if (!image || !naturalWidth) return;
      scale = Math.min(1.25, Math.max(.2, (state.dom.body.clientWidth - 48) / naturalWidth));
      applyScale(image);
    };
    const zoomOut = button('－', () => {
      const image = state.dom.body.querySelector('.ap-hwp-page');
      if (image) { scale = Math.max(.2, scale - .1); applyScale(image); }
    }, '축소');
    const zoomIn = button('＋', () => {
      const image = state.dom.body.querySelector('.ap-hwp-page');
      if (image) { scale = Math.min(4, scale + .1); applyScale(image); }
    }, '확대');
    const actual = button('100%', () => {
      const image = state.dom.body.querySelector('.ap-hwp-page');
      if (image) { scale = 1; applyScale(image); }
    }, '원본 크기');
    const fitButton = button('너비 맞춤', fit);
    const spacer = document.createElement('span');
    spacer.className = 'ap-spacer';
    state.dom.toolbar.replaceChildren(previous, pageCounter, next, spacer, fitButton, actual, zoomOut, zoomCounter, zoomIn);

    async function draw(resetToFit) {
      const renderNumber = ++pageRenderNumber;
      const svg = documentModel.renderPageSvg(pageNumber);
      if (requestNumber !== state.requestNumber || renderNumber !== pageRenderNumber) return;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      state.objectUrls.add(url);
      const stage = document.createElement('div');
      stage.className = 'ap-hwp-stage';
      const image = document.createElement('img');
      image.className = 'ap-hwp-page';
      image.alt = `한글 문서 ${pageNumber + 1}페이지`;
      image.addEventListener('load', () => {
        if (requestNumber !== state.requestNumber || renderNumber !== pageRenderNumber) return;
        naturalWidth = image.naturalWidth;
        naturalHeight = image.naturalHeight;
        if (resetToFit) fit(); else applyScale(image);
        if (currentUrl && currentUrl !== url) {
          URL.revokeObjectURL(currentUrl);
          state.objectUrls.delete(currentUrl);
        }
        currentUrl = url;
      }, { once: true });
      image.addEventListener('error', () => showError('한글 문서 페이지를 표시하지 못했습니다.'), { once: true });
      image.src = url;
      stage.appendChild(image);
      state.dom.body.replaceChildren(stage);
      previous.disabled = pageNumber <= 0;
      next.disabled = pageNumber >= pageCount - 1;
      pageCounter.textContent = `${pageNumber + 1} / ${pageCount}`;
    }
    await draw(true);
  }

  async function renderPdf(ticket, requestNumber) {
    const pdfjsLib = await loadModule(ASSETS.pdf);
    if (requestNumber !== state.requestNumber) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = ASSETS.pdfWorker;
    const task = pdfjsLib.getDocument({ url: ticket.source_url });
    const pdfDocument = await task.promise;
    if (requestNumber !== state.requestNumber) return pdfDocument.destroy();
    state.pdfDocument = pdfDocument;
    let pageNumber = 1;
    let scale = Math.min(1.45, Math.max(.7, (state.dom.body.clientWidth - 36) / 820));
    const previous = button('◀ 이전', () => { if (pageNumber > 1) { pageNumber -= 1; draw(); } });
    const counter = document.createElement('span');
    counter.className = 'ap-counter';
    const next = button('다음 ▶', () => { if (pageNumber < pdfDocument.numPages) { pageNumber += 1; draw(); } });
    const zoomOut = button('－', () => { scale = Math.max(.5, scale - .15); draw(); }, '축소');
    const zoomIn = button('＋', () => { scale = Math.min(3, scale + .15); draw(); }, '확대');
    state.dom.toolbar.replaceChildren(previous, counter, next, document.createElement('span'), zoomOut, zoomIn);
    state.dom.toolbar.children[3].className = 'ap-spacer';

    async function draw() {
      try { state.pdfRenderTask?.cancel(); } catch (_) { /* no-op */ }
      const page = await pdfDocument.getPage(pageNumber);
      if (requestNumber !== state.requestNumber) return;
      const ratio = Math.min(global.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = document.createElement('canvas');
      canvas.className = 'ap-pdf-canvas';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
      const stage = document.createElement('div');
      stage.className = 'ap-pdf-stage';
      stage.appendChild(canvas);
      state.dom.body.replaceChildren(stage);
      previous.disabled = pageNumber <= 1;
      next.disabled = pageNumber >= pdfDocument.numPages;
      counter.textContent = `${pageNumber} / ${pdfDocument.numPages}`;
      state.pdfRenderTask = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport });
      try { await state.pdfRenderTask.promise; } catch (error) { if (error?.name !== 'RenderingCancelledException') throw error; }
    }
    await draw();
  }

  async function ensureXlsx() {
    await loadScript(ASSETS.xlsx, () => Boolean(global.XLSX));
  }

  async function renderSpreadsheet(ticket, requestNumber) {
    const [buffer] = await Promise.all([fetchBuffer(ticket.source_url, state.abortController.signal), ensureXlsx()]);
    if (requestNumber !== state.requestNumber) return;
    const workbook = global.XLSX.read(buffer, { type: 'array', cellDates: true });
    const toolbar = state.dom.toolbar;
    const body = state.dom.body;
    toolbar.replaceChildren();
    const showSheet = sheetName => {
      const rows = global.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
      const clippedRows = rows.slice(0, 500).map(row => row.slice(0, 100));
      const width = Math.min(100, Math.max(1, ...clippedRows.map(row => row.length)));
      const fragment = document.createDocumentFragment();
      if (rows.length > 500 || rows.some(row => row.length > 100)) {
        const note = document.createElement('div');
        note.className = 'ap-sheet-limit';
        note.textContent = '빠른 미리보기를 위해 최대 500행 × 100열까지만 표시합니다. 전체 내용은 다운로드하여 확인하세요.';
        fragment.appendChild(note);
      }
      const table = document.createElement('table');
      table.className = 'ap-sheet';
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (let index = 0; index < width; index += 1) {
        const cell = document.createElement('th');
        cell.textContent = String(index + 1);
        headRow.appendChild(cell);
      }
      head.appendChild(headRow);
      const tableBody = document.createElement('tbody');
      for (const row of clippedRows) {
        const rowElement = document.createElement('tr');
        for (let index = 0; index < width; index += 1) {
          const cell = document.createElement('td');
          cell.textContent = String(row[index] ?? '');
          rowElement.appendChild(cell);
        }
        tableBody.appendChild(rowElement);
      }
      table.append(head, tableBody);
      fragment.appendChild(table);
      body.replaceChildren(fragment);
      toolbar.querySelectorAll('.ap-button').forEach(item => item.classList.toggle('active', item.dataset.sheet === sheetName));
    };
    workbook.SheetNames.forEach((sheetName, index) => {
      const tab = button(sheetName, () => showSheet(sheetName));
      tab.dataset.sheet = sheetName;
      if (index === 0) tab.classList.add('active');
      toolbar.appendChild(tab);
    });
    if (!workbook.SheetNames.length) throw new Error('표시할 시트가 없습니다.');
    showSheet(workbook.SheetNames[0]);
  }

  async function renderDocx(ticket, requestNumber) {
    const [buffer] = await Promise.all([
      fetchBuffer(ticket.source_url, state.abortController.signal),
      loadScript(ASSETS.jszip, () => Boolean(global.JSZip)).then(() => loadScript(ASSETS.docx, () => Boolean(global.docx?.renderAsync)))
    ]);
    if (requestNumber !== state.requestNumber) return;
    const container = document.createElement('div');
    container.className = 'ap-docx';
    state.dom.toolbar.replaceChildren();
    state.dom.body.replaceChildren(container);
    await global.docx.renderAsync(buffer, container, container, {
      className: 'docx', inWrapper: true, breakPages: true,
      ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true,
      renderFootnotes: true, renderEndnotes: true, renderComments: false,
      renderAltChunks: false, useBase64URL: true
    });
  }

  function repairPptxTextClipping(container) {
    const repair = () => {
      if (!container.isConnected) return;
      for (const textBox of container.querySelectorAll('div')) {
        if (textBox.dataset.apPptTextFixed === 'true') continue;
        const directParagraphs = [...textBox.children].filter(child =>
          child.tagName === 'DIV' && child.style.width === '100%' && child.textContent.trim()
        );
        if (!directParagraphs.length || textBox.style.position !== 'absolute' || textBox.style.flexDirection !== 'column') continue;
        const overflow = Math.max(0, textBox.scrollHeight - textBox.clientHeight);
        const needsRepair = ['hidden', 'clip'].includes(textBox.style.overflowY) || (overflow > 0 && overflow <= 12);
        if (!needsRepair) continue;
        textBox.dataset.apPptTextFixed = 'true';
        textBox.style.setProperty('overflow-y', 'visible', 'important');
        const lastParagraph = directParagraphs.at(-1);
        lastParagraph.style.setProperty('overflow', 'visible', 'important');
        lastParagraph.style.setProperty('padding-bottom', '2px', 'important');
        if (textBox.style.height && textBox.style.height !== 'auto') {
          const height = textBox.getBoundingClientRect().height;
          if (height > 0) textBox.style.height = `${Math.ceil(height + Math.min(6, overflow + 2))}px`;
        }
      }
    };
    const schedule = () => requestAnimationFrame(() => requestAnimationFrame(repair));
    schedule();
    document.fonts?.ready?.then(schedule).catch(() => {});
    state.pptxObserver = new MutationObserver(schedule);
    state.pptxObserver.observe(container, { childList: true, subtree: true });
    return schedule;
  }

  async function renderPptx(ticket, requestNumber) {
    const [buffer, module] = await Promise.all([
      fetchBuffer(ticket.source_url, state.abortController.signal),
      loadModule(ASSETS.pptx)
    ]);
    if (requestNumber !== state.requestNumber) return;
    const container = document.createElement('div');
    container.className = 'ap-pptx';
    state.dom.body.replaceChildren(container);
    const viewer = await module.PptxViewer.open(buffer, container, {
      renderMode: 'slide',
      fitMode: 'contain',
      zipLimits: module.RECOMMENDED_ZIP_LIMITS,
      lazySlides: true,
      lazyMedia: true,
      signal: state.abortController.signal,
      pdfjs: { moduleUrl: ASSETS.pdf, workerUrl: ASSETS.pdfWorker }
    });
    if (requestNumber !== state.requestNumber) return viewer.destroy();
    state.pptxViewer = viewer;
    const scheduleTextRepair = repairPptxTextClipping(container);
    let slide = Math.max(0, viewer.currentSlideIndex || 0);
    let zoom = 100;
    const previous = button('◀ 이전', async () => { if (slide > 0) await viewer.goToSlide(slide - 1); });
    const counter = document.createElement('span');
    counter.className = 'ap-counter';
    const next = button('다음 ▶', async () => { if (slide < viewer.slideCount - 1) await viewer.goToSlide(slide + 1); });
    const zoomOut = button('－', async () => { zoom = Math.max(40, zoom - 20); await viewer.setZoom(zoom); }, '축소');
    const zoomIn = button('＋', async () => { zoom = Math.min(300, zoom + 20); await viewer.setZoom(zoom); }, '확대');
    const spacer = document.createElement('span');
    spacer.className = 'ap-spacer';
    const update = event => {
      slide = Number.isInteger(event?.detail?.index) ? event.detail.index : Math.max(0, viewer.currentSlideIndex || 0);
      previous.disabled = slide <= 0;
      next.disabled = slide >= viewer.slideCount - 1;
      counter.textContent = `${slide + 1} / ${viewer.slideCount}`;
      scheduleTextRepair();
    };
    viewer.addEventListener('slidechange', update);
    state.dom.toolbar.replaceChildren(previous, counter, next, spacer, zoomOut, zoomIn);
    update();
  }

  function renderNativePdf(ticket) {
    state.dom.toolbar.replaceChildren();
    state.dom.body.innerHTML = `<iframe class="ap-web-frame" src="${escapeHtml(ticket.source_url)}#view=FitH" title="PDF 미리보기"></iframe><div class="ap-note">PDF 전용 뷰어를 불러오지 못해 브라우저 기본 PDF 뷰어로 표시합니다.</div>`;
  }

  function renderWebViewer(ticket, extension, message) {
    const primaryOffice = OFFICE_FALLBACK.has(extension);
    const url = primaryOffice ? ticket.office_viewer_url : ticket.viewer_url;
    const alternate = primaryOffice ? ticket.viewer_url : ticket.office_viewer_url;
    const frame = document.createElement('iframe');
    frame.className = 'ap-web-frame';
    frame.src = url || alternate || ticket.source_url;
    frame.title = `${extension.toUpperCase()} 웹 미리보기`;
    frame.referrerPolicy = 'no-referrer';
    const note = document.createElement('div');
    note.className = 'ap-note';
    note.textContent = message || '웹 문서뷰어에서 표시되지 않으면 원본을 다운로드해 확인하세요.';
    state.dom.body.replaceChildren(frame, note);
    state.dom.toolbar.replaceChildren();
    if (url && alternate) {
      const first = button(primaryOffice ? 'Office 웹뷰어' : '문서 웹뷰어', () => { frame.src = url; });
      const second = button(primaryOffice ? '문서 웹뷰어' : 'Office 웹뷰어', () => { frame.src = alternate; });
      state.dom.toolbar.append(first, second);
    }
  }

  function renderUnsupported(extension) {
    state.dom.toolbar.replaceChildren();
    state.dom.body.innerHTML = `<div class="ap-center"><div><span class="ap-large-icon">${escapeHtml(ICONS[extension] || 'FILE')}</span><strong>이 형식은 웹 미리보기를 지원하지 않습니다.</strong>상단의 다운로드 버튼으로 원본 파일을 확인해 주세요.</div></div>`;
  }

  async function open(file) {
    if (!state.options?.getPreviewTicket) throw new Error('AttachmentPreview.init()을 먼저 호출해야 합니다.');
    const dom = ensureModal();
    resetRenderState();
    state.active = file;
    const extension = extensionOf(file);
    const requestNumber = state.requestNumber;
    dom.icon.textContent = ICONS[extension] || 'FILE';
    dom.name.textContent = nameOf(file);
    dom.meta.textContent = `${extension ? extension.toUpperCase() : 'FILE'} · ${formatBytes(sizeOf(file))} · 읽기 전용`;
    dom.download.hidden = !state.options.download;
    dom.overlay.classList.remove('ap-hidden');
    showLoading();
    try {
      const ticket = await state.options.getPreviewTicket(file);
      if (requestNumber !== state.requestNumber) return;
      if (!ticket?.source_url) throw new Error('미리보기 주소를 발급받지 못했습니다.');
      if (IMAGE_EXTENSIONS.has(extension)) return renderImage(ticket.source_url, nameOf(file));
      if (extension === 'pdf') {
        try { return await renderPdf(ticket, requestNumber); }
        catch (error) { if (error?.name === 'AbortError') return; console.warn('PDF.js preview fallback', error); return renderNativePdf(ticket); }
      }
      if (extension === 'xls' || extension === 'xlsx') {
        try { return await renderSpreadsheet(ticket, requestNumber); }
        catch (error) { if (error?.name === 'AbortError') return; console.warn('Spreadsheet preview fallback', error); return renderWebViewer(ticket, extension, '브라우저 표 변환에 실패해 Office 웹뷰어로 표시합니다.'); }
      }
      if (extension === 'docx') {
        try { return await renderDocx(ticket, requestNumber); }
        catch (error) { if (error?.name === 'AbortError') return; console.warn('DOCX preview fallback', error); return renderWebViewer(ticket, extension, '브라우저 문서 변환에 실패해 Office 웹뷰어로 표시합니다.'); }
      }
      if (extension === 'pptx') {
        try { return await renderPptx(ticket, requestNumber); }
        catch (error) { if (error?.name === 'AbortError') return; console.warn('PPTX preview fallback', error); return renderWebViewer(ticket, extension, '브라우저 슬라이드 렌더링에 실패해 Office 웹뷰어로 표시합니다.'); }
      }
      if (HANGUL_FALLBACK.has(extension)) {
        try { return await renderHangul(ticket, requestNumber); }
        catch (error) { if (error?.name === 'AbortError') return; console.warn('HWP/HWPX preview fallback', error); return renderWebViewer(ticket, extension, '브라우저 한글 문서 렌더링에 실패해 외부 문서뷰어로 표시합니다.'); }
      }
      if (OFFICE_FALLBACK.has(extension)) return renderWebViewer(ticket, extension);
      renderUnsupported(extension);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        showError(error?.message || '파일을 미리 볼 수 없습니다.');
        state.options.onError?.(error, file);
      }
    }
  }

  function close() {
    resetRenderState();
    state.active = null;
    state.dom?.overlay.classList.add('ap-hidden');
  }

  global.AttachmentPreview = {
    init(options) {
      if (!options || typeof options.getPreviewTicket !== 'function') throw new Error('getPreviewTicket 함수가 필요합니다.');
      state.options = {
        getPreviewTicket: options.getPreviewTicket,
        download: typeof options.download === 'function' ? options.download : null,
        onError: typeof options.onError === 'function' ? options.onError : null,
        maxPreviewBytes: Number(options.maxPreviewBytes || 25 * 1024 * 1024)
      };
      ensureModal();
      return this;
    },
    open,
    close,
    isSupported(fileName) {
      return ['pdf', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'hwp', 'hwpx', 'jpg', 'jpeg', 'png', 'webp'].includes(extensionOf({ file_name: fileName }));
    }
  };
})(window);
