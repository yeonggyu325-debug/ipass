/* Resource preview controller: native renderer state first, cursor-anchored wheel zoom, intent-based prewarm. */
(function(){
  'use strict';
  if(location.pathname!=='/resources')return;

  let wheelTimer=0;
  let wheelDelta=0;
  let wheelAnchor=null;
  let wheelBusy=false;
  let previewKey='';
  let flowTarget=null;
  let flowBaseWidth=0;
  let flowBaseHeight=0;

  function modal(){const overlay=document.querySelector('.ap-overlay:not(.ap-hidden)');return overlay?.querySelector('.ap-modal')||null}
  function body(){return modal()?.querySelector('.ap-body')||null}
  function toolbar(){return modal()?.querySelector('.ap-toolbar')||null}
  function buttons(){return [...(toolbar()?.querySelectorAll('.ap-button')||[])]}
  function button(match){return buttons().find(item=>match((item.textContent||'').trim()))||null}
  function imageTarget(){return body()?.querySelector('.ap-image')||null}
  function hwpTarget(){return body()?.querySelector('.ap-hwp-page')||null}
  function pdfTarget(){return body()?.querySelector('.ap-pdf-canvas')||null}
  function pptTarget(){return body()?.querySelector('.ap-pptx>div')||null}
  function flowZoomTarget(){return body()?.querySelector('.ap-docx .docx-wrapper,.ap-sheet')||null}
  function previewType(){
    if(pdfTarget())return'pdf';
    if(pptTarget())return'pptx';
    if(hwpTarget())return'hwp';
    if(imageTarget())return'image';
    const flow=flowZoomTarget();
    if(flow?.closest('.ap-docx'))return'docx';
    if(flow?.classList.contains('ap-sheet'))return'xlsx';
    if(body()?.querySelector('.ap-web-frame'))return'web';
    return'';
  }
  function zoomTarget(type=previewType()){
    if(type==='pdf')return pdfTarget();
    if(type==='pptx')return pptTarget();
    if(type==='hwp')return hwpTarget();
    if(type==='image')return imageTarget();
    if(type==='docx'||type==='xlsx')return flowZoomTarget();
    return null;
  }

  function preloadAsset(href,rel){
    if(!href||document.querySelector(`link[data-resource-preview-prewarm="${href}"]`))return;
    const link=document.createElement('link');
    link.rel=rel;link.href=href;link.dataset.resourcePreviewPrewarm=href;
    document.head.appendChild(link);
  }
  function extensionFromText(value){
    const match=String(value||'').match(/\.([a-z0-9]{2,5})(?:$|[\s)\]}>,'"])/i);
    return match?.[1]?.toLowerCase()||'';
  }
  function extensionHint(node){
    let el=node instanceof Element?node:null;
    for(let depth=0;el&&depth<5;depth+=1,el=el.parentElement){
      const values=[
        el.getAttribute('data-file-name'),el.getAttribute('data-filename'),el.getAttribute('data-name'),
        el.getAttribute('data-extension'),el.getAttribute('data-ext'),el.getAttribute('title'),el.getAttribute('aria-label'),
        (el.textContent||'').slice(0,500)
      ];
      for(const value of values){const ext=extensionFromText(value);if(ext)return ext}
    }
    return'';
  }
  function prewarmForExtension(extension){
    const ext=String(extension||'').toLowerCase();
    if(ext==='pdf'){
      preloadAsset('/vendor/attachment-preview/pdf.min.mjs','modulepreload');
      preloadAsset('/vendor/attachment-preview/pdf.worker.min.mjs','prefetch');
    }else if(ext==='pptx'){
      preloadAsset('/vendor/attachment-preview/pptx-renderer.es.js','modulepreload');
    }else if(ext==='hwp'||ext==='hwpx'){
      preloadAsset('/vendor/attachment-preview/rhwp.js','modulepreload');
      preloadAsset('/vendor/attachment-preview/rhwp_bg.wasm','prefetch');
    }
  }
  function prewarmFromNode(node){const ext=extensionHint(node);if(ext)prewarmForExtension(ext)}

  function cleanLegacyControls(){
    document.querySelectorAll('.ap-fit-state').forEach(node=>node.remove());
    for(const item of buttons()){
      const text=(item.textContent||'').trim();
      item.classList.toggle('ap-legacy-zoom-control',text==='＋'||text==='－');
      item.classList.toggle('ap-legacy-actual-control',text==='100%');
    }
    for(const counter of toolbar()?.querySelectorAll('.ap-counter')||[]){
      const text=(counter.textContent||'').trim();
      counter.classList.toggle('ap-legacy-zoom-counter',/^\d+(?:\.\d+)?%$/.test(text));
    }
  }

  function nativeCounterPercent(){
    for(const counter of toolbar()?.querySelectorAll('.ap-counter')||[]){
      const match=(counter.textContent||'').trim().match(/^(\d+(?:\.\d+)?)%$/);
      if(match)return Number(match[1]);
    }
    return null;
  }
  function initialPdfScale(){
    const previewBody=body();
    return Math.min(1.45,Math.max(.7,((previewBody?.clientWidth||856)-36)/820));
  }
  function currentPercent(){
    const previewBody=body();
    const type=previewType();
    if(type==='image'||type==='hwp')return nativeCounterPercent()??100;
    if(type==='pdf'){
      const scale=Number(previewBody?.dataset.resourcePdfScale||initialPdfScale());
      return Math.round(scale*1000)/10;
    }
    if(type==='pptx')return Number(previewBody?.dataset.resourcePptZoom||100);
    if(type==='docx'||type==='xlsx')return Number(previewBody?.dataset.resourceFlowZoom||100);
    return 100;
  }

  function ensureZoomEditor(){
    const bar=toolbar();if(!bar)return null;
    let wrap=bar.querySelector('.ap-zoom-editor');
    if(!wrap){
      wrap=document.createElement('label');wrap.className='ap-zoom-editor';wrap.title='확대/축소 배율 입력';
      const input=document.createElement('input');input.className='ap-zoom-input';input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','미리보기 확대 축소 비율');
      const suffix=document.createElement('span');suffix.textContent='%';
      wrap.append(input,suffix);bar.append(wrap);
      const commit=()=>setZoom(input.value);
      input.addEventListener('change',commit);
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();input.blur()}});
      input.addEventListener('focus',()=>input.select());
    }
    const input=wrap.querySelector('.ap-zoom-input');
    if(document.activeElement!==input)input.value=String(Math.round(currentPercent()*10)/10).replace(/\.0$/,'');
    return input;
  }

  function updateEditor(){const input=ensureZoomEditor();if(input&&document.activeElement!==input)input.value=String(Math.round(currentPercent()*10)/10).replace(/\.0$/,'')}
  function markManual(){const previewBody=body();if(previewBody){previewBody.dataset.resourceManualZoom='1';previewBody.classList.add('ap-manual-zoom')}}

  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function nextPaint(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}
  function waitForCanvas(previous,timeout=900){
    return new Promise(resolve=>{
      const started=performance.now();
      const poll=()=>{
        const next=pdfTarget();
        if(next&&next!==previous)return resolve(next);
        if(performance.now()-started>=timeout)return resolve(next);
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  function captureZoomAnchor(event){
    const type=previewType(),el=zoomTarget(type),previewBody=body();
    if(!type||!el||!previewBody)return null;
    const rect=el.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    const x=Number(event.clientX),y=Number(event.clientY);
    if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return null;
    return{
      type,
      ratioX:Math.min(1,Math.max(0,(x-rect.left)/rect.width)),
      ratioY:Math.min(1,Math.max(0,(y-rect.top)/rect.height)),
      clientX:x,clientY:y
    };
  }
  function restoreZoomAnchor(anchor){
    if(!anchor||previewType()!==anchor.type)return;
    const previewBody=body(),el=zoomTarget(anchor.type);if(!previewBody||!el)return;
    const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const pointX=rect.left+rect.width*anchor.ratioX;
    const pointY=rect.top+rect.height*anchor.ratioY;
    previewBody.scrollLeft+=pointX-anchor.clientX;
    previewBody.scrollTop+=pointY-anchor.clientY;
  }

  async function setImageOrHwpZoom(value,type){
    const min=type==='hwp'?20:10,max=type==='hwp'?400:500;
    const desired=Math.min(max,Math.max(min,Math.round(value/10)*10));
    let current=currentPercent();
    const plus=button(text=>text==='＋'),minus=button(text=>text==='－');
    if(!plus||!minus)return false;
    markManual();
    let guard=0;
    while(current+1<desired&&guard++<60){plus.click();current=currentPercent()}
    guard=0;
    while(current-1>desired&&guard++<60){minus.click();current=currentPercent()}
    updateEditor();return true;
  }

  async function setPdfZoom(value){
    const previewBody=body();
    if(!previewBody||!pdfTarget())return false;
    const desiredScale=Math.min(3,Math.max(.5,value/100));
    let scale=Number(previewBody.dataset.resourcePdfScale||initialPdfScale());
    const plus=button(text=>text==='＋'),minus=button(text=>text==='－');
    if(!plus||!minus)return false;
    markManual();
    let guard=0;
    while(scale+.075<desiredScale&&guard++<24){
      const previous=pdfTarget();plus.click();scale=Math.min(3,scale+.15);previewBody.dataset.resourcePdfScale=String(scale);await waitForCanvas(previous);
    }
    guard=0;
    while(scale-.075>desiredScale&&guard++<24){
      const previous=pdfTarget();minus.click();scale=Math.max(.5,scale-.15);previewBody.dataset.resourcePdfScale=String(scale);await waitForCanvas(previous);
    }
    updateEditor();return true;
  }

  async function setPptZoom(value){
    const previewBody=body();if(!previewBody||!pptTarget())return false;
    const desired=Math.min(300,Math.max(40,Math.round(value/20)*20));
    let current=Number(previewBody.dataset.resourcePptZoom||100);
    const plus=button(text=>text==='＋'),minus=button(text=>text==='－');
    if(!plus||!minus)return false;
    markManual();
    let guard=0;
    while(current<desired&&guard++<16){plus.click();current=Math.min(300,current+20);previewBody.dataset.resourcePptZoom=String(current);await wait(55)}
    guard=0;
    while(current>desired&&guard++<16){minus.click();current=Math.max(40,current-20);previewBody.dataset.resourcePptZoom=String(current);await wait(55)}
    updateEditor();return true;
  }

  function resetFlowTarget(){flowTarget=null;flowBaseWidth=0;flowBaseHeight=0}
  function setFlowZoom(value){
    const previewBody=body(),el=flowZoomTarget();if(!previewBody||!el)return false;
    if(el!==flowTarget){
      flowTarget=el;
      const rect=el.getBoundingClientRect();flowBaseWidth=Math.max(1,rect.width);flowBaseHeight=Math.max(1,rect.height);
    }
    const desired=Math.min(500,Math.max(10,value));
    const factor=desired/100;
    markManual();previewBody.dataset.resourceFlowZoom=String(desired);
    el.style.removeProperty('transform');el.style.removeProperty('transform-origin');el.style.removeProperty('margin-right');el.style.removeProperty('margin-bottom');
    el.style.setProperty('zoom',String(factor),'important');
    const docx=el.closest('.ap-docx');if(docx)docx.style.setProperty('overflow','visible','important');
    updateEditor();return true;
  }

  async function setZoom(raw){
    const parsed=Number(String(raw??'').replace(/[^0-9.]/g,''));
    const value=Number.isFinite(parsed)&&parsed>0?parsed:100;
    const type=previewType();
    if(type==='image'||type==='hwp')return setImageOrHwpZoom(value,type);
    if(type==='pdf')return setPdfZoom(value);
    if(type==='pptx')return setPptZoom(value);
    if(type==='docx'||type==='xlsx')return setFlowZoom(value);
    return false;
  }

  function resetForNewPreview(){
    const previewBody=body();
    if(previewBody){delete previewBody.dataset.resourceManualZoom;delete previewBody.dataset.resourcePdfScale;delete previewBody.dataset.resourcePptZoom;delete previewBody.dataset.resourceFlowZoom;previewBody.classList.remove('ap-manual-zoom')}
    resetFlowTarget();wheelDelta=0;wheelAnchor=null;
  }
  function syncPreviewIdentity(){
    const currentModal=modal();if(!currentModal){previewKey='';return false}
    const key=(currentModal.querySelector('[data-ap="name"]')?.textContent||'').trim();
    if(key&&key!==previewKey){previewKey=key;resetForNewPreview();prewarmForExtension(extensionFromText(key))}
    return true;
  }

  function page(direction){
    const control=direction<0?button(text=>text.startsWith('◀ 이전')):button(text=>text.startsWith('다음 ▶'));
    if(control&&!control.disabled){control.click();setTimeout(()=>{resetFlowTarget();cleanLegacyControls();updateEditor()},80)}
  }
  function onKeydown(event){
    if(!modal()||event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();page(-1)}
    else if(event.key==='ArrowRight'){event.preventDefault();page(1)}
  }

  function scheduleWheelFlush(){
    if(wheelTimer)return;
    wheelTimer=setTimeout(()=>{
      wheelTimer=0;
      if(wheelBusy){scheduleWheelFlush();return}
      void flushWheelZoom();
    },45);
  }
  async function flushWheelZoom(){
    const delta=wheelDelta,anchor=wheelAnchor;
    wheelDelta=0;wheelAnchor=null;
    if(Math.abs(delta)<1)return;
    const type=previewType();if(!type||type==='web')return;
    const step=type==='pptx'?20:(type==='pdf'?15:10);
    wheelBusy=true;
    try{
      await setZoom(currentPercent()+(delta<0?step:-step));
      await nextPaint();restoreZoomAnchor(anchor);
      await nextPaint();restoreZoomAnchor(anchor);
    }finally{
      wheelBusy=false;
      if(Math.abs(wheelDelta)>=1)scheduleWheelFlush();
    }
  }
  function onWheel(event){
    const previewBody=body();if(!previewBody||!previewBody.contains(event.target)||event.target?.closest?.('.ap-web-frame'))return;
    const type=previewType();if(!type||type==='web')return;
    event.preventDefault();
    wheelDelta+=event.deltaY;
    wheelAnchor=captureZoomAnchor(event)||wheelAnchor;
    scheduleWheelFlush();
  }
  function install(){
    if(!syncPreviewIdentity())return;
    cleanLegacyControls();ensureZoomEditor();
  }

  document.addEventListener('pointerover',event=>prewarmFromNode(event.target),{passive:true});
  document.addEventListener('pointerdown',event=>prewarmFromNode(event.target),{passive:true,capture:true});
  document.addEventListener('focusin',event=>prewarmFromNode(event.target),true);
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('wheel',onWheel,{passive:false,capture:true});
  document.addEventListener('click',event=>{
    const item=event.target.closest?.('.ap-button');if(!item)return;
    const text=(item.textContent||'').trim();
    if(text.startsWith('◀ 이전')||text.startsWith('다음 ▶'))setTimeout(updateEditor,80);
    if(/화면 맞춤|너비 맞춤/.test(text))setTimeout(()=>{const previewBody=body();if(previewBody){delete previewBody.dataset.resourceManualZoom;previewBody.classList.remove('ap-manual-zoom')}updateEditor()},80);
  },true);
  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
