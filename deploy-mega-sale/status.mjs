
const START=Date.parse('2026-11-27T18:00:00-04:00');
const END=Date.parse('2026-11-27T22:00:00-04:00');
export default async function handler(request){
 if(request.method!=='GET')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 const serverNow=Date.now(),phase=serverNow<START?'upcoming':serverNow<END?'active':'ended';
 return new Response(JSON.stringify({serverNow,start:START,end:END,phase,claimWindowOpen:phase==='active'}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'}});
}
