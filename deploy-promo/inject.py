from pathlib import Path
import re
import shutil
import sys

if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 deploy-promo/inject.py <site-directory>')

site = Path(sys.argv[1]).resolve()
here = Path(__file__).resolve().parent
assets = site / 'assets'
assets.mkdir(parents=True, exist_ok=True)

shutil.copy2(here / 'announcement.html', site / 'announcement.html')
shutil.copy2(here / 'promo.css', assets / 'promo.css')
shutil.copy2(here / 'promo.js', assets / 'promo.js')

promo_strip = '<div class="promo-strip" data-membership-promo><div class="wrap"><span><strong>WEBSITE RELAUNCH SPECIAL</strong> · 25% OFF your first AMC Members Club payment for 5 days only</span><a href="announcement.html">View announcement →</a></div></div>'
home_feature = '''<section class="home-promo-feature" data-membership-promo><div class="wrap"><div class="home-promo-card"><div><div class="kicker">WEBSITE RELAUNCH SPECIAL</div><h2>25% OFF AMC Members Club.</h2><p>Join during our five-day relaunch offer and save 25% on your first membership payment.</p></div><div class="home-promo-actions"><div class="mini-countdown" data-promo-countdown data-end="2026-10-20T23:59:59-04:00"><b data-days>04</b><span>days left</span></div><a class="btn primary" href="announcement.html">View the offer →</a></div></div></div></section>'''
member_feature = '''<div class="member-relaunch-offer" data-membership-promo><div><div class="kicker">5-DAY WEBSITE RELAUNCH OFFER</div><h2>Get 25% off your first membership payment.</h2><p>Join by October 20, 2026 at 11:59 PM GYT and save on any AMC Members Club plan.</p></div><div><a class="btn primary" href="announcement.html">See discounted prices →</a></div></div>'''

for page in site.glob('*.html'):
    if page.name == 'announcement.html':
        continue
    text = page.read_text(encoding='utf-8')

    if 'assets/promo.css' not in text:
        text = text.replace('</head>', '<link rel="stylesheet" href="assets/promo.css">\n</head>', 1)

    if 'data-membership-promo' not in text:
        text, count = re.subn(r'(<div class="topbar">.*?</div></div>)', r'\1\n' + promo_strip, text, count=1, flags=re.S)
        if count == 0:
            text = promo_strip + '\n' + text

    if page.name == 'index.html' and 'home-promo-feature' not in text:
        text = text.replace('<main>', '<main>\n' + home_feature, 1)

    if page.name == 'members.html' and 'member-relaunch-offer' not in text:
        marker = '<main><section><div class="wrap">'
        if marker in text:
            text = text.replace(marker, marker + member_feature, 1)

    if 'assets/promo.js' not in text:
        text = text.replace('</body>', '<script src="assets/promo.js"></script>\n</body>', 1)

    page.write_text(text, encoding='utf-8')

sitemap = site / 'sitemap.xml'
if sitemap.exists():
    text = sitemap.read_text(encoding='utf-8')
    if 'announcement.html' not in text:
        entry = '  <url><loc>https://amcshopping.com/announcement.html</loc><lastmod>2026-10-16</lastmod></url>\n'
        text = text.replace('</urlset>', entry + '</urlset>')
        sitemap.write_text(text, encoding='utf-8')

print('AMC v5.3 relaunch promotion injected into', site)
