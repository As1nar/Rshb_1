"""Batch angles, live colors, crop gestures and alpha outlines in the shared renderer."""
import os, tempfile, time
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

base=os.environ.get('APP_URL','http://127.0.0.1:8000')
with tempfile.TemporaryDirectory() as folder, sync_playwright() as p:
 files=[]
 for i,c in enumerate(['#a34735','#387d65','#465b9c','#b38b36']):
  im=Image.new('RGBA',(320,420));d=ImageDraw.Draw(im);d.ellipse((40,30,280,390),fill=c);d.ellipse((130,140,190,220),fill=(0,0,0,0));path=Path(folder)/f'{i}.png';im.save(path);files.append(str(path))
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.locator('#product-file').set_input_files(files)
 assert page.locator('.view-slot').count()==4
 page.locator('.view-slot details').nth(1).evaluate('e=>e.open=true');page.locator('.view-slot select').nth(1).select_option('back')
 for name in ['remove_product_background','use_vision']:page.locator(f'[name={name}]').uncheck()
 page.locator('#upload-form [type=submit]').click();page.locator('#to-product').wait_for(state='visible');page.wait_for_function('!document.querySelector("#to-product").disabled');page.locator('#to-product').click()
 assert page.locator('#detail-roles select').count()==0
 page.locator('#category').fill('Ваза');page.locator('#product-name').fill('Ваза');page.locator('#build').click();page.locator('#editor-step').wait_for(state='visible')
 page.locator('.layer-name').filter(has_text='Товар').first.click()
 assert page.locator('.angle-gallery button').count()==4
 before=page.locator('#canvas').evaluate('e=>e.toDataURL()');page.locator('.angle-gallery button').nth(1).click();page.wait_for_timeout(100)
 assert page.locator('#canvas').evaluate('e=>e.toDataURL()')!=before
 page.locator('[data-property="Обводка, px"]').evaluate('e=>{e.value=12;e.dispatchEvent(new Event("input"));e.dispatchEvent(new Event("change"))}')
 before=page.locator('#canvas').evaluate('e=>e.toDataURL()')
 page.locator('[data-property="Цвет обводки"]').evaluate('e=>{e.value="#ff00ff";e.dispatchEvent(new Event("input"))}')
 assert page.locator('#canvas').evaluate('e=>e.toDataURL()')!=before
 page.get_by_role('button',name='✥ Изменить фрагмент на холсте').click();box=page.locator('#canvas').bounding_box();x=box['x']+box['width']*.6;y=box['y']+box['height']*.6
 old=page.locator('[data-property="Сдвиг фото X, %"]').input_value();page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+30,y+10,steps=4);page.mouse.up()
 assert page.locator('[data-property="Сдвиг фото X, %"]').input_value()!=old
 page.keyboard.press('Escape')
 before=page.locator('#canvas').evaluate('e=>e.toDataURL()');page.locator('#scene-bg').evaluate('e=>{e.value="#543210";e.dispatchEvent(new Event("input"))}')
 assert page.locator('#canvas').evaluate('e=>e.toDataURL()')!=before
 result=page.evaluate("""async()=>{
  const {drawOutline}=await import('/outline.js');const source=document.createElement('canvas');source.width=source.height=100;const x=source.getContext('2d');x.fillStyle='red';x.beginPath();x.arc(50,50,25,0,Math.PI*2);x.fill();
  const out=document.createElement('canvas');out.width=out.height=100;const ctx=out.getContext('2d');drawOutline(ctx,{src:'test-circle',w:100,h:100,fit:'contain',outlineWidth:5,outlineColor:'#00ff00'},source);
  const alpha=(a,b)=>ctx.getImageData(a,b,1,1).data[3];return [alpha(50,22),alpha(5,5),alpha(50,50)];
 }""")
 assert result[0]>200 and result[1]==0 and result[2]==0,result
 assert not errors,errors
 browser.close()
print('PASS: four angle slots, one-click replacement, live color, silhouette outline, direct crop pan')
