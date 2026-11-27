
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const site=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(site))throw Error('AMC Mega Sale: site directory missing');
const here=path.dirname(fileURLToPath(import.meta.url));
const assets=path.join(site,'assets');
fs.mkdirSync(assets,{recursive:true});
fs.copyFileSync(path.join(here,'mega.css'),path.join(assets,'amc-mega.css'));
fs.copyFileSync(path.join(here,'mega.js'),path.join(assets,'amc-mega.js'));
const fnDir=path.resolve(site,'../netlify/functions');
fs.mkdirSync(fnDir,{recursive:true});
fs.copyFileSync(path.join(here,'status.mjs'),path.join(fnDir,'mega-sale-status.mjs'));

const wa='https://wa.me/5926042826?text=';
const money=n=>'GYD $'+n.toLocaleString('en-US');
const plans=[
 {name:'Starter',amount:5000,weight:20,desc:'For personal shoppers ready to grow'},
 {name:'Small Business',amount:10000,weight:50,desc:'For active shoppers and small sellers'},
 {name:'Business Pro',amount:15000,weight:100,desc:'For busy, higher-volume businesses'},
 {name:'Enterprise',amount:30000,weight:220,desc:'For large-volume shipping operations'}
];
const href=(msg)=>wa+encodeURIComponent(msg);
const markupLinks='<link rel="stylesheet" href="/assets/amc-mega.css"><script src="/assets/amc-mega.js" defer></script>';
function hero(onHomepage){
 const front=onHomepage?'data-mega-hide-after':'';
 return '<section class="amc-mega amc-mega-section" '+front+' aria-label="AMC Black Friday subscription flash sale"><div class="amc-mega-stage"><div class="amc-mega-hero-grid"><div><span class="amc-mega-kicker">BLACK FRIDAY · NOVEMBER 27 · 6–10 PM GYT</span><h2 class="amc-mega-hero-title">WE TOLD YOU <span>SOMETHING BIG</span> WAS COMING.</h2><p class="amc-mega-lead">Four hours. Huge savings. Join the AMC Shopping Members Club at half price for your first month, and explore limited-time digital subscription offers.</p><div class="amc-mega-highlights"><div class="amc-mega-highlight"><b>50% OFF</b><span>All monthly membership plans · first month</span></div><div class="amc-mega-highlight"><b>20% OFF</b><span>Eligible one-month digital subscriptions</span></div></div><div class="amc-mega-clock" role="timer" aria-live="off"><span class="amc-mega-clock-label" data-mega-status>SALE STARTS IN</span><strong class="amc-mega-clock-digits" data-mega-clock>--:--:--</strong></div><p class="amc-mega-clock-caption" data-mega-phase-note>Friday 6:00 PM – 10:00 PM Guyana time</p><div class="amc-mega-actions"><a class="amc-mega-btn" href="/mega-sale">Explore the mega sale →</a><a class="amc-mega-btn outline" href="/members">Compare member plans</a></div></div><div class="amc-mega-visual"><small>AMC SHOPPING MEMBERS CLUB</small><div class="amc-mega-big">50<span>%</span></div><strong>OFF YOUR FIRST MONTH</strong><p>Starter · Small Business<br>Business Pro · Enterprise</p></div></div></div></section>';
}
const strip='<section class="amc-mega amc-mega-section" data-mega-hide-after aria-label="AMC Black Friday flash sale"><div class="amc-mega-strip"><div><strong>BLACK FRIDAY MEGA SALE · 50% OFF MEMBERSHIPS + 20% OFF ELIGIBLE DIGITAL SUBSCRIPTIONS</strong><small>Friday, Nov 27 · 6 PM–10 PM Guyana time · Introductory month only · Terms apply</small><div class="amc-mega-clock" role="timer" aria-live="off"><span class="amc-mega-clock-label" data-mega-status>SALE STARTS IN</span><span class="amc-mega-clock-digits" data-mega-clock>--:--:--</span></div></div><a class="amc-mega-btn" href="/mega-sale">See the deals →</a></div></section>';
const cards=plans.map((p,i)=>{
 const sale=p.amount/2;
 const message='Hello AMC Shopping. I want to claim the BLACK FRIDAY 50% OFF '+p.name+' membership for '+money(sale)+' for my first month (regular monthly rate '+money(p.amount)+'). Please confirm eligibility and MMG payment details. I understand payment must be made November 27 between 6 PM and 10 PM Guyana time and renewals return to the regular price.';
 return '<article class="amc-mega-plan'+(i===2?' featured':'')+'"><span class="amc-mega-pill">SAVE 50% · FIRST MONTH</span><h3>'+p.name+'</h3><small>Up to '+p.weight+' lbs monthly allowance</small><div class="amc-mega-price-before">'+money(p.amount)+'</div><div class="amc-mega-price">'+money(sale)+'</div><small>One discounted monthly fee · renews at '+money(p.amount)+'</small><p>'+p.desc+'. Current in-allowance member shipping rate: GYD $950/lb; shipping is NOT half price.</p><a class="amc-mega-btn" data-mega-claim href="'+href(message)+'">Claim this plan →</a></article>';
}).join('');
const streamingMessage='Hello AMC Shopping. I would like to claim the November 27 BLACK FRIDAY 20% OFF an eligible one-month streaming or digital subscription. Please confirm my chosen service, eligible price, access type, payment instructions and availability before I pay.';
const annualMessage='Hello AMC Shopping. Please notify me when your 12-month Netflix Premium plus VPN package has been verified and is available. I understand this is not an official Netflix annual plan.';
const saleMain='<main class="amc-mega amc-mega-page">'+
 hero(false)+
 '<div class="amc-mega-page-inner">'+
 '<div class="amc-mega-ended" data-mega-ended hidden><strong>This Black Friday flash sale has ended.</strong> The four-hour window closed at 10:00 PM Guyana time on November 27, 2026. Standard membership and digital subscription rates apply. <a href="/members" style="color:inherit;text-decoration:underline">View current plans</a>.</div>'+
 '<section class="amc-mega-block" id="membership"><span class="amc-mega-section-kicker">Deal 01 · All Members Club plans</span><h2 class="amc-mega-heading">Four membership tiers. Half the first-month fee.</h2><p class="amc-mega-intro">The first monthly fee is 50% off when claimed and paid in the four-hour sale window. Regular subscription rates resume from the next billing cycle. Current GYD $950/lb member freight pricing and monthly allowance rules are unchanged.</p><div class="amc-mega-plans">'+cards+'</div></section>'+
 '<section class="amc-mega-block" id="digital"><span class="amc-mega-section-kicker">Deal 02 · Streaming and digital</span><h2 class="amc-mega-heading">20% off eligible one-month subscriptions.</h2><div class="amc-mega-offer-grid"><article class="amc-mega-offer featured"><span class="amc-mega-pill">FLASH SALE · 20% OFF</span><h3>Movies, music and more. Spend less.</h3><p>Explore AMC streaming and digital subscription options. Ask for the <strong>Black Friday one-month rate</strong>; AMC will verify the eligible service, access type, payment details and final discounted price before taking payment.</p><div class="amc-mega-service-tags"><span>Netflix</span><span>Spotify</span><span>Disney+</span><span>IPTV</span><span>VPN</span><span>Other eligible digital subscriptions</span></div><div class="amc-mega-actions"><a class="amc-mega-btn" href="'+href(streamingMessage)+'" data-mega-claim>Claim 20% off →</a><a class="amc-mega-btn outline" href="/streaming">Browse subscriptions</a></div></article>'+
 '<article class="amc-mega-offer"><span class="amc-mega-pill">BONUS · EXCLUSIVE INTEREST LIST</span><h3>12 months of Netflix Premium + VPN</h3><p>Interested in an all-year streaming bundle? Request details about AMC-managed monthly renewals paired with VPN access. <strong>Bundle availability and price are pending validation;</strong> no annual payment is being taken through this promotion page.</p><p>Netflix does not issue an official annual subscription. VPN service does not guarantee access to any specific regional library.</p><a class="amc-mega-btn outline" href="'+href(annualMessage)+'">Ask about the annual bundle →</a></article></div></section>'+
 '<section class="amc-mega-block amc-mega-terms" id="terms"><h3>Black Friday flash-sale terms</h3><ul><li>Valid November 27, 2026, from 6:00 PM through 9:59:59 PM Guyana time. Claims stop at 10:00 PM.</li><li>50% membership offer applies only to one month of the monthly membership fee, including Starter, Small Business, Business Pro, and Enterprise. Normal renewal fees apply from the next month.</li><li>20% digital discount applies to confirmed eligible one-month digital subscription purchases; multiple-month and separately priced bundles are excluded unless AMC expressly confirms otherwise.</li><li>Offers do not stack with other membership or digital discounts. No reduction to shipping charges, weight-based pricing, taxes or unrelated services.</li><li>Sale eligibility is based on payment made within the advertised window, not when a message is sent. AMC verifies MMG payment timestamps and confirms service availability, fulfillment and access terms before activation.</li><li>MMG merchant details: AMCSHOPPING / m742288. Confirm your invoice and official payment instructions with AMC before sending money.</li><li>This is an independent AMC Shopping promotion, not a promotion sponsored by any named streaming provider.</li></ul><p>Need help? <a href="https://wa.me/5926042826">Message AMC Shopping directly</a>. For standard shipping questions, visit <a href="/rates">shipping rates</a>.</p></section>'+
 '</div></main>';
