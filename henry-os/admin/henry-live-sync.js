(()=>{
  const KEY='henry_os_data_version';
  const SEEN='henry_os_seen_version';
  const read=()=>Number(localStorage.getItem(KEY)||0);
  const seen=()=>Number(sessionStorage.getItem(SEEN)||0);
  const mark=v=>sessionStorage.setItem(SEEN,String(v||0));
  const freshReload=()=>{
    const latest=read();
    mark(latest);
    const u=new URL(location.href);
    u.searchParams.set('sync',String(latest||Date.now()));
    location.replace(u.pathname+u.search);
  };
  mark(read());
  window.addEventListener('storage',e=>{
    if(e.key!==KEY)return;
    const latest=Number(e.newValue||0);
    if(latest>seen())freshReload();
  });
  window.addEventListener('pageshow',e=>{
    const latest=read();
    if(e.persisted&&latest>seen())freshReload();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    const latest=read();
    if(latest>seen())freshReload();
  });
})();