"""Appearance, palettes, cropping, harmony and desktop workbench regression."""
from pathlib import Path
import os, tempfile, json
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

out=Path(tempfile.gettempdir())
# Transparent product fixture, not a model-generated or recognized photograph.
im=Image.new('RGBA',(800,1000));d=ImageDraw.Draw(im)
d.rounded_rectangle((185,100,615,880),radius=100,fill='#b68741')
d.rounded_rectangle((180,100,620,220),radius=25,fill='#d3b584')
d.rounded_rectangle((200,400,600,660),radius=15,fill='#f4e9cb')
d.text((250,455),'МЁД',font=ImageFont.truetype(str(Path(__file__).resolve().parents[1]/'frontend/fonts/DejaVuSans.ttf'),60),fill='#50412c')
d.text((285,545),'250 г',font=ImageFont.truetype(str(Path(__file__).resolve().parents[1]/'frontend/fonts/DejaVuSans.ttf'),45),fill='#50412c')
im.save(out/'design-product.png')
dark=Image.new('RGBA',(700,700));ImageDraw.Draw(dark).ellipse((40,40,660,660),fill='#362a22');dark.save(out/'design-detail.png')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(12000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('APP_URL','http://127.0.0.1:8000'))
    assert not page.locator('[name=use_ocr]').count()
    page.locator('#product-file').set_input_files(out/'design-product.png')
    page.locator('#detail-files').set_input_files(out/'design-detail.png')
    page.locator('[name=remove_product_background]').uncheck();page.locator('[name=use_vision]').uncheck()
    page.locator('#upload-form [type=submit]').click()
    page.wait_for_function("!document.getElementById('to-product').disabled")
    page.locator('#design-palettes .palette-choice').first.wait_for()
    assert page.locator('#design-palettes .palette-choice').count()==4
    page.locator('#style-options button').nth(2).click()
    assert page.locator('#background-mode').input_value()=='diagonal'
    page.locator('#design-palettes .palette-choice').first.click()
    page.locator('#pedestal').select_option('box')
    page.screenshot(path=out/'agro-design.png',full_page=True)
    page.locator('#to-product').click();page.locator('#category').fill('Мёд');page.locator('#product-name').fill('Цветочный мёд')
    page.locator('#template-options button').nth(1).click()
    page.locator('#template-options button').nth(3).click()
    page.locator('#template-options button').nth(6).click()
    for label,value in [('Масса / объём','250 г'),('Состав','Мёд'),('Комплектация','Банка с крышкой')]:
        page.get_by_role('button',name='＋ '+label,exact=True).click()
        row=page.locator('.fact').last;row.locator('input').nth(1).fill(value);row.locator('[type=checkbox]').check()
    page.locator('#compose-description').click();page.locator('#confirmed').check();page.locator('#build').click()
    page.locator('#editor-step').wait_for(state='visible')
    page.locator('#layers').get_by_role('button',name='Товар',exact=True).click()
    brightness=page.locator('[data-property="Яркость"]')
    assert brightness.get_attribute('type')=='range'
    brightness.evaluate("e=>{e.value='1.15';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
    page.locator('#tab-background').click()
    bg=page.locator('#background-panel select').first
    bg.select_option('gradient')
    page.locator('#background-panel .palette-choice').nth(1).click()
    page.locator('#suggest-harmony').click();page.locator('#harmony-preview').wait_for(state='visible')
    page.get_by_role('button',name='Сравнить до / после').click();page.get_by_role('button',name='Сравнить до / после').click()
    page.get_by_role('button',name='Применить ко всем карточкам').click()
    page.locator('#save').click()
    with page.expect_download() as dl:page.locator('#export-json').click()
    dl.value.save_as(out/'design-project.json');data=json.loads((out/'design-project.json').read_text(encoding='utf-8'))
    assert data['scenes'][0]['backgroundSettings']['backgroundMode']=='gradient'
    assert len(data['scenes'])==4
    assert all(n.get('brightness') is not None for s in data['scenes'] for n in s['nodes'] if n['type']=='image' and not n.get('backgroundRole'))
    assert all('brightness' not in n for s in data['scenes'] for n in s['nodes'] if n.get('backgroundRole'))
    assert any(n.get('kind')=='box' for n in data['scenes'][0]['nodes'])
    assert any(n.get('zoom',1)>1 for n in data['scenes'][2]['nodes'] if n['type']=='image')
    assert all(len(s['nodes'])<28 for s in data['scenes'])
    # Sparse layouts never show unfilled advertising claims or placeholders.
    assert not any(n.get('placeholder') for s in data['scenes'] for n in s['nodes'])
    page.locator('#tab-element').click();page.locator('#canvas').scroll_into_view_if_needed()
    page.screenshot(path=out/'agro-editor-v2.png',full_page=True)
    for width,height in [(1280,720),(1440,900),(1920,1080),(2560,1440)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), f'Editor overflow {width}'
        assert page.locator('#save').bounding_box()['height']>=40
    assert not errors,errors
    print('PASS: no OCR UI; 4 product palettes; live backgrounds; box platform; auto crop; range controls; harmony preview/apply across all photos/scenes; 4 desktop sizes')
    browser.close()