const pages=['index.html','members.html','streaming.html','accounts.html','topups.html','announcement.html'];
for(const name of pages){
 const file=path.join(site,name);
 if(!fs.existsSync(file))continue;
 let html=fs.readFileSync(file,'utf8');
 if(!html.includes('amc-mega.css'))html=html.replace(/<\/head>/i,()=>markupLinks+'\n</head>');
 if(name==='index.html')html=html.replace(/<main\b[^>]*>/i,m=>m+'\n'+hero(true));
 else html=html.replace(/<main\b[^>]*>/i,m=>m+'\n'+strip);
 fs.writeFileSync(file,html);
}
const home=path.join(site,'index.html');
if(!fs.existsSync(home))throw Error('AMC Mega Sale: homepage is missing');
let page=fs.readFileSync(home,'utf8');
if(!/<main\b[^>]*>[\s\S]*?<\/main>/i.test(page))throw Error('AMC Mega Sale: homepage main not found');
page=page.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,()=>saleMain);
page=page.replace(/<title>[\s\S]*?<\/title>/i,'<title>Black Friday Mega Sale | AMC Shopping</title>');
page=page.replace(/<meta name="description" content="[^"]*"\s*\/?>/i,'<meta name="description" content="AMC Shopping Black Friday flash sale: 50% off the first month of Members Club and 20% off eligible one-month digital subscriptions. November 27, 2026, 6–10 PM Guyana time.">');
page=page.replace(/<meta property="og:title" content="[^"]*"/i,'<meta property="og:title" content="Black Friday Mega Sale | AMC Shopping"');
page=page.replace(/<meta property="og:url" content="[^"]*"/i,'<meta property="og:url" content="https://amcshopping.com/mega-sale"');
fs.writeFileSync(path.join(site,'mega-sale.html'),page);
const redirectsFile=path.join(site,'_redirects');
let redirects=fs.existsSync(redirectsFile)?fs.readFileSync(redirectsFile,'utf8').split(/\r?\n/):[];
redirects=redirects.filter(line=>!/^\/mega-sale(?:\s|$)/.test(line.trim()));
redirects.unshift('/mega-sale /mega-sale.html 200');
fs.writeFileSync(redirectsFile,redirects.join('\n').trimEnd()+'\n');
const sitemap=path.join(site,'sitemap.xml');
if(fs.existsSync(sitemap)){
 let xml=fs.readFileSync(sitemap,'utf8');
 if(!xml.includes('/mega-sale'))xml=xml.replace('</urlset>','  <url><loc>https://amcshopping.com/mega-sale</loc><lastmod>2026-11-27</lastmod></url>\n</urlset>');
 fs.writeFileSync(sitemap,xml);
}
console.log('AMC Black Friday Mega Sale injected: 27 Nov 2026 6–10 PM GYT, 50% first membership month, 20% eligible one-month digital, annual bundle inquiry only.');
