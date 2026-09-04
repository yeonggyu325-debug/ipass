(function(){
  'use strict';
  if(location.pathname!=='/resources')return;

  // V2 is intentionally presentation-only. Renderer sizing/zoom is owned by
  // attachment-preview.js and the V3 controller so preview state cannot drift.
  document.body.classList.add('ehs-resource-preview-v2');

  const stripLegacyState=()=>{
    document.querySelectorAll('.ap-fit-state').forEach(node=>node.remove());
  };

  stripLegacyState();
  const observer=new MutationObserver(stripLegacyState);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
