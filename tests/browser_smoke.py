import tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
from pathlib import Path
import os
import json, zipfile
im=Image.new('RGB',(900,1100),'#ece8df'); d=ImageDraw.Draw(im);d.rounded_rectangle((250,160,650,950),radius=80,fill='#a37933');d.rectangle((280,400,620,650),fill='#eee6ca');d.text((320,480),'HONEY 250g',fill='black',font_size=40);im.save(str(Path(tempfile.gettempdir()) / 'product.png'))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_default_timeout(10000)
 page.goto(os.environ.get('APP_URL','http://127.0.0.1:8000'))
 page.locator('#product-file').set_input_files(str(Path(tempfile.gettempdir()) / 'product.png'))
 for name in ['remove_product_background','use_vision']:page.locator(f'[name={name}]').uncheck()
 page.get_by_role('button',name='Начать создание').click()
 page.locator('#to-product').wait_for(state='visible')
 page.wait_for_function("!document.getElementById('to-product').disabled")
 page.locator('#template-options button').nth(1).click()
 page.locator('#template-options button').nth(2).click()
 page.locator('#template-options button').nth(3).click()
 page.locator('#format').select_option('1:1')
 page.locator('#pedestal').select_option('cylinder')
 page.locator('#to-product').click()
 page.locator('#category').fill('Мёд');page.locator('#product-name').fill('Мёд цветочный')
 for label,value in [('Масса / объём','250 г'),('Состав','Мёд'),('Ширина','8 см'),('Высота','15 см')]:
  page.get_by_role('button',name='＋ '+label,exact=True).click()
  row=page.locator('.fact').last;row.locator('input').nth(1).fill(value);row.locator('[type=checkbox]').check()
 page.locator('#compose-description').click();page.locator('#confirmed').check();page.locator('#build').click()
 page.locator('#editor-step').wait_for(state='visible')
 page.screenshot(path=str(Path(tempfile.gettempdir()) / 'agro-editor.png'),full_page=True)
 assert page.locator('#scene-tabs button').count()==4
 assert '100%' in page.locator('#assessment').inner_text()
 page.locator('#layers').get_by_role('button',name='Товар',exact=True).click()
 initial_x=float(page.locator('[data-property=x]').input_value())
 page.locator('#canvas').scroll_into_view_if_needed()
 bounds=page.locator('#canvas').bounding_box()
 page.mouse.move(bounds['x']+bounds['width']*.5,bounds['y']+bounds['height']*.5)
 page.mouse.down();page.mouse.move(bounds['x']+bounds['width']*.5+25,bounds['y']+bounds['height']*.5+15,steps=5);page.mouse.up()
 assert float(page.locator('[data-property=x]').input_value())>initial_x
 page.locator('[data-add=text]').click()
 page.locator('#properties textarea').fill('Проверка текста');page.locator('#properties textarea').press('Tab')
 page.get_by_role('button',name='↑ Слой',exact=True).click()
 page.get_by_role('button',name='Дублировать',exact=True).click()
 page.get_by_role('button',name='Удалить элемент',exact=True).click()
 page.locator('#undo').click();page.locator('#redo').click()
 page.locator('#save').click()
 with page.expect_download() as dl:page.locator('#export-png').click()
 dl.value.save_as(str(Path(tempfile.gettempdir()) / 'card.png'));assert Image.open(str(Path(tempfile.gettempdir()) / 'card.png')).size==(1200,1200)
 with page.expect_download() as dl:page.locator('#export-all').click()
 dl.value.save_as(str(Path(tempfile.gettempdir()) / 'cards.zip'))
 with zipfile.ZipFile(str(Path(tempfile.gettempdir()) / 'cards.zip')) as z:
  assert len(z.namelist())==4;assert z.testzip() is None
 with page.expect_download() as dl:page.locator('#export-json').click()
 dl.value.save_as(str(Path(tempfile.gettempdir()) / 'project.json'));data=json.loads(Path(str(Path(tempfile.gettempdir()) / 'project.json')).read_text());assert len(data['scenes'])==4
 page.reload();page.locator('#resume').click();page.locator('#editor-step').wait_for(state='visible')
 assert page.locator('#layers').get_by_role('button',name='Новый текст',exact=True).count()==1
 page.locator('#project-file').set_input_files(str(Path(tempfile.gettempdir()) / 'project.json'))
 page.locator('#editor-step').wait_for(state='visible')
 page.wait_for_function("document.getElementById('message').textContent==='Проект сохранён'")
 assert not errors,errors
 print('PASS: upload, job, 4 templates, facts, 100% readiness, editing, layers, undo/redo, save/reopen, PNG, ZIP CRC, JSON; no page errors')
 browser.close()
