/* Resource preview interaction layer: fast prewarm, one-shot fit, keyboard paging, wheel zoom and editable percentage. */
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
  let pdfZoomRequest=0;
  let pdfFitWidth=0;
  let pdfFitHeight=0;
  let pptZoomRequest=0;
  let pptNativeZoom=100;

  function preload(href,rel,as){
    if(document.querySelector(`link[data-resource-preview-prewarm="${href}"]`))return;
    const link=document.createElement('link');
    link.rel=rel;link.href=href;if(as)link.as=as;link.fetchPriority='high';link.dataset.resourcePreviewPrewarm=href;
    document.head.appendChild(link);
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
    return previewBody.querySelector('.ap-image,.ap-hwp-page,.ap-pdf-canvas,.ap-pptx>div,.ap-docx .docx-wrapper,.ap-sheet');
  }
  function isPdfTarget(el){return !!el?.classList?.contains('ap-pdf-canvas')}
  function isPptTarget(el){return !!el?.parentElement?.classList?.contains('ap-pptx')}
  function isDocxTarget(el){return !!el?.closest?.('.ap-docx')}
  function isSheetTarget(el){return !!el?.classList?.contains('ap-sheet')}
  function isFlowZoomTarget(el){return isDocxTarget(el)||isSheetTarget(el)}
  function isManual(){return body()?.dataset.resourceManualZoom==='1'}

  function cleanLegacyControls(){
    document.querySelectorAll('.ap-fit-state').forEach(node=>node.remove());
    for(const item of buttons()){
      const text=(item.textContent||'').trim();
      if(text==='＋'||text==='－')item.classList.add('ap-legacy-zoom-control');
      if(text==='100%')item.classList.add('ap-legacy-actual-control');
    }
    for(const counter of toolbar()?.querySelectorAll('.ap-counter')||[]){
      const text=(counter.textContent||'').trim();
      if(/^\d+(?:\.\d+)?%$/.test(text))counter.classList.add('ap-legacy-zoom-counter');
    }
  }

  function ensureZoomInput(){
    const bar=toolbar();if(!bar)return null;
    let wrap=bar.querySelector('.ap-zoom-editor');
    if(!wrap){
      wrap=document.createElement('label');
      wrap.className='ap-zoom-editor';
      wrap.title='확대/축소 배율 입력';
      const input=document.createElement('input');
      input.className='ap-zoom-input';input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;
      input.setAttribute('aria-label','미리보기 확대 축소 비율');
      const suffix=document.createElement('span');suffix.textContent='%';
      wrap.append(input,suffix);bar.append(wrap);
      const commit=()=>setZoom(input.value);
      input.addEventListener('change',commit);
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'){event.preventDefault();commit();input.blur()}
      });
      input.addEventListener('focus',()=>input.select());
    }
    const input=wrap.querySelector('.ap-zoom-input');
    if(document.activeElement!==input)input.value=String(Math.round(zoomPercent*10)/10).replace(/\.0$/,'');
    return input;
  }

  function clearTargetZoom(el){
    if(!el)return;
    el.style.removeProperty('zoom');
    el.style.removeProperty('transform');
    el.style.removeProperty('transform-origin');
    el.style.removeProperty('margin-right');
    el.style.removeProperty('margin-bottom');
    if(isPdfTarget(el)){
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      el.style.removeProperty('max-width');
      el.style.removeProperty('max-height');
    }
    if(isPptTarget(el)){
      if(el.style.getPropertyPriority('width')==='important')el.style.removeProperty('width');
      if(el.style.getPropertyPriority('height')==='important')el.style.removeProperty('height');
      if(el.style.getPropertyPriority('max-width')==='important')el.style.removeProperty('max-width');
      if(el.style.getPropertyPriority('max-height')==='important')el.style.removeProperty('max-height');
    }
  }

  function recordBase(el,width,height,{force=false}={}){
    if(!el)return;
    if(el===lastTarget&&isManual()&&!force)return;
    const rect=el.getBoundingClientRect();
    const w=Number(width||rect.width||0),h=Number(height||rect.height||0);
    if(!w||!h)return;
    baseWidth=Math.max(1,w);baseHeight=Math.max(1,h);lastTarget=el;zoomPercent=100;
    if(isPdfTarget(el)){pdfFitWidth=baseWidth;pdfFitHeight=baseHeight;pdfZoomRequest+=1}
    if(isPptTarget(el)){pptNativeZoom=100;pptZoomRequest+=1}
    const previewBody=body();
    if(previewBody){delete previewBody.dataset.resourceManualZoom;previewBody.classList.remove('ap-manual-zoom')}
    clearTargetZoom(el);
    cleanLegacyControls();ensureZoomInput();
  }

  function capturePdfNativeSize(el){
    if(!isPdfTarget(el))return;
    if(!el.dataset.resourcePdfNativeWidth){
      const rect=el.getBoundingClientRect();
      const width=Number.parseFloat(el.style.width)||rect.width;
      const height=Number.parseFloat(el.style.height)||rect.height;
      if(width>0)el.dataset.resourcePdfNativeWidth=String(width);
      if(height>0)el.dataset.resourcePdfNativeHeight=String(height);
    }
  }
  function nativePdfWidth(el){capturePdfNativeSize(el);return Number(el?.dataset?.resourcePdfNativeWidth||0)}
  function nativePdfHeight(el){capturePdfNativeSize(el);return Number(el?.dataset?.resourcePdfNativeHeight||0)}

  function refreshTarget(){
    const el=target();if(!el)return null;
    if(el!==lastTarget){
      if(isPdfTarget(el)&&isManual()&&pdfFitWidth&&pdfFitHeight){
        capturePdfNativeSize(el);lastTarget=el;return el;
      }
      if(isPptTarget(el)&&isManual()&&baseWidth&&baseHeight){
        lastTarget=el;return el;
      }
      if(el.dataset.resourceFitWidth&&el.dataset.resourceFitHeight){
        recordBase(el,Number(el.dataset.resourceFitWidth),Number(el.dataset.resourceFitHeight));
      }else{
        requestAnimationFrame(()=>{
          const current=target();
          if(current===el&&current!==lastTarget){const rect=current.getBoundingClientRect();if(rect.width&&rect.height)recordBase(current,rect.width,rect.height)}
        });
      }
    }
    return el;
  }

  function applyFlowZoom(el,factor,width,height){
    el.style.removeProperty('width');
    el.style.removeProperty('height');
    el.style.removeProperty('max-width');
    el.style.removeProperty('max-height');
    if('zoom' in el.style){
      el.style.removeProperty('transform');
      el.style.removeProperty('transform-origin');
      el.style.removeProperty('margin-right');
      el.style.removeProperty('margin-bottom');
      el.style.setProperty('zoom',String(factor),'important');
    }else{
      el.style.removeProperty('zoom');
      el.style.setProperty('transform',`scale(${factor})`,'important');
      el.style.setProperty('transform-origin','top left','important');
      el.style.setProperty('margin-right',`${Math.max(0,width-baseWidth)}px`,'important');
      el.style.setProperty('margin-bottom',`${Math.max(0,height-baseHeight)}px`,'important');
    }
    const docx=el.closest?.('.ap-docx');
    if(docx)docx.style.setProperty('overflow','visible','important');
  }

  function applyStageSize(el,width,height){
    const previewBody=body();
    const stage=el?.closest?.('.ap-image-stage,.ap-hwp-stage,.ap-pdf-stage,.ap-pptx');
    if(!stage)return;
    const bodyWidth=Math.max(0,(previewBody?.clientWidth||0)-8);
    const bodyHeight=Math.max(0,(previewBody?.clientHeight||0)-8);
    stage.style.setProperty('width',`${Math.max(bodyWidth,width+16)}px`,'important');
    stage.style.setProperty('height',`${Math.max(bodyHeight,height+24)}px`,'important');
    stage.style.setProperty('min-width',`${Math.max(bodyWidth,width+16)}px`,'important');
    stage.style.setProperty('min-height',`${Math.max(bodyHeight,height+24)}px`,'important');
    stage.style.setProperty('align-items','flex-start','important');
    stage.style.setProperty('justify-content','center','important');
  }

  function waitForPdfCanvas(previous,ticket){
    return new Promise(resolve=>{
      const started=performance.now();
      const poll=()=>{
        if(ticket!==pdfZoomRequest)return resolve(null);
        const next=body()?.querySelector('.ap-pdf-canvas')||null;
        if(next&&next!==previous){capturePdfNativeSize(next);lastTarget=next;return resolve(next)}
        if(performance.now()-started>1200)return resolve(next);
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  function applyPdfDisplay(el,width,height){
    if(!el)return;
    el.style.removeProperty('zoom');
    el.style.removeProperty('transform');
    el.style.removeProperty('transform-origin');
    el.style.setProperty('width',`${width}px`,'important');
    el.style.setProperty('height',`${height}px`,'important');
    el.style.setProperty('max-width','none','important');
    el.style.setProperty('max-height','none','important');
    applyStageSize(el,width,height);
  }

  async function applyPdfZoom(value){
    const previewBody=body();
    let canvas=previewBody?.querySelector('.ap-pdf-canvas')||null;
    if(!canvas||!pdfFitWidth||!pdfFitHeight)return false;
    const ticket=++pdfZoomRequest;
    const factor=value/100;
    const width=Math.max(1,Math.round(pdfFitWidth*factor));
    const height=Math.max(1,Math.round(pdfFitHeight*factor));
    if(previewBody){previewBody.dataset.resourceManualZoom='1';previewBody.classList.add('ap-manual-zoom')}
    capturePdfNativeSize(canvas);
    let nativeWidth=nativePdfWidth(canvas)||canvas.getBoundingClientRect().width;
    let nativeHeight=nativePdfHeight(canvas)||canvas.getBoundingClientRect().height;
    const zoomIn=button(text=>text==='＋');
    let attempts=0;

    while(zoomIn&&nativeWidth+1<width&&attempts<24){
      const previous=canvas;
      zoomIn.click();
      const next=await waitForPdfCanvas(previous,ticket);
      if(!next||ticket!==pdfZoomRequest)return false;
      canvas=next;
      const nextWidth=nativePdfWidth(canvas)||canvas.getBoundingClientRect().width;
      const nextHeight=nativePdfHeight(canvas)||canvas.getBoundingClientRect().height;
      attempts+=1;
      if(nextWidth<=nativeWidth+.5)break;
      nativeWidth=nextWidth;nativeHeight=nextHeight;
    }

    if(ticket!==pdfZoomRequest)return false;
    if(nativeWidth>0&&nativeHeight>0){
      const nativeRatio=nativeHeight/nativeWidth;
      applyPdfDisplay(canvas,width,Math.max(1,Math.round(width*nativeRatio)));
    }else{
      applyPdfDisplay(canvas,width,height);
    }
    lastTarget=canvas;
    const input=ensureZoomInput();
    if(input&&document.activeElement!==input)input.value=String(Math.round(value*10)/10).replace(/\.0$/,'');
    return true;
  }

  function normalizePptZoom(value){
    return Math.min(300,Math.max(40,Math.round(Number(value||100)/20)*20));
  }

  function waitForPptZoom(previous,previousRect,ticket){
    return new Promise(resolve=>{
      const started=performance.now();
      const poll=()=>{
        if(ticket!==pptZoomRequest)return resolve(null);
        const next=body()?.querySelector('.ap-pptx>div')||null;
        if(next){
          const rect=next.getBoundingClientRect();
          if(next!==previous||Math.abs(rect.width-previousRect.width)>.5||Math.abs(rect.height-previousRect.height)>.5){
            lastTarget=next;return resolve(next);
          }
        }
        if(performance.now()-started>900){if(next)lastTarget=next;return resolve(next)}
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  async function applyPptZoom(value){
    const previewBody=body();
    let slide=previewBody?.querySelector('.ap-pptx>div')||null;
    if(!slide)return false;
    const desired=normalizePptZoom(value);
    const ticket=++pptZoomRequest;
    if(previewBody){previewBody.dataset.resourceManualZoom='1';previewBody.classList.add('ap-manual-zoom')}
    clearTargetZoom(slide);
    const zoomOut=button(text=>text==='－');
    const zoomIn=button(text=>text==='＋');
    let attempts=0;

    while(ticket===pptZoomRequest&&pptNativeZoom<desired&&zoomIn&&attempts<16){
      const previous=slide;
      const previousRect=previous.getBoundingClientRect();
      zoomIn.click();
      pptNativeZoom=Math.min(300,pptNativeZoom+20);
      slide=await waitForPptZoom(previous,previousRect,ticket);
      if(!slide)return false;
      attempts+=1;
    }
    while(ticket===pptZoomRequest&&pptNativeZoom>desired&&zoomOut&&attempts<32){
      const previous=slide;
      const previousRect=previous.getBoundingClientRect();
      zoomOut.click();
      pptNativeZoom=Math.max(40,pptNativeZoom-20);
      slide=await waitForPptZoom(previous,previousRect,ticket);
      if(!slide)return false;
      attempts+=1;
    }
    if(ticket!==pptZoomRequest)return false;

    zoomPercent=pptNativeZoom;
    clearTargetZoom(slide);
    const rect=slide.getBoundingClientRect();
    applyStageSize(slide,Math.max(1,rect.width),Math.max(1,rect.height));
    lastTarget=slide;
    const input=ensureZoomInput();
    if(input&&document.activeElement!==input)input.value=String(pptNativeZoom);
    return true;
  }

  function applyZoom(percent){
    const el=refreshTarget();if(!el)return false;
    if((!baseWidth||!baseHeight)&&el){const rect=el.getBoundingClientRect();recordBase(el,rect.width,rect.height)}
    if(!baseWidth||!baseHeight)return false;
    let value=Math.min(500,Math.max(10,Number(percent)||100));
    const previewBody=body();
    if(previewBody){previewBody.dataset.resourceManualZoom='1';previewBody.classList.add('ap-manual-zoom')}
    if(isPdfTarget(el)){zoomPercent=value;void applyPdfZoom(value);return true}
    if(isPptTarget(el)){value=normalizePptZoom(value);zoomPercent=value;void applyPptZoom(value);return true}
    zoomPercent=value;
    const factor=value/100;
    const width=Math.max(1,Math.round(baseWidth*factor));
    const height=Math.max(1,Math.round(baseHeight*factor));

    if(isFlowZoomTarget(el)){
      applyFlowZoom(el,factor,width,height);
    }else{
      el.style.removeProperty('zoom');
      el.style.removeProperty('transform');el.style.removeProperty('transform-origin');
      el.style.setProperty('width',`${width}px`,'important');
      el.style.setProperty('height',`${height}px`,'important');
      el.style.setProperty('max-width','none','important');
      el.style.setProperty('max-height','none','important');
    }

    applyStageSize(el,width,height);
    const input=ensureZoomInput();
    if(input&&document.activeElement!==input)input.value=String(Math.round(value*10)/10).replace(/\.0$/,'');
    return true;
  }

  function setZoom(raw){
    const value=Number(String(raw??'').replace(/[^0-9.]/g,''));
    applyZoom(Number.isFinite(value)&&value>0?value:100);
  }
  function stepZoom(direction){
    const el=refreshTarget();
    const step=isPptTarget(el)?20:10;
    applyZoom(zoomPercent+(direction>0?step:-step));
  }
  function resetForPageChange(){
    pdfZoomRequest+=1;pdfFitWidth=0;pdfFitHeight=0;
    pptZoomRequest+=1;pptNativeZoom=100;
    clearTargetZoom(lastTarget);
    const docx=lastTarget?.closest?.('.ap-docx');if(docx)docx.style.removeProperty('overflow');
    lastTarget=null;baseWidth=0;baseHeight=0;zoomPercent=100;
    const previewBody=body();if(previewBody){delete previewBody.dataset.resourceManualZoom;previewBody.classList.remove('ap-manual-zoom')}
    const input=ensureZoomInput();if(input)input.value='100';
  }
  function page(direction){
    const targetButton=direction<0?button(text=>text.startsWith('◀ 이전')):button(text=>text.startsWith('다음 ▶'));
    if(targetButton&&!targetButton.disabled){resetForPageChange();targetButton.click()}
  }
  function onKeydown(event){
    if(!modal()||event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();page(-1)}
    else if(event.key==='ArrowRight'){event.preventDefault();page(1)}
  }
  function onWheel(event){
    const previewBody=body();if(!previewBody||!previewBody.contains(event.target))return;
    if(event.target?.closest?.('.ap-web-frame'))return;
    if(!refreshTarget())return;
    event.preventDefault();
    wheelDelta+=event.deltaY;
    if(wheelTimer)return;
    wheelTimer=setTimeout(()=>{
      const delta=wheelDelta;wheelDelta=0;wheelTimer=0;
      if(Math.abs(delta)<1)return;
      stepZoom(delta<0?1:-1);
    },45);
  }
  function install(){
    if(!modal())return;
    cleanLegacyControls();ensureZoomInput();refreshTarget();
  }

  prewarm();
  document.addEventListener('resource-preview:fit',event=>{
    const previewBody=body();
    if(previewBody?.dataset.resourceManualZoom==='1'&&event.detail?.target===lastTarget)return;
    recordBase(event.detail?.target,event.detail?.width,event.detail?.height,{force:true});
  });
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('wheel',onWheel,{passive:false,capture:true});
  document.addEventListener('pointerover',event=>{if(event.target?.closest?.('.file-card'))prewarm()},{passive:true});
  document.addEventListener('click',event=>{
    const item=event.target.closest?.('.ap-button');if(!item)return;
    const text=(item.textContent||'').trim();
    if(text.startsWith('◀ 이전')||text.startsWith('다음 ▶'))resetForPageChange();
    if(/화면 맞춤|너비 맞춤/.test(text)){
      resetForPageChange();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const el=target();if(el){const rect=el.getBoundingClientRect();if(rect.width&&rect.height)recordBase(el,rect.width,rect.height,{force:true})}
        install();
      }));
    }
  },true);
  observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
