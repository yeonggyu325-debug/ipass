(function(){
  function apiClient(){if(!window.EHSApi?.request)throw new Error('공통 API 인증 모듈이 초기화되지 않았습니다.');return window.EHSApi}
  function hasWorkspace(){try{return typeof data!=='undefined'&&data&&data.workspace&&data.workspace.target}catch(_){return false}}
  function currentData(){try{return data}catch(_){return null}}
  function currentTarget(){const d=currentData();return d?.workspace?.target||null}
  function capabilities(){return currentData()?.capabilities||{}}
  function editableNow(t){const cap=capabilities();if(typeof cap.can_edit==='boolean')return cap.can_edit;if(!t||t.cycle_status!=='active')return false;return true}
  function pct(n){return Math.max(0,Math.min(100,Number(n||0)))}
  function fmtMB(bytes){return (Number(bytes||0)/1024/1024).toFixed(Number(bytes||0)>=104857600?0:1)}
  function fmtGB(bytes){return (Number(bytes||0)/1024/1024/1024).toFixed(2)}
  function meterClass(v){return v>=95?'danger':v>=80?'warn':''}
  function enhanceLayout(){
    if(!hasWorkspace())return;
    const d=currentData(),t=d.workspace.target,cap=d.capabilities||{},usage=cap.storage_usage;
    const layout=document.querySelector('.layout');
    if(layout&&!document.getElementById('storageQuotaCard')&&usage){
      const card=document.createElement('section');card.id='storageQuotaCard';card.className='storage-card';
      const cp=usage.company_cycle||{},gp=usage.global||{};
      card.innerHTML=`<div><div class="storage-title">증빙자료 저장공간</div><div class="storage-copy">현재 평가회차 ${fmtMB(cp.used_bytes)} MB / 500 MB · 전체 ${fmtGB(gp.used_bytes)} GB / 8.5 GB</div></div><div class="storage-meter"><div class="storage-meter-track"><div class="storage-meter-fill ${meterClass(cp.percent)}" style="width:${pct(cp.percent)}%"></div></div><div class="storage-meter-text"><span>회사 회차 ${pct(cp.percent)}%</span><span>전체 ${pct(gp.percent)}%</span></div></div>`;
      layout.parentNode.insertBefore(card,layout);
    }
    const hero=document.querySelector('.hero');
    if(hero&&!document.getElementById('periodStateBanner')){
      const open=editableNow(t),banner=document.createElement('div');banner.id='periodStateBanner';banner.className='period-banner'+(open?'':' closed');
      const reason=cap.edit_reason?` ${cap.edit_reason}`:'';
      banner.innerHTML=open?`<span><strong>평가자료 수정 가능</strong> · 평가기간 내 저장·파일첨부·재제출이 가능합니다.</span><span>${String(t.start_at||'-').slice(0,10)} ~ ${String(t.end_at||'-').slice(0,10)}</span>`:`<span><strong>현재 수정할 수 없는 평가입니다.</strong>${reason}</span><span>${String(t.start_at||'-').slice(0,10)} ~ ${String(t.end_at||'-').slice(0,10)}</span>`;
      hero.insertAdjacentElement('afterend',banner);
    }
    if(!editableNow(t))document.querySelectorAll('input,textarea,button[data-save-item],label.file-pick,#saveProfileBtn,#topSubmitBtn,#bottomSubmitBtn,#mobileSubmitBtn').forEach(el=>{if(el.tagName==='LABEL'){el.classList.add('disabled');el.style.pointerEvents='none'}else el.disabled=true});
    if(cap.can_upload===false)document.querySelectorAll('label.file-pick,input[data-file-input]').forEach(el=>{if(el.tagName==='LABEL'){el.classList.add('disabled');el.style.pointerEvents='none'}else el.disabled=true});
    if(cap.can_submit===false)document.querySelectorAll('#topSubmitBtn,#bottomSubmitBtn,#mobileSubmitBtn').forEach(el=>el.disabled=true);
  }
  function recalcSummary(){
    if(!hasWorkspace())return;
    const d=currentData(),items=d.workspace.items||[];const applicable=items.filter(i=>Number(i.applicable)!==0),na=items.length-applicable.length;const prepared=applicable.filter(i=>String(i.description||'').trim()||(i.files||[]).length).length;const summary={total:items.length,applicable:applicable.length,na,prepared,blank:Math.max(0,applicable.length-prepared),progress:items.length?Math.round(((prepared+na)/items.length)*100):0};d.workspace.summary=summary;
    const metrics=document.querySelectorAll('.summary .metric b');if(metrics[0])metrics[0].textContent=summary.progress+'%';if(metrics[1])metrics[1].textContent=summary.total;if(metrics[2])metrics[2].textContent=summary.na;if(metrics[3])metrics[3].textContent=summary.blank;const bar=document.querySelector('.progressbar span');if(bar)bar.style.width=summary.progress+'%';
  }
  async function authenticatedDownload(id){
    try{await apiClient().download(`/api/partner/submission/files/${encodeURIComponent(id)}`,'증빙자료')}
    catch(e){if(typeof modal==='function')modal('파일 다운로드 실패',String(window.EHSApi?.describe?window.EHSApi.describe(e):e.message||e),'<button class="btn" id="downloadFailOk">확인</button>'),setTimeout(()=>{const b=document.getElementById('downloadFailOk');if(b)b.onclick=closeModal},0)}
  }
  async function confirmedDelete(id){
    if(capabilities().can_delete_file===false)return;
    if(typeof modal!=='function')return;
    modal('첨부파일 삭제','선택한 증빙자료를 삭제할까요?<br><br>삭제 기록은 제출 이력에 남습니다.','<button class="btn" id="cancelEvidenceDelete">취소</button><button class="btn primary" id="confirmEvidenceDelete">삭제</button>');
    document.getElementById('cancelEvidenceDelete').onclick=closeModal;document.getElementById('confirmEvidenceDelete').onclick=async()=>{const b=document.getElementById('confirmEvidenceDelete');b.disabled=true;b.textContent='삭제 중...';try{await apiClient().request(`/api/partner/submission/files/${encodeURIComponent(id)}`,{method:'DELETE'});closeModal();toast('증빙자료를 삭제했습니다.');await load(true)}catch(e){b.disabled=false;b.textContent='다시 시도';document.getElementById('modalBody').textContent=window.EHSApi?.describe?window.EHSApi.describe(e):(e.message||'삭제하지 못했습니다.')}};
  }
  function installActionCapture(){
    document.addEventListener('click',e=>{const dl=e.target.closest?.('[data-download]');if(dl){e.preventDefault();e.stopImmediatePropagation();authenticatedDownload(dl.dataset.download);return}const del=e.target.closest?.('[data-delete-file]');if(del){e.preventDefault();e.stopImmediatePropagation();confirmedDelete(del.dataset.deleteFile)}},true);
  }
  function patchFunctions(){
    try{
      if(typeof render==='function'&&!render.__enhanced){const originalRender=render;const wrapped=function(){const r=originalRender.apply(this,arguments);queueMicrotask(enhanceLayout);return r};wrapped.__enhanced=true;render=wrapped}
      if(typeof saveItem==='function'&&!saveItem.__enhanced){const originalSave=saveItem;const wrappedSave=async function(id){await originalSave.apply(this,arguments);recalcSummary();enhanceLayout()};wrappedSave.__enhanced=true;saveItem=wrappedSave}
      if(typeof saveDirty==='function'&&!saveDirty.__enhanced){const robust=async function(){for(const id of [...dirty]){const desc=document.getElementById('desc-'+id);if(!desc)continue;await apiClient().request(`/api/partner/submission/${encodeURIComponent(targetId)}/items/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({description:desc.value})});const item=data.workspace.items.find(x=>x.target_item_state_id===id);if(item)item.description=desc.value;dirty.delete(id)}recalcSummary()};robust.__enhanced=true;saveDirty=robust}
      if(typeof downloadFile==='function')downloadFile=authenticatedDownload;
      if(typeof deleteFile==='function')deleteFile=confirmedDelete;
    }catch(e){console.warn('submission enhancement patch',e)}
  }
  function boot(){patchFunctions();installActionCapture();enhanceLayout();let tries=0;const timer=setInterval(()=>{patchFunctions();enhanceLayout();if(++tries>40)clearInterval(timer)},250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
