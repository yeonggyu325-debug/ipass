(function(){
  'use strict';
  if(location.pathname!=='/resources')return;

  document.body.classList.add('ehs-resource-preview-v2');

  let mode='fit';
  let frame=0;
  let resizeObserver=null;
  let mutationObserver=null;

  function visibleModal(){
    const overlay=document.querySelector('.ap-overlay:not(.ap-hidden)');
    return overlay?.querySelector('.ap-modal')||null;
  }
  function body(){return visibleModal()?.querySelector('.ap-body')||null}
  function toolbar(){return visibleModal()?.querySelector('.ap-toolbar')||null}
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
      const w=Number(el.width||rect.width||0),h=Number(el.height||rect.height||0);return w&&h?{width:w,height:h}:null;
    }
    const rect=el.getBoundingClientRect();return rect.width&&rect.height?{width:rect.width,height:rect.height}:null;
  }
  function setFit(el){
    const source=dimensions(el),space=usableSize();if(!source||!space.width||!space.height)return;
    const scale=Math.min(space.width/source.width,space.height/source.height);
    if(!Number.isFinite(scale)||scale<=0)return;
    const width=Math.max(1,Math.floor(source.width*scale));
    const height=Math.max(1,Math.floor(source.height*scale));
    el.style.setProperty('width',`${width}px`,'important');
    el.style.setProperty('height',`${height}px`,'important');
    el.style.setProperty('max-width','none','important');
    el.style.setProperty('max-height','none','important');
    el.dataset.resourceFit='1';
    const stage=el.closest('.ap-image-stage,.ap-hwp-stage,.ap-pdf-stage');
    if(stage){stage.style.setProperty('width','100%','important');stage.style.setProperty('height','100%','important');stage.style.setProperty('min-width','0','important');stage.style.setProperty('min-height','0','important')}
    const counter=toolbar()?.querySelector('.ap-counter:last-of-type');
    if(counter&&el instanceof HTMLImageElement&&el.naturalWidth)counter.textContent=`${Math.round(width/el.naturalWidth*100)}%`;
  }
  function fitCurrent(){
    const el=body();if(!el||mode!=='fit')return;
    el.classList.remove('ap-manual-zoom');
    const target=el.querySelector('.ap-image,.ap-hwp-page,.ap-pdf-canvas');
    if(target)setFit(target);
    const ppt=el.querySelector('.ap-pptx');
    if(ppt){ppt.style.setProperty('width','100%','important');ppt.style.setProperty('height','100%','important')}
  }
  function scheduleFit(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;requestAnimationFrame(fitCurrent)})}
  function installFitControl(){
    const bar=toolbar();if(!bar||bar.dataset.resourcePreviewV2==='1')return;
    bar.dataset.resourcePreviewV2='1';
    const existing=[...bar.querySelectorAll('.ap-button')].find(b=>/화면 맞춤|너비 맞춤/.test(b.textContent||''));
    const fit=existing||document.createElement('button');
    if(!existing){fit.type='button';fit.className='ap-button ap-enterprise-fit';fit.textContent='화면 맞춤';bar.prepend(fit)}
    fit.classList.add('ap-enterprise-fit');
    fit.addEventListener('click',()=>{mode='fit';scheduleFit()});
    const state=document.createElement('span');state.className='ap-fit-state';state.textContent='비율 유지';bar.append(state);
    bar.addEventListener('click',event=>{
      const button=event.target.closest('.ap-button');if(!button||button===fit)return;
      const text=(button.textContent||'').trim();
      if(text==='＋'||text==='－'||text==='100%'){mode='manual';body()?.classList.add('ap-manual-zoom')}
      if(/화면 맞춤|너비 맞춤/.test(text)){mode='fit';scheduleFit()}
    },true);
  }
  function observeModal(modal){
    resizeObserver?.disconnect();mutationObserver?.disconnect();
    const previewBody=modal.querySelector('.ap-body');if(!previewBody)return;
    resizeObserver=new ResizeObserver(()=>scheduleFit());resizeObserver.observe(previewBody);
    mutationObserver=new MutationObserver(()=>{installFitControl();if(mode==='fit')scheduleFit()});
    mutationObserver.observe(modal,{childList:true,subtree:true});
    installFitControl();scheduleFit();
  }
  const pageObserver=new MutationObserver(()=>{
    const modal=visibleModal();if(!modal)return;
    if(modal.dataset.resourcePreviewObserved==='1'){installFitControl();scheduleFit();return}
    modal.dataset.resourcePreviewObserved='1';mode='fit';observeModal(modal);
  });
  pageObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',scheduleFit,{passive:true});
})();
