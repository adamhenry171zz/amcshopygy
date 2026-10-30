import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cfg=window.HENRY_OS_CONFIG||{};
const $=id=>document.getElementById(id);
const show=id=>{for(const key of ['setup','login','dashboard'])$(key).classList.toggle('hidden',key!==id)};
const configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey);
if(!configured){show('setup')}else{
 const sb=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const status=msg=>$('login-status').textContent=msg;
 async function render(){
  const {data:{user},error}=await sb.auth.getUser();
  if(error||!user){show('login');return}
  // Client-side email check is only UX. The database henry_is_owner RLS is authoritative.
  const {data:authorized,error:authError}=await sb.rpc('henry_is_owner');
  if(authError||authorized!==true){await sb.auth.signOut();show('login');status('This account is not authorized for owner access.');return}
  $('owner-name').textContent='Signed in as '+user.email;
  show('dashboard');
 }
 $('login-form').addEventListener('submit',async e=>{e.preventDefault();status('Checking credentials…');$('sign-in').disabled=true;try{
  const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  $('password').value='';
  if(error){status('Sign-in failed. Check your credentials and try again.');return}
  status('');await render()
 }catch{status('Unable to sign in right now.')}finally{$('sign-in').disabled=false}});
 $('reset').addEventListener('click',async()=>{const email=$('email').value.trim();if(!email){status('Enter your email address first.');return}const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/admin/'});status(error?'Unable to send recovery email.':'If the email is registered, recovery instructions will be sent.')});
 $('logout').addEventListener('click',async()=>{await sb.auth.signOut();show('login')});
 sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')show('login')});
 await render();
}
