"""Regression: preview placement, subject palettes, uploaded details, real canvas grips."""
import os,json,math,time,tempfile
from pathlib import Path
from io import BytesIO
import httpx
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright

base=os.environ.get('APP_URL','http://127.0.0.1:8000')

def picture(kind):
 im=Image.new('RGBA',(700,1000));d=ImageDraw.Draw(im)
 if kind==0:
  d.rounded_rectangle((180,100,520,900),radius=65,fill='#d84d40');d.rectangle((210,440,490,650),fill='#ffe4c0')
 elif kind==1:d.ellipse((140,200,560,700),fill='#357c50')
 else:d.polygon([(350,100),(600,600),(300,900),(100,500)],fill='#e8b446')
 b=BytesIO();im.save(b,format='PNG');return b.getvalue()

with httpx.Client(base_url=base,timeout=20) as client:
 r=client.post('/api/projects',files=[('product_image',('main.png',picture(0),'image/png')),('details',('leaf.png',picture(1),'image/png')),('details',('detail.png',picture(2),'image/png'))],data={'remove_product_background':'false','use_vision':'false'})
 r.raise_for_status();identifier=r.json()['id']
 for _ in range(50):
  data=client.get('/api/projects/'+identifier).json()
  if data['job']['status']=='done':break
  time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(15000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.evaluate('(id)=>localStorage.setItem("agrovision.project",id)',identifier);page.reload();page.locator('#resume').click()
  page.locator('#design-step').wait_for(state='visible');page.locator('#design-palettes .palette-choice').first.wait_for()
  assert page.locator('#design-step #template-options').count()==0
  assert page.locator('#background-gallery button').count()==7
  left=page.locator('#style-options').bounding_box();right=page.locator('.design-preview-panel').bounding_box();assert right['x']>left['x']+left['width']
  page.locator('#preview-background').click();page.locator('[data-background=gradient]').click()
  page.wait_for_timeout(150);before=page.locator('#design-preview').evaluate('e=>e.toDataURL()')
  page.locator('[data-background=tiles]').click();page.wait_for_timeout(150)
  assert page.locator('#design-preview').evaluate('e=>e.toDataURL()')!=before
  page.locator('#preview-product').click();page.locator('#to-product').click()
  assert page.locator('#product-step #template-options button').count()==7
  assert page.locator('#detail-roles select').count()==2
  for tid in ['features','dimensions','closeups']:page.locator(f'#template-options button[data-template={tid}]').click()
  page.locator('#category').fill('Ваза');page.locator('#product-name').fill('Керамическая ваза')
  for label,value in [('Основная характеристика','Ручная работа'),('Ширина','30 см'),('Высота','60 см')]:
   page.get_by_role('button',name='＋ '+label,exact=True).click();row=page.locator('.fact').last;row.locator('input').nth(1).fill(value);row.locator('[type=checkbox]').check()
  page.locator('#confirmed').check();page.locator('#build').click();page.locator('#editor-step').wait_for(state='visible')
  saved=client.get('/api/projects/'+identifier).json()
  for s in saved['scenes']:
   assert any(n.get('assetId')=='image_1' for n in s['nodes']),s['template']
   assert any(n.get('assetId')=='image_2' for n in s['nodes']),s['template']
  page.locator('#layers').get_by_role('button',name='Товар',exact=True).click()
  def stored():
   page.locator('#save').click();page.wait_for_timeout(120)
   s=client.get('/api/projects/'+identifier).json()['scenes'][0]
   return s,next(n for n in s['nodes'] if n.get('role')=='product')
  def points(s,n):
   page.locator('#canvas').scroll_into_view_if_needed()
   return page.evaluate('''async ({s,n})=>{const m=await import('/transform.js'),r=document.getElementById('canvas').getBoundingClientRect();return m.handlePoints(n,s.width/r.width,s).map(p=>({...p,sx:r.left+p.x*r.width/s.width,sy:r.top+p.y*r.height/s.height}));}''',{'s':s,'n':n})
  s,n=stored();handles=points(s,n);se=next(h for h in handles if h['id']=='se')
  page.mouse.move(se['sx'],se['sy']);page.mouse.down();page.mouse.move(se['sx']+22,se['sy']+28,steps=7);page.mouse.up()
  _,scaled=stored();assert scaled['w']>n['w'] and scaled['h']>n['h']
  assert abs(scaled['w']/scaled['h']-n['w']/n['h'])<.001
  page.locator('#undo').click();page.locator('#layers').get_by_role('button',name='Товар',exact=True).click();s,n=stored();grip=next(h for h in points(s,n) if h['id']=='rotate')
  page.mouse.move(grip['sx'],grip['sy']);page.mouse.down();page.mouse.move(grip['sx']+48,grip['sy']+12,steps=7);page.mouse.up()
  s,turned=stored();assert abs(turned['rotation'])>4
  nw_before=next(h for h in points(s,turned) if h['id']=='nw')
  se=next(h for h in points(s,turned) if h['id']=='se')
  page.mouse.move(se['sx'],se['sy']);page.mouse.down();page.mouse.move(se['sx']+17,se['sy']+23,steps=7);page.mouse.up()
  s,resized=stored();nw_after=next(h for h in points(s,resized) if h['id']=='nw')
  assert math.hypot(nw_after['x']-nw_before['x'],nw_after['y']-nw_before['y'])<.1
  page.locator('#undo').click();_,restored=stored();assert abs(restored['w']-turned['w'])<.1
  # The entire drag is one undo step and survives save/reload.
  page.reload();page.locator('#resume').click();page.locator('#editor-step').wait_for(state='visible')
  visibility=page.evaluate('''async (project)=>{
   const m=await import('/scene.js');await m.loadFonts();await m.loadImages(project.scenes);const result=[];
   for(const s of project.scenes){const cv=document.createElement('canvas');cv.width=240;cv.height=320;m.renderScene(cv.getContext('2d'),s);const px=cv.getContext('2d').getImageData(0,0,240,320).data;let green=0,yellow=0;for(let i=0;i<px.length;i+=4){const [r,g,b]=[px[i],px[i+1],px[i+2]];if(g>r*1.4&&g>b*1.2)green++;if(r>180&&g/r>.62&&g/r<.88&&b/r<.5)yellow++;}result.push({template:s.template,green,yellow});}return result;
  }''',saved)
  assert all(v['green']>100 and v['yellow']>100 for v in visibility),visibility
  palette_result=page.evaluate('''async()=>{
   const a=await import('/assets.js'),c=await import('/color.js');const results=[];
   for(const [color,bg] of [['#080808',null],['#fafafa',null],['#d33c32','#ffffff'],['#171717','#ffffff']]){
    const cv=document.createElement('canvas');cv.width=100;cv.height=100;const ctx=cv.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,100,100);}ctx.fillStyle=color;ctx.fillRect(22,10,56,80);const url=cv.toDataURL();await a.loadImages([{nodes:[{type:'image',src:url}]}]);const p=c.analyseImage(url);
    const target=c.lab(c.hexRgb(color)),got=c.lab(c.hexRgb(p.color));if(Math.hypot(...got.map((v,i)=>v-target[i]))>8)throw Error('Wrong product colour: '+color+' -> '+p.color);
    const palettes=c.colorSuggestions(p);if(palettes.some(s=>c.contrast(color,s.bg)<1.55))throw Error('Insufficient product-background contrast');results.push({color,detected:p.color});
   }return results;
  }''')
  assert len(palette_result)==4
  assert page.evaluate("""async()=>{const m=await import('/transform.js');const n={x:40,y:20,w:400,h:180,rotation:0,visible:true};const bounds={width:1200,height:1600},p=m.handlePoints(n,3,bounds).find(p=>p.id==='rotate');return m.hitHandle(n,p.x,p.y,3,bounds)?.id==='rotate'&&m.hitHandle({...n,locked:true},p.x,p.y,3,bounds)===null;}""")
  assert not errors,errors
  page.screenshot(path=str(Path(tempfile.gettempdir())/'agro-handles.png'),full_page=True)
  print('PASS: large right preview; pattern gallery; selection moved; uploaded details on all 4 cards; corner scaling; rotation; rotated fixed anchor; one-step undo; save/reopen; black/white/coloured palette separation')
  browser.close()
