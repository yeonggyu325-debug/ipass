/* Resource preview interaction layer: prewarm renderers, keyboard paging, wheel zoom. */
(function(){
  'use strict';
  if(location.pathname!=='/resources')return;

  let wheelTimer=0;
  let wheelDelta=0;

  function preload(href,rel,as){
    if(document.querySelector(`link[data-resource-preview-prewarm="${href}"]`))return;
    const link=document.createElement('link');
    link.rel=rel;
    link.href=href;
    if(as)link.as=as;
    link.fetchPriority='high';
    link.dataset.resourcePreviewPrewarm=href;
    document.head.appendChild(link);
  }
  function prewarm(){
    preload('/vendor/attachment-preview/pdf.min.mjs','modulepreload');
    preload('/vendor/attachment-preview/pptx-renderer.es.js','modulepreload');
    preload('/vendor/attachment-preview/rhwp.js','modulepreload');
    preload('/vendor/attachment-preview/jszip.min.js','preload','script');
    preload('/vendor/attachment-preview/docx-preview.min.js','preload','script');
    preload('/vendor/attachment-preview/pdf.worker.min.mjs','prefetch');
    preload('/vendor/attachment-preview/rhwp_bg.wasm','prefetch');
  }
  function modal(){
    const overlay=document.querySelector('.ap-overlay:not(.ap-hidden)');
    return overlay?.querySelector('.ap-modal')||null;
  }
  function body(){return modal()?.querySelector('.ap-body')||null}
  function buttons(){return [...(modal()?.querySelectorAll('.ap-toolbar .ap-button')||[])]}
  function button(match){return buttons().find(item=>match((item.textContent||'').trim()))||null}
  function cleanupLabel(){document.querySelectorAll('.ap-fit-state').forEach(node=>node.remove())}
  function page(direction){
    const target=direction<0?button(text=>text.startsWith('◀ 이전')):button(text=>text.startsWith('다음 ▶'));
    if(target&&!target.disabled)target.click();
  }
  function zoom(direction){
    const target=button(text=>text===(direction>0?'＋':'－'));
    if(!target||target.disabled)return false;
    body()?.classList.add('ap-manual-zoom');
    target.click();
    cleanupLabel();
    return true;
  }
  function onKeydown(event){
    if(!modal()||event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();page(-1)}
    else if(event.key==='ArrowRight'){event.preventDefault();page(1)}
  }
  function onWheel(event){
    const previewBody=body();
    if(!previewBody||!previewBody.contains(event.target))return;
    if(event.target?.closest?.('.ap-sheet,.ap-docx,.ap-web-frame'))return;
    if(!button(text=>text==='＋')||!button(text=>text==='－'))return;
    event.preventDefault();
    wheelDelta+=event.deltaY;
    if(wheelTimer)return;
    wheelTimer=setTimeout(()=>{
      const delta=wheelDelta;wheelDelta=0;wheelTimer=0;
      if(Math.abs(delta)<1)return;
      zoom(delta<0?1:-1);
    },70);
  }

  prewarm();
  cleanupLabel();
  const observer=new MutationObserver(cleanupLabel);
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('wheel',onWheel,{passive:false,capture:true});
  document.addEventListener('pointerover',event=>{if(event.target?.closest?.('.file-card'))prewarm()},{passive:true});
})();
