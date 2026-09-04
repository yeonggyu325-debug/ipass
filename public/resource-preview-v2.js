(function(){
  'use strict';
  if(location.pathname!=='/resources')return;

  document.body.classList.add('ehs-resource-preview-v2');

  let frame=0;
  let resizeObserver=null;
  let mutationObserver=null;
  let observedModal=null;
  const fittedTargets=new WeakSet();

  function visibleModal(){
    const overlay=document.querySelector('.ap-overlay:not(.ap-hidden)');
    return overlay?.querySelector('.ap-modal')||null;
  }
  function body(){return visibleModal()?.querySelector('.ap-body')||null}
  function toolbar(){return visibleModal()?.querySelector('.ap-toolbar')||null}
  function manualZoomActive(){return body()?.dataset.resourceManualZoom==='1'}
  function usableSize(){
    const el=body();if(!el)return{width:0,height:0};
    const cs=getComputedStyle(el);
    const width=Math.max(0,el.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0)-8);
    const height=Math.max(0,el.clientHeight-parseFloat(cs.paddingTop||0)-parseFloat(cs.paddingBottom||0)-8);
    return{width,height};
  }
  function dimensions(el){
    if(el instanceof HTMLImageElement){
      const w=Number(el.naturalWidth||0),h=Number(el.naturalHeight||0);return w&&h?{width:w,height:h}:null;
    }
    if(el instanceof HTMLCanvasElement){
      const rect=el.getBoundingClientRect();
      const ratio=Math.max(1,Math.min(Number(window.devicePixelRatio||1),2));
      const w=Number(el.width||0)/ratio||rect.width;
      const h=Number(el.height||0)/ratio||rect.height;
      return w&&h?{width:w,height:h}:null;
    }
    const rect=el.getBoundingClientRect();return rect.width&&rect.height?{width:rect.width,height:rect.height}:null;
  }
  function currentTarget(){return body()?.querySelector('.ap-image,.ap-hwp-page,.ap-pdf-canvas')||null}
  function setFit(el){
    const source=dimensions(el),space=usableSize();if(!source||!space.width||!space.height)return false;
    const scale=Math.min(space.width/source.width,space.height/source.height);
    if(!Number.isFinite(scale)||scale<=0)return false;
    const width=Math.max(1,Math.floor(source.width*scale));
    const height=Math.max(1,Math.floor(source.height*scale));
    el.style.setProperty('width',`${width}px`,'important');
    el.style.setProperty('height',`${height}px`,'important');
    el.style.setProperty('max-width','none','important');
    el.style.setProperty('max-height','none','important');
    el.dataset.resourceFit='1';
    el.dataset.resourceFitWidth=String(width);
    el.dataset.resourceFitHeight=String(height);
    const stage=el.closest('.ap-image-stage,.ap-hwp-stage,.ap-pdf-stage');
    if(stage){
      stage.style.setProperty('width','100%','important');
      stage.style.setProperty('height','100%','important');
      stage.style.setProperty('min-width','0','important');
      stage.style.setProperty('min-height','0','important');
      stage.style.setProperty('align-items','center','important');
      stage.style.setProperty('justify-content','center','important');
    }
    fittedTargets.add(el);
    document.dispatchEvent(new CustomEvent('resource-preview:fit',{detail:{target:el,width,height}}));
    return true;
  }
  function fitTarget(el,force=false){
    if(!el||(!force&&manualZoomActive())||(!force&&fittedTargets.has(el)))return;
    if(el instanceof HTMLImageElement&&!el.complete){
      if(el.dataset.resourceFitWait!=='1'){
        el.dataset.resourceFitWait='1';
        el.addEventListener('load',()=>scheduleFit(el,force),{once:true});
      }
      return;
    }
    setFit(el);
  }
  function scheduleFit(target=currentTarget(),force=false){
    if(!target||(!force&&manualZoomActive()))return;
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      frame=0;
      requestAnimationFrame(()=>fitTarget(target,force));
    });
  }
  function installFitControl(){
    const bar=toolbar();if(!bar)return;
    document.querySelectorAll('.ap-fit-state').forEach(node=>node.remove());
    let fit=[...bar.querySelectorAll('.ap-button')].find(b=>/화면 맞춤|너비 맞춤/.test(b.textContent||''));
    if(!fit){
      fit=document.createElement('button');
      fit.type='button';fit.className='ap-button ap-enterprise-fit';fit.textContent='화면 맞춤';bar.prepend(fit);
    }
    fit.classList.add('ap-enterprise-fit');
    if(fit.dataset.resourceFitBound!=='1'){
      fit.dataset.resourceFitBound='1';
      fit.addEventListener('click',()=>{
        const previewBody=body();
        if(previewBody){delete previewBody.dataset.resourceManualZoom;previewBody.classList.remove('ap-manual-zoom')}
        scheduleFit(currentTarget(),true);
      });
    }
  }
  function observeModal(modal){
    if(observedModal===modal)return;
    observedModal=modal;
    resizeObserver?.disconnect();mutationObserver?.disconnect();
    const previewBody=modal.querySelector('.ap-body');if(!previewBody)return;
    resizeObserver=new ResizeObserver(()=>{
      const target=currentTarget();
      if(target&&!fittedTargets.has(target)&&!manualZoomActive())scheduleFit(target);
    });
    resizeObserver.observe(previewBody);
    mutationObserver=new MutationObserver(()=>{
      installFitControl();
      const target=currentTarget();
      if(target&&!fittedTargets.has(target)&&!manualZoomActive())scheduleFit(target);
    });
    mutationObserver.observe(modal,{childList:true,subtree:true});
    installFitControl();
    const target=currentTarget();if(target&&!manualZoomActive())scheduleFit(target);
  }
  const pageObserver=new MutationObserver(()=>{
    const modal=visibleModal();
    if(!modal){observedModal=null;resizeObserver?.disconnect();mutationObserver?.disconnect();return}
    observeModal(modal);
    installFitControl();
    const target=currentTarget();if(target&&!fittedTargets.has(target)&&!manualZoomActive())scheduleFit(target);
  });
  pageObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
