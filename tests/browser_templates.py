import tempfile
"""All 63 style/format/template combinations + mobile upload page."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('APP_URL','http://127.0.0.1:8000'))
    result=page.evaluate('''async()=>{
      const m=await import('/scene.js');await m.loadFonts();
      const photo=document.createElement('canvas');photo.width=400;photo.height=600;
      const pc=photo.getContext('2d');pc.fillStyle='#a88749';pc.fillRect(50,50,300,500);
      const src=photo.toDataURL();
      const facts=[['Масса / объём','250 г'],['Состав','Мёд'],['Ширина','8 см'],['Высота','15 см'],['Комплектация','Банка с крышкой']].map(([label,value])=>({label,value,confirmed:true}));
      const project={product:{name:'Мёд цветочный',category:'Мёд',description:'Цветочный мёд. Масса: 250 г.',facts},assets:[{url:src,role:'product'}]};
      let count=0;const issues=[];
      for(const style of Object.keys(m.STYLES))for(const format of ['1:1','16:9','9:16'])for(const [template] of m.TEMPLATES){
        const settings={style,format,bg:m.STYLES[style].bg,font:m.FONTS[0],pedestal:'cylinder',pedestalColor:'#d8c7ad',bubble:'rounded',templates:[template]};
        const [scene]=m.buildScenes(project,settings);await m.loadImages([scene]);
        const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;
        m.renderScene(canvas.getContext('2d'),scene);
        if(!canvas.toDataURL().startsWith('data:image/png'))throw Error('PNG failed');
        if(scene.nodes.some(n=>!Number.isFinite(n.x)||n.w<0||n.h<0))throw Error('Invalid geometry');
        const problems=m.inspectScene(scene,canvas.getContext('2d'));
        if(problems.length)issues.push({style,format,template,problems});
        // Unconfirmed characteristics must never enter the generated copy.
        const privateProject=structuredClone(project);privateProject.product.facts=[{label:'Состав',value:'SECRET_UNCONFIRMED',confirmed:false}];
        if(m.buildScenes(privateProject,settings)[0].nodes.some(n=>(n.text||'').includes('SECRET_UNCONFIRMED')))throw Error('Unconfirmed fact leaked');
        count++;
      }
      return {count,issues};
    }''')
    assert result['count']==63,result
    assert not result['issues'],result['issues']
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile horizontal overflow'
    page.screenshot(path=str(Path(tempfile.gettempdir()) / 'agro-mobile.png'),full_page=True)
    assert not errors,errors
    print('PASS: 63 style/format/template combinations; no overflow or unconfirmed facts in templates; mobile upload fits')
    browser.close()
