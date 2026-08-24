(function(){
  let previewObjectUrl=null,previewRequest=0;
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
  function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
  function fileExt(name){const part=String(name||'').split('.').pop();return part&&part!==name?part.toLowerCase():''}
  function fileKind(name){const ext=fileExt(name);if(['jpg','jpeg','png'].includes(ext))return'image';if(ext==='pdf')return'pdf';if(['xls','xlsx'].includes(ext))return'excel';if(['hwp','hwpx'].includes(ext))return'hwp';if(['ppt','pptx'].includes(ext))return'powerpoint';if(['doc','docx'].includes(ext))return'word';return'file'}
  function fileKindLabel(kind){return{image:'이미지',pdf:'PDF',excel:'Excel',hwp:'한글',powerpoint:'PowerPoint',word:'Word',file:'파일'}[kind]||'파일'}
  function inferredMime(name,current){const kind=fileKind(name);if(kind==='image')return fileExt(name)==='png'?'image/png':'image/jpeg';if(kind==='pdf')return'application/pdf';return current||'application/octet-stream'}
  function clearPreviewObjectUrl(){previewRequest++;if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null}document.getElementById('modal')?.classList.remove('preview-open')}
  async function authenticatedBlob(id,retry=true){
    if(window.EHSApi?.blob)return window.EHSApi.blob(`/api/partner/submission/files/${encodeURIComponent(id)}`);
    const headers=new Headers();
    if(window.EHSAuth?.readSession())headers.set('Authorization','Bearer '+await window.EHSAuth.token());
    let response;try{response=await fetch((window.EHSApi?.ORIGIN||'')+`/api/partner/submission/files/${encodeURIComponent(id)}`,{headers})}catch(_){throw new Error('파일 미리보기 서버에 연결할 수 없습니다.')}
    if(response.status===401&&retry&&window.EHSAuth?.readSession()){await window.EHSAuth.refresh();return authenticatedBlob(id,false)}
    if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'파일을 불러올 수 없습니다.')}
    return response.blob();
  }
  function bindPreviewActions(id){
    document.getElementById('closeEvidencePreview')?.addEventListener('click',()=>{clearPreviewObjectUrl();closeModal()});
    document.getElementById('downloadEvidencePreview')?.addEventListener('click',()=>authenticatedDownload(id));
  }
  async function previewTicket(id){return apiClient().request(`/api/partner/submission/files/${encodeURIComponent(id)}/preview-ticket`,{method:'POST',body:'{}'})}
  async function previewFile(id,name,size,contentType){
    if(typeof modal!=='function')return;
    clearPreviewObjectUrl();
    const requestId=previewRequest;
    const kind=fileKind(name),label=fileKindLabel(kind),safeName=escapeHtml(name),sizeText=typeof fmtBytes==='function'?fmtBytes(size):`${Math.round(Number(size||0)/1024)} KB`;
    if(kind==='file'){
      modal('증빙자료 미리보기',`<div class="evidence-preview-fallback"><div class="evidence-preview-icon">${escapeHtml(label.slice(0,3).toUpperCase())}</div><strong>${safeName}</strong><span>${escapeHtml(label)} · ${escapeHtml(sizeText)}</span><p>${escapeHtml(label)} 파일은 브라우저에서 원본 화면을 직접 표시할 수 없습니다.<br>파일을 다운로드하여 확인해 주세요.</p></div>`,`<button class="btn" id="closeEvidencePreview">닫기</button><button class="btn primary" id="downloadEvidencePreview">다운로드</button>`);
      document.getElementById('modal')?.classList.add('preview-open');bindPreviewActions(id);return;
    }
    modal('증빙자료 미리보기',`<div class="evidence-preview-skeleton" role="status" aria-label="${safeName} 미리보기 준비 중"><div class="evidence-preview-skeleton-side"></div><div class="evidence-preview-skeleton-page"></div></div>`,`<button class="btn" id="closeEvidencePreview">닫기</button><button class="btn primary" id="downloadEvidencePreview">다운로드</button>`);
    document.getElementById('modal')?.classList.add('preview-open');bindPreviewActions(id);
    try{
      const body=document.getElementById('modalBody');if(!body)return clearPreviewObjectUrl();
      if(kind==='image'||kind==='pdf'){
        const source=await authenticatedBlob(id);if(requestId!==previewRequest)return;const blob=source.type===inferredMime(name,source.type)?source:new Blob([source],{type:inferredMime(name,source.type)});previewObjectUrl=URL.createObjectURL(blob);
        body.innerHTML=kind==='image'?`<div class="evidence-preview-stage image"><img src="${previewObjectUrl}" alt="${safeName}"></div>`:`<div class="evidence-preview-stage"><iframe src="${previewObjectUrl}" title="${safeName}"></iframe></div>`;
      }else{
        const ticket=await previewTicket(id);if(requestId!==previewRequest)return;
        const noticeStyle='padding:9px 12px;margin-bottom:10px;border:1px solid #dce7ee;border-radius:8px;background:#f5f9fc;color:#637886;font-size:10px;line-height:1.55';
        const notice=kind==='hwp'?`<div style="${noticeStyle}">한글 파일은 Google 공식 미리보기 지원 형식이 아니므로 문서에 따라 표시되지 않을 수 있습니다. 표시되지 않으면 다운로드해 확인해 주세요.</div>`:`<div style="${noticeStyle}">Google 문서 뷰어로 표시합니다. 원본과 글꼴·레이아웃이 일부 다를 수 있습니다.</div>`;
        body.innerHTML=`${notice}<div class="evidence-preview-stage web"><iframe src="${escapeHtml(ticket.viewer_url)}" title="${safeName}" referrerpolicy="no-referrer"></iframe></div>`;
      }
    }catch(e){const body=document.getElementById('modalBody');if(body)body.innerHTML=`<div class="evidence-preview-error">${escapeHtml(e.message||'파일을 미리 볼 수 없습니다.')}</div>`}
  }
  function installSectionNavigation(){
    const d=currentData(),layout=document.querySelector('.layout'),content=layout?.querySelector('.content');
    if(!d?.workspace||!layout||!content||document.getElementById('submissionSectionStrip'))return;
    const groups=new Map();
    for(const item of d.workspace.items||[]){
      const name=item.parent_category_name||item.category_name||'기타';
      if(!groups.has(name))groups.set(name,[]);
      groups.get(name).push(item);
    }
    const profile=content.querySelector('.profile-card');if(profile)profile.id='submission-profile';
    const strip=document.createElement('nav');strip.id='submissionSectionStrip';strip.className='submission-section-strip';strip.setAttribute('aria-label','제출 항목 바로가기');
    const links=[{name:'기본정보',id:'submission-profile'}];
    let index=0;
    for(const [name,items] of groups){
      const first=items.find(i=>document.getElementById('item-'+i.target_item_state_id));if(!first)continue;
      const card=document.getElementById('item-'+first.target_item_state_id),id='submission-section-'+index++;
      const heading=document.createElement('div');heading.className='section-heading';heading.id=id;heading.innerHTML=`<strong>${escapeHtml(name)}</strong><span>${items.length}개 평가항목</span>`;
      card.parentNode.insertBefore(heading,card);links.push({name,id});
    }
    strip.innerHTML=links.map(x=>`<button class="section-chip" type="button" data-section-target="${escapeHtml(x.id)}">${escapeHtml(x.name)}</button>`).join('');
    strip.querySelectorAll('[data-section-target]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.sectionTarget)?.scrollIntoView({behavior:'smooth',block:'start'}));
    layout.parentNode.insertBefore(strip,layout);
  }
  function enhanceLayout(){
    if(!hasWorkspace())return;
    const d=currentData(),t=d.workspace.target,cap=d.capabilities||{},usage=cap.storage_usage;
    const layout=document.querySelector('.layout');installSectionNavigation();
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
  function syncDirtyModel(){
    if(!hasWorkspace())return [];
    const items=[];
    for(const id of [...dirty]){
      const field=document.getElementById('desc-'+id),item=data.workspace.items.find(x=>x.target_item_state_id===id);
      if(!field||!item)continue;
      item.description=field.value;
      items.push({id,description:field.value});
    }
    return items;
  }
  function updateStorageUsage(delta){
    const usage=currentData()?.capabilities?.storage_usage;if(!usage)return;
    for(const key of ['company_cycle','global']){
      const value=usage[key];if(!value)continue;
      value.used_bytes=Math.max(0,Number(value.used_bytes||0)+delta);
      value.committed_bytes=Math.max(0,Number(value.committed_bytes||0)+delta);
      value.remaining_bytes=Math.max(0,Number(value.limit_bytes||0)-value.used_bytes);
      value.percent=value.limit_bytes?Math.min(100,Math.round(value.used_bytes/value.limit_bytes*1000)/10):0;
      if(key==='company_cycle')value.used_mb=Math.round(value.used_bytes/1024/1024*10)/10;
      else value.used_gb=Math.round(value.used_bytes/1024/1024/1024*100)/100;
    }
  }
  async function saveDirtyFast(){
    const items=syncDirtyModel();if(!items.length)return;
    for(const item of items){const state=document.getElementById('state-'+item.id);if(state)state.textContent='저장 중...'}
    await apiClient().request(`/api/partner/submission/${encodeURIComponent(targetId)}/items/bulk`,{method:'PATCH',body:JSON.stringify({items})});
    for(const item of items){dirty.delete(item.id);const state=document.getElementById('state-'+item.id);if(state){state.textContent='저장됨';state.className='save-state saved'}}
    recalcSummary();
  }
  async function uploadFast(id,input){
    const file=input.files?.[0];if(!file)return;
    const form=new FormData();form.append('file',file);syncDirtyModel();toast('파일 업로드 중...');
    try{
      const result=await apiClient().request(`/api/partner/submission/${encodeURIComponent(targetId)}/items/${encodeURIComponent(id)}/files`,{method:'POST',body:form});
      const item=data.workspace.items.find(x=>x.target_item_state_id===id);if(item&&result.file)item.files=[result.file,...(item.files||[])];
      updateStorageUsage(Number(result.file?.file_size||file.size||0));recalcSummary();render();toast('파일을 첨부했습니다.');
    }catch(e){modal('파일 첨부 실패',escapeHtml(window.EHSApi?.describe?window.EHSApi.describe(e):e.message),'<button class="btn" id="modalOk">확인</button>');setTimeout(()=>{const b=document.getElementById('modalOk');if(b)b.onclick=closeModal},0)}finally{input.value=''}
  }
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function startSubmitProgress(resubmit){
    document.getElementById('submitProgressFloat')?.remove();
    const indicator=document.createElement('div');
    indicator.id='submitProgressFloat';indicator.className='submit-progress-float';
    indicator.innerHTML=`<div class="submit-progress-compact" role="status" aria-live="polite"><div class="submit-progress-top"><strong>${resubmit?'재제출 중':'제출 중'}</strong><span id="submitProgressPercent">0%</span></div><div class="submit-progress-track" id="submitProgressTrack" role="progressbar" aria-label="제출 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="submit-progress-bar" id="submitProgressBar"></span></div></div>`;
    document.body.appendChild(indicator);
    let value=0,stopped=false;
    const paint=next=>{
      if(stopped)return;value=Math.max(value,Math.min(100,next));
      const rounded=Math.round(value),bar=document.getElementById('submitProgressBar'),track=document.getElementById('submitProgressTrack'),percent=document.getElementById('submitProgressPercent');
      if(bar)bar.style.width=rounded+'%';if(track)track.setAttribute('aria-valuenow',String(rounded));if(percent)percent.textContent=rounded+'%';
    };
    requestAnimationFrame(()=>paint(7));
    const timer=setInterval(()=>{if(value>=92)return;paint(value+(value<55?5:value<78?3:value<88?1.5:.5))},260);
    const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer)};
    return {
      complete:async()=>{paint(100);clearInterval(timer);await wait(140);stop();indicator.remove()},
      fail:error=>{stop();indicator.remove();modal('평가자료 제출 실패',`<div class="evidence-preview-error">${escapeHtml(window.EHSApi?.describe?window.EHSApi.describe(error):error?.message||'제출하지 못했습니다.')}</div>`,'<button class="btn" id="submitFailClose">닫기</button><button class="btn primary" id="submitFailRetry">다시 시도</button>');document.getElementById('submitFailClose').onclick=closeModal;document.getElementById('submitFailRetry').onclick=()=>{closeModal();submitFast()}}
    };
  }
  function submitFast(){
    syncDirtyModel();recalcSummary();
    const summary=data.workspace.summary,resubmit=!!data.workspace.target.submitted_at;
    modal(resubmit?'변경사항 재제출':'평가자료 제출',`현재 작성률은 <b>${summary.progress}%</b>이며 미작성 항목은 <b>${summary.blank}개</b>입니다.<br><br>자료가 없는 항목은 그대로 제출할 수 있으며 평가 시 감점될 수 있습니다. 제출하시겠습니까?`,`<button class="btn" id="cancelSubmit">취소</button><button class="btn primary" id="confirmSubmit">${resubmit?'재제출':'제출완료'}</button>`);
    document.getElementById('cancelSubmit').onclick=closeModal;
    document.getElementById('confirmSubmit').onclick=async()=>{
      const button=document.getElementById('confirmSubmit');button.disabled=true;const items=syncDirtyModel();closeModal();const progress=startSubmitProgress(resubmit);
      try{
        const result=await apiClient().request(`/api/partner/submission/${encodeURIComponent(targetId)}/submit`,{method:'POST',body:JSON.stringify({items})});
        dirty.clear();data.workspace.summary=result.summary||data.workspace.summary;data.workspace.target.status=result.status||'submitted';data.workspace.target.submitted_at=result.submitted_at||data.workspace.target.submitted_at||new Date().toISOString();
        render();await progress.complete();toast('평가자료를 제출했습니다.');
      }catch(e){progress.fail(e)}
    };
  }
  async function confirmedDelete(id){
    if(capabilities().can_delete_file===false)return;
    if(typeof modal!=='function')return;
    modal('첨부파일 삭제','선택한 증빙자료를 삭제할까요?<br><br>삭제 기록은 제출 이력에 남습니다.','<button class="btn" id="cancelEvidenceDelete">취소</button><button class="btn primary" id="confirmEvidenceDelete">삭제</button>');
    document.getElementById('cancelEvidenceDelete').onclick=closeModal;document.getElementById('confirmEvidenceDelete').onclick=async()=>{const b=document.getElementById('confirmEvidenceDelete');b.disabled=true;b.textContent='삭제 중...';try{syncDirtyModel();let removed=null,owner=null;for(const item of data.workspace.items||[]){const file=(item.files||[]).find(x=>x.id===id);if(file){removed=file;owner=item;break}}await apiClient().request(`/api/partner/submission/files/${encodeURIComponent(id)}`,{method:'DELETE'});if(owner)owner.files=owner.files.filter(x=>x.id!==id);if(removed)updateStorageUsage(-Number(removed.file_size||0));recalcSummary();closeModal();render();toast('증빙자료를 삭제했습니다.')}catch(e){b.disabled=false;b.textContent='다시 시도';document.getElementById('modalBody').textContent=window.EHSApi?.describe?window.EHSApi.describe(e):(e.message||'삭제하지 못했습니다.')}};
  }
  function installActionCapture(){
    document.addEventListener('click',e=>{const pv=e.target.closest?.('[data-preview-file]');if(pv){e.preventDefault();e.stopImmediatePropagation();previewFile(pv.dataset.previewFile,pv.dataset.fileName,Number(pv.dataset.fileSize||0),pv.dataset.contentType||'');return}const dl=e.target.closest?.('[data-download]');if(dl){e.preventDefault();e.stopImmediatePropagation();authenticatedDownload(dl.dataset.download);return}const del=e.target.closest?.('[data-delete-file]');if(del){e.preventDefault();e.stopImmediatePropagation();confirmedDelete(del.dataset.deleteFile)}},true);
    const modalEl=document.getElementById('modal');if(modalEl)new MutationObserver(()=>{if(modalEl.classList.contains('hidden'))clearPreviewObjectUrl()}).observe(modalEl,{attributes:true,attributeFilter:['class']});
  }
  function patchFunctions(){
    try{
      if(typeof render==='function'&&!render.__enhanced){const originalRender=render;const wrapped=function(){const r=originalRender.apply(this,arguments);queueMicrotask(enhanceLayout);return r};wrapped.__enhanced=true;render=wrapped}
      if(typeof saveItem==='function'&&!saveItem.__enhanced){const originalSave=saveItem;const wrappedSave=async function(id){await originalSave.apply(this,arguments);recalcSummary();enhanceLayout()};wrappedSave.__enhanced=true;saveItem=wrappedSave}
      if(typeof saveDirty==='function'&&!saveDirty.__enhanced){saveDirtyFast.__enhanced=true;saveDirty=saveDirtyFast}
      if(typeof uploadFile==='function'&&!uploadFile.__enhanced){uploadFast.__enhanced=true;uploadFile=uploadFast}
      if(typeof submitEvaluation==='function'&&!submitEvaluation.__enhanced){submitFast.__enhanced=true;submitEvaluation=submitFast}
      if(typeof downloadFile==='function')downloadFile=authenticatedDownload;
      if(typeof deleteFile==='function')deleteFile=confirmedDelete;
    }catch(e){console.warn('submission enhancement patch',e)}
  }
  function boot(){patchFunctions();installActionCapture();enhanceLayout();let tries=0;const timer=setInterval(()=>{patchFunctions();enhanceLayout();if(++tries>40)clearInterval(timer)},250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
