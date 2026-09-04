/* Resource preview interaction layer: prewarm renderers, keyboard paging, wheel zoom and editable percentage. */
(function(){
  'use strict';
  if(location.pathname!=='/resources')return;

  let wheelTimer=0;
  let wheelDelta=0;
  let lastTarget=null;
  let baseWidth=0;
  let baseHeight=0;
  let zoomPercent=100;
  let observer=null;

  function preload(href,rel,as){
    if(document.querySelector(`link[data-resource-preview-prewarm="${href}"]`))return;
    const link=document.createElement('link');link.rel=rel;link.href=href;if(as)link.as=as;link.fetchPriority='high';link.dataset.resourcePreviewPrewarm=href;document.head.appendChild(link);
  }
  function prewarm(){
    preload('/vendor/attachment-preview/pdf.min.mjs','modulepreload');
    preload('/vendor/attachment-preview/pptx-renderer.es.js','modulepreload');
    preload('/vendor/attachment-preview/rhwp.js','modulepreload');
    preload('/vendor/attachment-preview/jszip.min.js','preload','script');
    preload('/vendor/attachment-preview/docx-preview.min.js','preload','script');
    preload('/vendor/attachment-preview/xlsx.full.min.js','preload','script');
    preload('/vendor/attachment-preview/pdf.worker.min.mjs','prefetch');
    preload('/vendor/attachment-preview/rhwp_bg.wasm','prefetch');
  }
  function modal(){const overlay=document.querySelector('.ap-overlay:not(.ap-hidden)');return overlay?.querySelector('.ap-modal')||null}
  function body(){return modal()?.querySelector('.ap-body')||null}
  function toolbar(){return modal()?.querySelector('.ap-toolbar')||null}
  function buttons(){return [...(toolbar()?.querySelectorAll('.ap-button')||[])]}
  function button(match){return buttons().find(item=>match((item.textContent||'').trim()))||null}
  function target(){
    const previewBody=body();if(!previewBody)return null;
    return previewBody.querySelector('.ap-image,.ap-hwp-page,.ap-pdf-canvas,.ap-pptx>div');
  }
  function cleanLegacyControls(){
    document.querySelectorAll('.ap-fit-state').forEach(node=>node.remove());
    for(const item of buttons()){
      const text=(item.textContent||'').trim();
      if(text==='＋'||text==='－')item.classList.add('ap-legacy-zoom-control');
    }
    const bar=toolbar();if(!bar)return;
    const zoomButtons=buttons().filter(item=>['＋','－'].includes((item.textContent||'').trim()));
    for(const item of zoomButtons){
      const sibling=item.previousElementSibling;
      if(sibling?.classList?.contains('ap-counter')&&!/\//.test(sibling.textContent||''))sibling.classList.add('ap-legacy-zoom-counter');
      const next=item.nextElementSibling;
      if(next?.classList?.contains('ap-counter')&&!/\//.test(next.textContent||''))next.classList.add('ap-legacy-zoom-counter');
    }
  }
  function ensureZoomInput(){
    const bar=toolbar();if(!bar)return null;
    let wrap=bar.querySelector('.ap-zoom-editor');
    if(!wrap){
      wrap=document.createElement('label');wrap.className='ap-zoom-editor';wrap.title='확대/축소 배율 입력';
      const input=document.createElement('input');input.className='ap-zoom-input';input.type='text';input.inputMode='numeric';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','미리보기 확대 축소 비율');
      const suffix=document.createElement('span');suffix.textContent='%';
      wrap.append(input,suffix);bar.append(wrap);
      const commit=()=>setZoom(input.value);
      input.addEventListener('change',commit);
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();input.blur()}});
      input.addEventListener('focus',()=>input.select());
    }
    const input=wrap.querySelector('.ap-zoom-input');
    if(document.activeElement!==input)input.value=String(Math.round(zoomPercent));
    return input;
  }
  function recordBase(el,width,height){
    if(!el)return;
    const rect=el.getBoundingClientRect();
    baseWidth=Math.max(1,Number(width||rect.width||0));
    baseHeight=Math.max(1,Number(height||rect.height||0));
    lastTarget=el;zoomPercent=100;
    const previewBody=body();if(previewBody){delete previewBody.dataset.resourceManualZoom;previewBody.classList.remove('ap-manual-zoom')}
    cleanLegacyControls();ensureZoomInput();
  }
  function refreshTarget(){
    const el=target();if(!el)return null;
    if(el!==lastTarget){
      if(el.dataset.resourceFitWidth&&el.dataset.resourceFitHeight)recordBase(el,Number(el.dataset.resourceFitWidth),Number(el.dataset.resourceFitHeight));
      else requestAnimationFrame(()=>{
        const current=target();if(current===el&&current!==lastTarget){const rect=current.getBoundingClientRect();if(rect.width&&rect.height)recordBase(current,rect.width,rect.height)}
      });
    }
    return el;
  }
  function applyZoom(percent){
    const el=refreshTarget();if(!el||!baseWidth||!baseHeight)return false;
    const value=Math.min(500,Math.max(10,Number(percent)||100));
    zoomPercent=value;
    const previewBody=body();
    if(previewBody){previewBody.dataset.resourceManualZoom='1';previewBody.classList.add('ap-manual-zoom')}
    const width=Math.max(1,Math.round(baseWidth*value/100));
    const height=Math.max(1,Math.round(baseHeight*value/100));
    el.style.setProperty('width',`${width}px`,'important');
    el.style.setProperty('height',`${height}px`,'important');
    el.style.setProperty('max-width','none','important');
    el.style.setProperty('max-height','none','important');
    const stage=el.closest('.ap-image-stage,.ap-hwp-stage,.ap-pdf-stage,.ap-pptx');
    if(stage){
      stage.style.setProperty('width',`${Math.max(previewBody?.clientWidth||0,width)}px`,'important');
      stage.style.setProperty('height',`${Math.max(previewBody?.clientHeight||0,height)}px`,'important');
      stage.style.setProperty('align-items','center','important');
      stage.style.setProperty('justify-content','center','important');
    }
    const input=ensureZoomInput();if(input&&document.activeElement!==input)input.value=String(Math.round(value));
    return true;
  }
  function setZoom(raw){
    const value=Number(String(raw??'').replace(/[^0-9.]/g,''));
    applyZoom(Number.isFinite(value)&&value>0?value:100);
  }
  function stepZoom(direction){applyZoom(zoomPercent+(direction>0?10:-10))}
  function resetForPageChange(){
    lastTarget=null;baseWidth=0;baseHeight=0;zoomPercent=100;
    const previewBody=body();if(previewBody){delete previewBody.dataset.resourceManualZoom;previewBody.classList.remove('ap-manual-zoom')}
    const input=ensureZoomInput();if(input)input.value='100';
  }
  function page(direction){
    resetForPageChange();
    const targetButton=direction<0?button(text=>text.startsWith('◀ 이전')):button(text=>text.startsWith('다음 ▶'));
    if(targetButton&&!targetButton.disabled)targetButton.click();
  }
  function onKeydown(event){
    if(!modal()||event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();page(-1)}
    else if(event.key==='ArrowRight'){event.preventDefault();page(1)}
  }
  function onWheel(event){
    const previewBody=body();if(!previewBody||!previewBody.contains(event.target))return;
    if(event.target?.closest?.('.ap-sheet,.ap-docx,.ap-web-frame'))return;
    if(!refreshTarget())return;
    event.preventDefault();wheelDelta+=event.deltaY;
    if(wheelTimer)return;
    wheelTimer=setTimeout(()=>{const delta=wheelDelta;wheelDelta=0;wheelTimer=0;if(Math.abs(delta)<1)return;stepZoom(delta<0?1:-1)},55);
  }
  function install(){
    if(!modal())return;
    cleanLegacyControls();ensureZoomInput();refreshTarget();
  }

  prewarm();
  document.addEventListener('resource-preview:fit',event=>recordBase(event.detail?.target,event.detail?.width,event.detail?.height));
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('wheel',onWheel,{passive:false,capture:true});
  document.addEventListener('pointerover',event=>{if(event.target?.closest?.('.file-card'))prewarm()},{passive:true});
  document.addEventListener('click',event=>{
    const item=event.target.closest?.('.ap-button');if(!item)return;
    const text=(item.textContent||'').trim();
    if(text.startsWith('◀ 이전')||text.startsWith('다음 ▶'))resetForPageChange();
    if(/화면 맞춤|너비 맞춤/.test(text)){resetForPageChange();requestAnimationFrame(()=>requestAnimationFrame(install))}
    if(text==='100%'){applyZoom(100)}
  },true);
  observer=new MutationObserver(install);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
