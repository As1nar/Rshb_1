import {hitHandle,startTransform,applyTransform,cursorForHandle} from './transform.js';
import {FONTS,STYLES,TEMPLATES,uid,node,buildScenes,loadImages,loadFonts,renderScene,hitTest,inspectScene,fitText,BACKGROUNDS,applyBackground,backgroundNodes} from './scene.js';
import {productProfile,colorSuggestions,harmonyProposal,inkFor,contrast,analyseImage,rgbToHsl,hexRgb} from './color.js';
const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
let project=null, settings={style:'studio',format:'3:4',bg:STYLES.studio.bg,backgroundMode:STYLES.studio.backgroundMode,secondary:STYLES.studio.soft,accent:STYLES.studio.accent,backgroundStrength:.7,backgroundAngle:125,pedestal:'none',pedestalColor:'#d8c7ad',bubble:'rounded',font:FONTS[0],templates:['hero'],background:null,pattern:'none',assetRoles:{},assetCaptions:{}};
let cropId=null;
const viewNames={front:'Спереди',threequarter:'Три четверти',back:'Сзади',left:'Слева',right:'Справа',top:'Сверху',other:'Другой ракурс'};
let uploadViews=[];
let active=0,selected=null,history=[],future=[],pollToken=0,drag=null,toastTimer,nameTouched=false,dirty=false;
let profile=null,profileKey=null,previewToken=0,templatePreviewToken=0,previewMode='product',harmony=null,harmonyActive=false;
const scene=()=>project?.scenes[active], selectedNode=()=>scene()?.nodes.find(n=>n.id===selected);
const clone=value=>JSON.parse(JSON.stringify(value));
function element(tag,content,className){const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(className)el.className=className;return el;}
function button(text,callback,className){const el=element('button',text,className);el.type='button';el.addEventListener('click',()=>run(callback));return el;}
function message(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('message').hidden=true,6500);}
async function run(fn){try{return await fn();}catch(e){console.error(e);message(e.message||'Не удалось выполнить действие');}}
async function api(url,options={}){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw Error('Сервер вернул некорректный ответ');}if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail||'Ошибка сервера'));return data;}
function showStep(id){['upload','design','product','editor'].forEach((s,i)=>{$(`${s}-step`).hidden=s!==id;$('steps').children[i].classList.toggle('active',s===id);});window.scrollTo({top:0,behavior:'smooth'});}
function checkpoint(){history.push(JSON.stringify(project.scenes));if(history.length>60)history.shift();future=[];dirty=true;$('undo').disabled=false;$('redo').disabled=true;}
function undo(){if(!history.length)return;future.push(JSON.stringify(project.scenes));project.scenes=JSON.parse(history.pop());active=Math.min(active,project.scenes.length-1);selected=null;dirty=true;renderEditor();}
function redo(){if(!future.length)return;history.push(JSON.stringify(project.scenes));project.scenes=JSON.parse(future.pop());selected=null;dirty=true;renderEditor();}
function syncDesign(){
  for(const [id,key] of [['format','format'],['bg-color','bg'],['pedestal','pedestal'],['pedestal-color','pedestalColor'],['bubble','bubble'],['design-font','font']])$(id).value=settings[key];
  renderChoices();syncBackgroundDesign();
}
function renderChoices(){
  $('style-options').replaceChildren(...Object.entries(STYLES).map(([key,s])=>{
    const b=button('',()=>{settings.style=key;settings.bubble=key==='studio'?'none':'rounded';settings.pedestal='none';settings.font=FONTS[0];settings.pattern=key==='promo'?'cross':'none';settings.bg=s.bg;settings.accent=s.accent;settings.secondary=s.soft;settings.backgroundMode=s.backgroundMode;syncDesign();},'style-choice'+(settings.style===key?' selected':''));
    b.setAttribute('aria-pressed',String(settings.style===key));b.append(element('span','',`style-art ${key}`),element('strong',s.name),element('small',s.note));return b;
  }));
  $('template-options').replaceChildren(...TEMPLATES.map(([id,num,title,desc])=>{
    const b=button('',()=>{if(settings.templates.includes(id)){if(settings.templates.length===1)return message('Оставьте хотя бы один шаблон');settings.templates=settings.templates.filter(x=>x!==id);}else{if(settings.templates.length===4)return message('За один проход можно создать до четырёх карточек');settings.templates.push(id);}renderChoices();renderDesignPreview();},'template-choice'+(settings.templates.includes(id)?' selected':''));
    b.setAttribute('aria-pressed',String(settings.templates.includes(id)));const copy=element('span');copy.append(element('strong',title),element('small',desc));const cv=element('canvas');cv.dataset.template=id;cv.width=180;cv.height=240;b.dataset.template=id;b.append(cv,copy);return b;
  }));$('template-count').textContent=`${settings.templates.length} / 4`;scheduleTemplatePreviews();
}
for(const select of document.querySelectorAll('.font-select'))FONTS.forEach(font=>select.append(new Option(font,font)));
for(const [id,key] of [['format','format'],['bg-color','bg'],['pedestal','pedestal'],['pedestal-color','pedestalColor'],['bubble','bubble'],['design-font','font']])$(id).addEventListener('input',()=>{settings[key]=$(id).value;renderDesignPreview();});
$('clear-bg').onclick=()=>{settings.background=null;$('bg-file').value='';renderDesignPreview();message('Фотография фона убрана');};
$('bg-file').onchange=()=>run(async()=>{const file=$('bg-file').files[0];if(!file)return;const data=new FormData();data.set('image',file);const result=await api(`/api/projects/${project.id}/background`,{method:'POST',body:data});settings.background=result.url;renderDesignPreview();message('Фон загружен');});
function renderUploadViews(){
 const host=$('upload-preview');host.replaceChildren();
 uploadViews.forEach((slot,i)=>{
  const card=element('div',undefined,'view-slot'),img=element('img');img.src=slot.url;img.alt=viewNames[slot.type];
  const menu=element('details'),summary=element('summary',(i===0?'★ Основное · ':'')+viewNames[slot.type]);menu.append(summary);
  const select=element('select');select.setAttribute('aria-label','Ракурс фото '+(i+1));Object.entries(viewNames).forEach(([v,t])=>select.append(new Option(t,v)));select.value=slot.type;select.onchange=()=>{slot.type=select.value;renderUploadViews();};menu.append(select);
  menu.append(button('Сделать основным',()=>{uploadViews.splice(i,1);uploadViews.unshift(slot);renderUploadViews();}),button('Удалить фото',()=>{URL.revokeObjectURL(slot.url);uploadViews.splice(i,1);renderUploadViews();}));
  card.append(img,menu);host.append(card);
 });
}
$('product-file').onchange=()=>{
 const files=[...$('product-file').files];if(uploadViews.length+files.length>8)return message('До восьми ракурсов. Удалите лишние фото.');
 files.forEach(file=>uploadViews.push({file,url:URL.createObjectURL(file),type:uploadViews.length?'other':'front'}));renderUploadViews();
};
$('upload-form').onsubmit=event=>{event.preventDefault();run(async()=>{
  if($('detail-files').files.length>5)throw Error('Можно добавить до пяти фотографий деталей');
  if(!uploadViews.length)throw Error('Добавьте фото товара');
  const data=new FormData($('upload-form'));data.delete('product_image');data.set('product_image',uploadViews[0].file);
  uploadViews.slice(1).forEach(s=>data.append('views',s.file));data.set('view_types_json',JSON.stringify(uploadViews.map(s=>s.type)));
  for(const key of ['remove_product_background','remove_details_background','use_vision'])data.set(key,$('upload-form').elements[key].checked?'true':'false');
  if(!$('detail-files').files.length)data.delete('details');
  const submit=$('upload-form').querySelector('[type=submit]');submit.disabled=true;
  try{project=await api('/api/projects',{method:'POST',body:data});localStorage.setItem('agrovision.project',project.id);showStep('design');renderDesignPreview();poll(project.id);}finally{submit.disabled=false;}
});};
async function poll(id){
  const token=++pollToken;
  const tick=async()=>{
    if(token!==pollToken)return;
    try{
      const result=await api(`/api/projects/${id}`);if(token!==pollToken)return;project=result;renderJob();run(refreshProfile);
      if(['queued','running'].includes(project.job.status))setTimeout(tick,1100);
    }catch(e){message('Не удалось получить статус: '+e.message);if(token===pollToken)setTimeout(tick,4000);}
  };await tick();
}
function renderJob(){
  const job=project.job,host=$('job-status');host.replaceChildren(element('strong',job.stage));
  if(['queued','running'].includes(job.status)){
    const progress=element('progress');progress.max=job.total||1;progress.value=job.completed;host.append(progress,element('small',`Готово этапов: ${job.completed} из ${job.total}. Длительность этапов различается.`));
  }
  $('job-warnings').replaceChildren(...job.warnings.map(w=>element('p',w,'warning')));
  if(job.elapsed_seconds!==undefined)host.append(element('small',`Обработка: ${job.elapsed_seconds} с. Режим: ${{fast:'быстрый',balanced:'сбалансированный',detail:'сложные контуры'}[project.options.background_quality]||'ранее выбранный'}`));
  $('to-product').disabled=['queued','running'].includes(job.status);$('retry').hidden=['queued','running'].includes(job.status);$('retry-options').hidden=$('retry').hidden;$('retry-quality').value=project.options.background_quality||'fast';
}
$('retry').onclick=()=>run(async()=>{const data=new FormData();data.set('background_quality',$('retry-quality').value);await api(`/api/projects/${project.id}/retry`,{method:'POST',body:data});poll(project.id);});
$('to-product').onclick=()=>{showStep('product');renderProduct();};
$('back-design').onclick=()=>{readProduct();showStep('design');syncDesign();};
const suggestionsFor=category=>{
  if(/мёд|сыр|чай|кофе|продукт/i.test(category))return ['Масса / объём','Состав','Срок годности','Условия хранения','Комплектация'];
  if(/одеж|обув|сумк/i.test(category))return ['Размер','Материал','Цвет','Уход','Комплектация'];
  return ['Основная характеристика','Материал','Ширина','Высота','Комплектация'];
};
function renderSuggestions(){
  const labels=[...new Set([...suggestionsFor($('category').value),'Ширина','Высота'])];
  $('suggestions').replaceChildren(...labels.map(label=>button('＋ '+label,()=>addFact(label))));
}
function addFact(label='Характеристика',value='',source='user'){
  if(project.product.facts.length>=30)return message('До 30 характеристик в одном проекте');
  project.product.facts.push({label,value,source,confirmed:false});renderFacts();$('confirmed').checked=false;
}
function renderFacts(){
  $('facts').replaceChildren(...project.product.facts.map((fact,i)=>{
    const row=element('div',undefined,'fact'),fields=element('div',undefined,'fields');
    const label=element('input');label.value=fact.label;label.placeholder='Характеристика';label.maxLength=100;label.setAttribute('aria-label','Название характеристики');
    const value=element('input');value.value=fact.value;value.placeholder='Введите известное значение';value.maxLength=500;value.setAttribute('aria-label','Значение характеристики');
    const check=element('input');check.type='checkbox';check.checked=fact.confirmed;
    const confirmedLabel=element('label',undefined,'check');confirmedLabel.append(check,document.createTextNode('Подтверждаю'));
    const footer=element('div',undefined,'fact-footer');footer.append(confirmedLabel,element('small','Источник: пользователь'),button('×',()=>{project.product.facts.splice(i,1);$('confirmed').checked=false;renderFacts();scheduleTemplatePreviews();}));
    label.oninput=()=>{fact.label=label.value;fact.confirmed=false;check.checked=false;$('confirmed').checked=false;scheduleTemplatePreviews();};
    value.oninput=()=>{fact.value=value.value;fact.confirmed=false;check.checked=false;$('confirmed').checked=false;scheduleTemplatePreviews();};
    check.onchange=()=>{if(check.checked&&(!fact.label.trim()||!fact.value.trim())){check.checked=false;message('Сначала заполните название и значение');}fact.confirmed=check.checked;$('confirmed').checked=false;scheduleTemplatePreviews();};
    fields.append(label,value);row.append(fields,footer);return row;
  }));
}
function renderProduct(){
  $('return-editor').hidden=!project.scenes.length;
  const p=project.product;$('category').value=p.category;$('product-name').value=p.name;$('description').value=p.description;$('confirmed').checked=p.confirmed;nameTouched=Boolean(p.name&&p.name!==p.category);
  $('recognition-images').replaceChildren(...project.assets.map(a=>{const img=element('img');img.src=a.url;img.alt=a.role==='product'?'Обработанный товар':'Деталь';return img;}));
  $('categories').replaceChildren(...project.recognition.categories.map(c=>button(c.category+(` · сходство ${Math.round((c.similarity||0)*100)}%`),()=>{$('category').value=c.category;categoryChanged();})));
  $('recognition-note').textContent=project.recognition.note||'Выберите категорию и введите сведения вручную.';
  if(!p.category&&project.recognition.categories.length){$('category').value=project.recognition.categories[0].category;categoryChanged();}
  renderFacts();renderSuggestions();renderDetailRoles();renderChoices();
}
function categoryChanged(){if(!nameTouched)$('product-name').value=$('category').value;renderSuggestions();$('confirmed').checked=false;scheduleTemplatePreviews();}
$('category').oninput=categoryChanged;$('product-name').oninput=()=>{nameTouched=true;$('confirmed').checked=false;scheduleTemplatePreviews();};$('description').oninput=()=>{$('confirmed').checked=false;scheduleTemplatePreviews();};
$('add-fact').onclick=()=>addFact();
$('compose-description').onclick=()=>{
  const facts=project.product.facts.filter(f=>f.confirmed&&f.value.trim());
  $('description').value=[($('product-name').value||$('category').value).trim(),...facts.map(f=>`${f.label}: ${f.value}`)].filter(Boolean).join('. ')+'.';$('confirmed').checked=false;scheduleTemplatePreviews();
};
function readProduct(){
  const facts=project.product.facts.filter(f=>f.label.trim()&&f.value.trim()).map(f=>({...f,source:'user'}));
  project.product={category:$('category').value.trim(),name:$('product-name').value.trim()||$('category').value.trim(),description:$('description').value.trim(),facts,confirmed:$('confirmed').checked};
}
$('build').onclick=()=>run(async()=>{
  readProduct();if(!project.product.category||!project.product.name)throw Error('Укажите категорию и название товара');
  if(project.scenes.length&&!confirm('Пересобрать карточки? Изменения в редакторе будут заменены новыми композициями.'))return;
  await refreshProfile();await loadFonts();const newScenes=buildScenes(project,settings);await loadImages(newScenes);
  project.scenes=newScenes;project.settings=clone(settings);active=0;selected=null;history=[];future=[];dirty=true;
  await save();showStep('editor');renderEditor();
});
$('back-product').onclick=()=>{showStep('product');renderProduct();};
$('return-editor').onclick=()=>run(async()=>{readProduct();await save();showStep('editor');renderEditor();message('Сведения сохранены. Тексты и оформление существующих карточек остаются как в редакторе.');});
async function save(){
  if(!project)return;
  const result=await api(`/api/projects/${project.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:project.product,settings,scenes:project.scenes})});
  project.assessment=result.assessment;dirty=false;renderAssessment();message('Проект сохранён');
}
$('save').onclick=()=>run(save);
function draw(){canvas.dataset.cropping=String(cropId===selected&&!!selected);if(scene()){const current=harmony&&harmonyActive&&harmony.sceneId===scene().id?harmonizedScene(scene(),harmony.proposal):scene();renderScene(ctx,current,selected);}}
function renderEditor(){
  $('scene-tabs').replaceChildren(...project.scenes.map((s,i)=>button(`${i+1}. ${s.title}`,()=>{active=i;selected=null;clearHarmony();renderEditor();},i===active?'selected':'')));
  canvas.width=scene().width;canvas.height=scene().height;canvas.style.aspectRatio=`${scene().width}/${scene().height}`;
  // CSS sets both display dimensions to the scene ratio; object-fit never adds a hit-test margin.
  const wrap=$('canvas-wrap'),available=wrap.clientWidth-46,maxHeight=window.innerHeight*.66;
  const scale=Math.min(available/scene().width,maxHeight/scene().height);
  canvas.style.width=`${Math.max(150,scene().width*scale)}px`;canvas.style.height=`${Math.max(150/scene().width*scene().height,scene().height*scale)}px`;
  $('scene-bg').value=scene().background;$('editor-title').textContent=scene().title;
  $('add-image').replaceChildren(new Option('Выберите изображение',''),...project.assets.map((a,i)=>new Option(a.role==='view'?(viewNames[a.view_type]||'Ракурс'):i?'Фото детали '+i:'Товар',a.id)));
  renderLayers();renderProperties();renderBackgroundPanel();draw();renderAssessment();$('undo').disabled=!history.length;$('redo').disabled=!future.length;
  run(async()=>{await loadImages(project.scenes);draw();});
}
function renderLayers(){
  $('layers').replaceChildren(...[...scene().nodes].reverse().map(n=>{
    const row=element('div',undefined,'layer'+(n.id===selected?' active':''));
    const choose=button(n.title,()=>{selected=n.id;renderLayers();renderProperties();draw();},'layer-name');choose.title=n.title;
    const eye=button(n.visible?'◉':'○',()=>{checkpoint();n.visible=!n.visible;renderEditor();});eye.title=n.visible?'Скрыть':'Показать';
    const lock=button(n.locked?'▣':'◇',()=>{checkpoint();n.locked=!n.locked;renderEditor();});lock.title=n.locked?'Разблокировать':'Заблокировать';
    row.append(choose,eye,lock);return row;
  }));
}
function field(title,value,type,onChange,options={}){
  const label=element('label',title),input=element(type==='textarea'?'textarea':type==='select'?'select':'input');
  if(type==='select')for(const option of options.values){
    const names={contain:'Вписать целиком',cover:'Заполнить рамку',left:'По левому краю',center:'По центру',right:'По правому краю',rect:'Прямоугольник',rounded:'Скруглённый',capsule:'Капсула',ellipse:'Эллипс',blob:'Мягкая форма',cylinder:'Цилиндр',box:'Изометрическая платформа'};
    input.append(new Option(typeof option==='object'?option.label:names[option]||option,typeof option==='object'?option.value:option));
  }
  else if(type!=='textarea')input.type=type;
  if(type==='textarea'){input.rows=4;input.maxLength=3000;}
  for(const key of ['min','max','step'])if(options[key]!==undefined)input[key]=options[key];
  input.value=value;input.dataset.property=options.key||title;
  let recorded=false;
  const format=v=>options.percent?Math.round(Number(v)*100)+'%':Number(v).toFixed(options.step<1?2:0);
  const output=type==='range'?element('output',format(value)):null;
  const apply=()=>run(()=>{
    let next=['number','range'].includes(type)?Number(input.value):input.value;
    if(['number','range'].includes(type)){
      if(!Number.isFinite(next))throw Error('Введите конечное число');
      next=Math.max(Number(options.min??-10000),Math.min(Number(options.max??10000),next));input.value=next;
    }
    if(!recorded){checkpoint();recorded=true;}
    onChange(next);if(output)output.textContent=format(next);draw();renderAssessment();renderLayers();
    if(selectedNode()?.type==='image')run(async()=>{await loadImages(project.scenes);draw();});
  });
  input.addEventListener(['range','color'].includes(type)?'input':'change',apply);
  input.addEventListener('change',()=>recorded=false);
  if(output)label.append(output);label.append(input);return label;
}
function renderProperties(){
  const host=$('properties'),n=selectedNode();host.replaceChildren();
  if(!n){host.append(element('p','Выберите объект на холсте или в списке слоёв.','hint'));return;}
  const tools=element('div',undefined,'layer-tools');
  tools.append(button('↓ Слой',()=>moveLayer(-1)),button('↑ Слой',()=>moveLayer(1)));
  host.append(field('Название слоя',n.title,'text',v=>n.title=v),tools);
  const geometry=element('div',undefined,'fields');
  for(const [key,title] of [['x','X'],['y','Y'],['w','Ширина'],['h','Высота']])geometry.append(field(title,Math.round(n[key]),'number',v=>n[key]=v,{min:['w','h'].includes(key)?1:-5000,max:10000,key}));
  host.append(geometry,field('Поворот, °',n.rotation,'range',v=>n.rotation=v,{min:-360,max:360}),field('Непрозрачность',n.opacity,'range',v=>n.opacity=v,{min:0,max:1,step:.05,percent:true}));
  if(n.type==='text'){
    host.append(field('Текст',n.text,'textarea',v=>{n.text=v;n.placeholder=false;},{key:'text'}),field('Шрифт',n.font,'select',v=>n.font=v,{values:FONTS}),field('Размер шрифта',n.fontSize,'range',v=>n.fontSize=v,{min:8,max:300}),field('Выравнивание',n.align,'select',v=>n.align=v,{values:['left','center','right']}));
    host.append(button(n.bold?'Жирный: да':'Жирный: нет',()=>{checkpoint();n.bold=!n.bold;renderEditor();}));
    host.append(button('Вписать текст в блок',()=>{checkpoint();fitText(n,ctx,8);renderEditor();}));
    host.append(button(n.backplate?'Подложка текста: есть':'Добавить подложку текста',()=>{checkpoint();n.backplate=n.backplate?null:'#ffffff';renderEditor();}));
    if(n.backplate)host.append(field('Цвет подложки',n.backplate,'color',v=>n.backplate=v),field('Прозрачность подложки',n.backplateOpacity??.88,'range',v=>n.backplateOpacity=v,{min:0,max:1,step:.05,percent:true}));
  }
  if(n.fill)host.append(field('Цвет',n.fill,'color',v=>{n.fill=v;if(n.paint)n.paint.colors[0]=v;}));
  if(n.type==='shape')host.append(field('Форма',n.shape,'select',v=>n.shape=v,{values:['rect','rounded','capsule','ellipse','blob']}));
  if(['shape','image'].includes(n.type))host.append(field('Скругление',n.radius||0,'range',v=>n.radius=v,{min:0,max:500}));
  if(n.type==='pedestal')host.append(field('Подставка',n.kind,'select',v=>n.kind=v,{values:['cylinder','box']}),field('Толщина платформы',n.depth??.36,'range',v=>n.depth=v,{min:.1,max:.65,step:.05}));
  if(['image','shape'].includes(n.type))host.append(field('Обводка, px',n.outlineWidth||0,'range',v=>n.outlineWidth=v,{min:0,max:30,step:1}),field('Цвет обводки',n.outlineColor||'#ffffff','color',v=>n.outlineColor=v));
  if(n.type==='image'){
    const views=project.assets.filter(a=>a.role==='product'||a.role==='view'),gallery=element('div',undefined,'angle-gallery');
    if(views.length>1){host.append(element('strong','Ракурс · замена одним кликом'));for(const a of views){const b=button('',async()=>{checkpoint();n.src=a.url;n.assetId=a.id;n.cropX=0;n.cropY=0;n.zoom=1;await loadImages(project.scenes);renderProperties();draw();});const im=element('img');im.src=a.url;im.alt=viewNames[a.view_type]||'Основной';b.title=im.alt;b.append(im,element('small',im.alt));gallery.append(b);}host.append(gallery);}
    host.append(button(cropId===n.id?'✓ Завершить кадрирование':'✥ Изменить фрагмент на холсте',()=>{cropId=cropId===n.id?null:n.id;renderProperties();draw();}),element('p',cropId===n.id?'Тяните фото внутри рамки. Колесо мыши — масштаб. Escape — готово.':'Двойной щелчок по фото открывает кадрирование.','hint'));
    host.append(field('Размещение',n.fit,'select',v=>n.fit=v,{values:['contain','cover']}),field('Масштаб внутри рамки',n.zoom||1,'range',v=>n.zoom=v,{min:.1,max:6,step:.1,percent:true}),field('Сдвиг фото X, %',n.cropX||0,'range',v=>n.cropX=v,{min:-100,max:100}),field('Сдвиг фото Y, %',n.cropY||0,'range',v=>n.cropY=v,{min:-100,max:100}));
    host.append(field('Заменить фото',n.src,'select',v=>n.src=v,{values:[...new Set([n.src,...project.assets.map(a=>a.url)])].map(src=>{const i=project.assets.findIndex(a=>a.url===src);return {value:src,label:i===0?'Товар':i>0?'Фото детали '+i:'Текущее фото'};})}));
    for(const [key,title] of [['brightness','Яркость'],['contrast','Контраст'],['saturation','Насыщенность']])host.append(field(title,n[key]??1,'range',v=>n[key]=v,{min:0,max:2,step:.05,percent:true}));
  }
  if(n.type==='line'){
    host.append(field('Толщина линии',n.lineWidth,'range',v=>n.lineWidth=v,{min:1,max:30}),button(n.arrow?'Стрелка: да':'Стрелка: нет',()=>{checkpoint();n.arrow=!n.arrow;renderEditor();}),button('Изменить направление',()=>{checkpoint();n.flip=!n.flip;renderEditor();}));
  }
  host.append(element('hr'),button('Дублировать',duplicate),button('Удалить элемент',removeSelected));
  if(n.locked){host.append(element('p','Слой заблокирован. Разблокируйте его в списке слоёв.','warning'));for(const input of host.querySelectorAll('input,textarea,select,button'))input.disabled=true;}
}
function moveLayer(delta){const n=selectedNode();if(!n||n.locked)return;const list=scene().nodes,index=list.indexOf(n),target=index+delta;if(target<0||target>=list.length)return;checkpoint();[list[index],list[target]]=[list[target],list[index]];renderEditor();}
function duplicate(){const n=selectedNode();if(!n||n.locked)return;checkpoint();const copy={...clone(n),id:uid(),title:n.title+' · копия',x:n.x+20,y:n.y+20};scene().nodes.push(copy);selected=copy.id;renderEditor();}
function removeSelected(){const n=selectedNode();if(!n||n.locked)return;checkpoint();scene().nodes=scene().nodes.filter(x=>x.id!==selected);selected=null;renderEditor();}
for(const b of document.querySelectorAll('[data-add]'))b.onclick=()=>{
  if(scene().nodes.length>=100)return message('В сцене допустимо до 100 элементов');
  checkpoint();const kind=b.dataset.add,S=Math.min(scene().width,scene().height),x=scene().width*.15,y=scene().height*.35;
  let n;
  if(kind==='text')n=node('text','Новый текст',x,y,S*.5,S*.18,{text:'Ваш текст',font:settings.font,fontSize:40,fill:STYLES[settings.style].ink,align:'left'});
  else if(kind==='pedestal')n=node('pedestal','Подставка',x,y,S*.5,S*.13,{fill:settings.pedestalColor,kind:'cylinder'});
  else if(kind==='line')n=node('line','Линия',x,y,S*.4,1,{fill:'#839b67',lineWidth:3,arrow:true});
  else n=node('shape','Фигура',x,y,S*.4,S*.2,{fill:'#d1dcbc',shape:kind,radius:30});
  scene().nodes.push(n);selected=n.id;renderEditor();
};
$('add-image').onchange=()=>{const a=project.assets.find(a=>a.id===$('add-image').value);if(!a)return;checkpoint();const n=node('image','Фото',100,200,400,500,{src:a.url,fit:'contain',zoom:1,cropX:0,cropY:0});scene().nodes.push(n);selected=n.id;renderEditor();};
let backgroundGesture=false;
$('scene-bg').onchange=()=>backgroundGesture=false;
$('scene-bg').oninput=()=>{if(!backgroundGesture){checkpoint();backgroundGesture=true;}const config={...(scene().backgroundSettings||settings),bg:$('scene-bg').value};updateSceneBackground(config);renderBackgroundPanel();};
function clampCrop(n){
 if(n.fit!=='cover')return;
 const img=project.assets.find(a=>a.url===n.src);if(!img)return;
 n.zoom=Math.max(1,n.zoom||1);const z=Math.max(n.w/img.width,n.h/img.height)*n.zoom;
 const maxX=Math.max(0,(img.width*z-n.w)/2/n.w*100),maxY=Math.max(0,(img.height*z-n.h)/2/n.h*100);
 n.cropX=Math.max(-maxX,Math.min(maxX,n.cropX||0));n.cropY=Math.max(-maxY,Math.min(maxY,n.cropY||0));
}
function point(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)*scene().width/r.width,y:(event.clientY-r.top)*scene().height/r.height};}
canvas.onpointerdown=event=>{
 if(!scene())return;const p=point(event);
 if(cropId===selected&&selectedNode()?.type==='image'&&!selectedNode().locked){const n=selectedNode();drag={crop:true,id:n.id,start:p,cropX:n.cropX||0,cropY:n.cropY||0,recorded:false};canvas.setPointerCapture(event.pointerId);event.preventDefault();return;}
 cropId=null;canvas.dataset.cropping='false';const unit=scene().width/canvas.getBoundingClientRect().width;
 const handle=hitHandle(selectedNode(),p.x,p.y,unit,scene()),n=handle?selectedNode():hitTest(scene(),p.x,p.y);
 selected=n?.id||null;sidebarTab(false);renderLayers();renderProperties();draw();canvas.focus();
 if(n){drag={...startTransform(n,handle,p),id:n.id,recorded:false};canvas.setPointerCapture(event.pointerId);event.preventDefault();}
};
canvas.onpointermove=event=>{
 if(!scene())return;const p=point(event),n=selectedNode(),unit=scene().width/canvas.getBoundingClientRect().width;
 if(!drag){if(cropId===n?.id){canvas.style.cursor='grab';return;}const handle=hitHandle(n,p.x,p.y,unit,scene());canvas.style.cursor=handle?cursorForHandle(handle,n.rotation):hitTest(scene(),p.x,p.y)?'move':'default';return;}
 if(!n||drag?.wheel)return;
 if(!drag.recorded&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>2*unit){checkpoint();drag.recorded=true;clearHarmony();}
 if(!drag.recorded)return;
 if(drag.crop){const a=-(n.rotation||0)*Math.PI/180,dx=p.x-drag.start.x,dy=p.y-drag.start.y;n.cropX=drag.cropX+(dx*Math.cos(a)-dy*Math.sin(a))/n.w*100;n.cropY=drag.cropY+(dx*Math.sin(a)+dy*Math.cos(a))/n.h*100;clampCrop(n);canvas.style.cursor='grabbing';draw();return;}
 applyTransform(n,drag,p,event.shiftKey);canvas.style.cursor=drag.mode==='rotate'?'grabbing':drag.mode==='resize'?cursorForHandle(drag.handle,n.rotation):'move';draw();
};
const finishDrag=()=>{if(drag?.recorded){renderProperties();renderAssessment();renderLayers();draw();}drag=null;canvas.style.cursor='default';};
canvas.onpointerup=finishDrag;canvas.onpointercancel=finishDrag;canvas.onlostpointercapture=finishDrag;
canvas.addEventListener('wheel',event=>{const n=selectedNode();if(cropId!==n?.id||n?.type!=='image'||n.locked)return;event.preventDefault();if(!drag){checkpoint();drag={wheel:true};}n.zoom=Math.max(.2,Math.min(6,(n.zoom||1)*Math.exp(-event.deltaY*.001)));clampCrop(n);draw();clearTimeout(canvas.cropTimer);canvas.cropTimer=setTimeout(()=>{drag=null;renderProperties();},180);},{passive:false});
canvas.ondblclick=()=>{if(selectedNode()?.type==='image'){cropId=selected;renderProperties();draw();return;}if(selectedNode()?.type==='text'){$('properties').querySelector('textarea')?.focus();$('properties').querySelector('textarea')?.select();}};
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){cropId=null;renderProperties();draw();return;}
  if($('editor-step').hidden||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelected();}
  const n=selectedNode(),directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(n&&!n.locked&&directions[event.key]){event.preventDefault();checkpoint();const d=directions[event.key],step=event.shiftKey?10:1;n.x+=d[0]*step;n.y+=d[1]*step;draw();renderProperties();renderAssessment();}
});
$('undo').onclick=undo;$('redo').onclick=redo;
window.addEventListener('resize',()=>{if(project?.scenes.length&&!$('editor-step').hidden)renderEditor();});
function renderAssessment(){
  const host=$('assessment');if(!project?.assessment||!scene())return;const a=project.assessment;
  host.replaceChildren();const heading=element('div',undefined,'assessment-title');heading.append(element('strong','Готовность сведений'),element('span',`${a.score}%`,'score'));host.append(heading);
  Object.entries(a.checks).forEach(([label,ok])=>{const row=element('div',undefined,'check-row');row.append(element('span',label),element('span',ok?'✓':'○'));host.append(row);});
  if(a.missing_fields.length)host.append(element('p','Профиль категории: добавьте '+a.missing_fields.join(', '),'hint'));
  const issues=[...a.warnings,...inspectScene(scene(),ctx)];
  issues.forEach(w=>host.append(element('p',w,'warning')));host.append(element('p',a.note,'hint'));
}
function download(blob,name){const link=element('a');link.href=URL.createObjectURL(blob);link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),30000);}
async function pngBlob(s){await loadFonts();await loadImages([s]);const out=document.createElement('canvas'),longSide=Number($('export-size').value),scale=longSide/Math.max(s.width,s.height);out.width=Math.round(s.width*scale);out.height=Math.round(s.height*scale);renderScene(out.getContext('2d'),s);return await new Promise((resolve,reject)=>out.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG')),'image/png'));}
function exportNotice(){const issues=project.scenes.flatMap(s=>inspectScene(s,ctx));if(issues.length||!project.product.confirmed)message('Экспортирован черновик: проверьте предупреждения и подтвердите сведения перед публикацией.');}
$('export-png').onclick=()=>run(async()=>{download(await pngBlob(scene()),`agrovision-${active+1}.png`);exportNotice();});
$('export-json').onclick=()=>run(async()=>{await save();download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'agrovision-project.json');});
// ZIP with stored PNG entries: no external libraries or paid services.
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(files){
  const parts=[],central=[];let offset=0,centralSize=0;
  const header=size=>{const a=new Uint8Array(size);return [a,new DataView(a.buffer)];};
  for(const file of files){const name=new TextEncoder().encode(file.name),crc=crc32(file.bytes),[local,v]=header(30+name.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,file.bytes.length,true);v.setUint32(22,file.bytes.length,true);v.setUint16(26,name.length,true);local.set(name,30);parts.push(local,file.bytes);
    const [entry,c]=header(46+name.length);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,file.bytes.length,true);c.setUint32(24,file.bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);entry.set(name,46);central.push(entry);centralSize+=entry.length;offset+=local.length+file.bytes.length;
  }
  const [end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
}
$('export-all').onclick=()=>run(async()=>{const files=[];for(let i=0;i<project.scenes.length;i++)files.push({name:`card-${i+1}.png`,bytes:new Uint8Array(await(await pngBlob(project.scenes[i])).arrayBuffer())});download(zip(files),'agrovision-cards.zip');exportNotice();});
$('resume').hidden=!localStorage.getItem('agrovision.project');
$('import-project').onclick=()=>$('project-file').click();
$('project-file').onchange=()=>run(async()=>{
  const file=$('project-file').files[0];if(!file)return;
  if(file.size>2_000_000)throw Error('JSON проекта должен быть не больше 2 МБ');
  const data=JSON.parse(await file.text());
  if(data.version!==2||!Array.isArray(data.scenes)||!data.scenes.length||data.scenes.length>4)throw Error('Нужен JSON проекта AgroVision версии 2');
  for(const s of data.scenes){
    if(!Number.isFinite(s.width)||!Number.isFinite(s.height)||s.width<320||s.height<320||s.width>3000||s.height>3000||!Array.isArray(s.nodes)||s.nodes.length>100)throw Error('Некорректный размер или состав сцены');
    for(const n of s.nodes){
      if(!['text','shape','image','line','pedestal'].includes(n.type)||!['x','y','w','h'].every(k=>Number.isFinite(n[k]))||n.w<0||n.h<0)throw Error('Некорректный элемент сцены');
      if(n.type==='image'&&(!n.src.startsWith(`/uploads/${data.id}/`)||n.src.includes('..')))throw Error('Некорректный путь к фотографии');
    }
  }
  const existing=await api(`/api/projects/${data.id}`);
  if(['queued','running'].includes(existing.job.status))throw Error('Дождитесь завершения обработки этого проекта');
  await loadFonts();await loadImages(data.scenes);
  if(dirty&&!confirm('Загрузить JSON? Несохранённые изменения будут потеряны.'))return;
  project={...existing,product:data.product,scenes:data.scenes};settings={...settings,...data.settings};project.settings=clone(settings);
  history=[];future=[];active=0;selected=null;dirty=true;localStorage.setItem('agrovision.project',project.id);await refreshProfile();syncDesign();await save();showStep('editor');renderEditor();
});
$('resume').onclick=()=>run(async()=>{
  if(dirty&&!confirm('Открыть сохранённую версию? Несохранённые изменения будут потеряны.'))return;
  project=await api(`/api/projects/${localStorage.getItem('agrovision.project')}`);settings={...settings,...project.settings};await refreshProfile();syncDesign();
  if(['queued','running'].includes(project.job.status)){showStep('design');renderDesignPreview();poll(project.id);}
  else if(project.scenes.length){await loadFonts();await loadImages(project.scenes);active=0;selected=null;history=[];future=[];showStep('editor');renderEditor();}
  else{renderJob();showStep('design');renderDesignPreview();}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
function syncBackgroundDesign(){
  for(const [id,key] of [['background-mode','backgroundMode'],['bg-secondary','secondary'],['bg-accent','accent'],['bg-strength','backgroundStrength'],['bg-angle','backgroundAngle']])$(id).value=settings[key];
  $('background-pattern').value=settings.pattern||'none';renderBackgroundGallery();
  $('bg-strength-value').textContent=Math.round(settings.backgroundStrength*100)+'%';$('bg-angle-value').textContent=settings.backgroundAngle+'°';
  renderPalettes($('design-palettes'),false);renderDesignPreview();
}
$('background-pattern').onchange=()=>{settings.pattern=$('background-pattern').value;syncBackgroundDesign();};
for(const [key,label] of BACKGROUNDS)$('background-mode').append(new Option(label,key));
for(const [id,key] of [['background-mode','backgroundMode'],['bg-secondary','secondary'],['bg-accent','accent'],['bg-strength','backgroundStrength'],['bg-angle','backgroundAngle']])$(id).oninput=()=>{settings[key]=['backgroundStrength','backgroundAngle'].includes(key)?Number($(id).value):$(id).value;syncBackgroundDesign();};
async function refreshProfile(){
  if(!project)return;
  const key=project.assets.map(a=>a.url).join('|');
  if(key===profileKey)return;
  const id=project.id;
  const measured=await productProfile(project);
  if(project.id!==id)return;
  profile=measured;if(settings.paletteReferenceColor&&profile)profile=manualProfile(profile,settings.paletteReferenceColor);profileKey=key;settings.focal=profile?.focal;
  renderPalettes($('design-palettes'),false);renderDesignPreview();
}
async function renderDesignPreview(){
 if(!project||$('design-step').hidden)return;const token=++previewToken;
 await loadFonts();await loadImages([{nodes:[...project.assets.map(a=>({type:'image',src:a.url})),...(settings.background?[{type:'image',src:settings.background}]:[])]}]);if(token!==previewToken)return;
 const preview=buildScenes({...project,product:{...project.product,name:project.product.name||'Ваш товар'}},{...settings,templates:['hero']})[0];
 if(previewMode==='background')preview.nodes=preview.nodes.filter(n=>n.backgroundRole);
 const cv=$('design-preview');cv.width=preview.width/2;cv.height=preview.height/2;renderScene(cv.getContext('2d'),preview);
}
$('preview-product').onclick=()=>{previewMode='product';$('preview-product').classList.add('selected');$('preview-background').classList.remove('selected');run(renderDesignPreview);};
$('preview-background').onclick=()=>{previewMode='background';$('preview-product').classList.remove('selected');$('preview-background').classList.add('selected');run(renderDesignPreview);};
function renderBackgroundGallery(){
 $('background-gallery').replaceChildren(...BACKGROUNDS.map(([id,label])=>{
  const b=button('',()=>{settings.backgroundMode=id;settings.background=null;$('bg-file').value='';syncBackgroundDesign();},'background-choice'+(settings.backgroundMode===id&&!settings.background?' selected':''));
  b.dataset.background=id;b.setAttribute('aria-pressed',String(settings.backgroundMode===id&&!settings.background));
  const cv=element('canvas');cv.width=120;cv.height=100;const sample={width:120,height:100,background:settings.bg,nodes:[]};sample.nodes=backgroundNodes(sample,{...settings,background:null,backgroundMode:id});renderScene(cv.getContext('2d'),sample);
  b.append(cv,element('span',label));return b;
 }));
}
function draftProduct(){return {...project.product,name:$('product-name').value.trim()||$('category').value.trim()||project.product.name||'Ваш товар',category:$('category').value,description:$('description').value};}
let templateTimer;
function scheduleTemplatePreviews(){clearTimeout(templateTimer);templateTimer=setTimeout(()=>run(renderTemplatePreviews),100);}
async function renderTemplatePreviews(){
 if(!project||$('product-step').hidden)return;const token=++templatePreviewToken;
 await loadFonts();await loadImages([{nodes:project.assets.map(a=>({type:'image',src:a.url}))}]);if(token!==templatePreviewToken)return;
 const previews=buildScenes({...project,product:draftProduct()},{...settings,templates:TEMPLATES.map(t=>t[0])});
 for(const [i,s] of previews.entries()){const cv=$('template-options').querySelector(`canvas[data-template="${s.template}"]`);if(!cv)continue;cv.width=s.width/6;cv.height=s.height/6;renderScene(cv.getContext('2d'),s);}
}
function renderDetailRoles(){
 const host=$('detail-roles');host.replaceChildren();if(project.assets.length<2)return;
 host.append(element('h3','Дополнительные изображения'),element('p','Приложение само разместит их в выбранных карточках. При желании уточните назначение.','hint'));
 for(const [i,a] of project.assets.filter(a=>a.role==='detail').entries()){
  const row=element('div',undefined,'detail-role'),img=element('img');img.src=a.url;img.alt='Дополнительное изображение '+(i+1);
  const select=element('select');select.setAttribute('aria-label','Назначение детали '+(i+1));
  for(const [value,label] of [['auto','Автоматически'],['decor','Декор рядом с товаром'],['closeup','Крупный план / фото детали'],['kit','Комплектация'],['omit','Не использовать']])select.append(new Option(label,value));
  select.value=settings.assetRoles?.[a.id]||'auto';select.onchange=()=>{settings.assetRoles={...settings.assetRoles,[a.id]:select.value};scheduleTemplatePreviews();};
  const caption=element('input');caption.placeholder='Подпись к фото (необязательно)';caption.maxLength=100;caption.setAttribute('aria-label','Подпись детали '+(i+1));caption.value=settings.assetCaptions?.[a.id]||'';
  caption.oninput=()=>{$('confirmed').checked=false;};
  caption.onchange=()=>{settings.assetCaptions={...settings.assetCaptions,[a.id]:caption.value};scheduleTemplatePreviews();};
  const fields=element('div');fields.append(select,caption);row.append(img,fields);host.append(row);
 }
}
function manualProfile(p,color){return {...p,color,rgb:hexRgb(color),hsl:rgbToHsl(...hexRgb(color)),colors:[{color,share:1,hsl:rgbToHsl(...hexRgb(color))}],confidence:'manual'};}
function renderPalettes(host,editor){
 host.replaceChildren(element('h3','Палитры по цветам товара'));
 if(!profile){host.append(element('p','Загрузите фотографию — предложим подходящие сочетания.','hint'));return;}
 const intro=element('div',undefined,'product-color');
 for(const c of (profile.colors||[{color:profile.color,share:1}]).slice(0,3)){const dot=element('i');dot.style.background=c.color;dot.title=`${c.color} · ${Math.round(c.share*100)}%`;intro.append(dot);}
 intro.append(element('small',profile.confidence==='uncertain'?'Сложный фон — оттенок можно уточнить ниже':'Основные цвета объекта, включая светлые и тёмные'));host.append(intro);
 const manual=element('label','Уточнить основной оттенок'),picker=element('input');picker.type='color';picker.value=profile.color;
 picker.onchange=()=>{settings.paletteReferenceColor=picker.value;profile=manualProfile(profile,picker.value);renderPalettes(host,editor);};manual.append(picker);host.append(manual);
 for(const palette of colorSuggestions(profile)){
  const b=button('',()=>{
   if(editor){checkpoint();const config={...(scene().backgroundSettings||settings),bg:palette.bg,secondary:palette.secondary,accent:palette.accent};updateSceneBackground(config,true);renderBackgroundPanel();}
   else{settings.bg=palette.bg;settings.secondary=palette.secondary;settings.accent=palette.accent;settings.pedestalColor=palette.secondary;syncDesign();}
  },'palette-choice');b.dataset.palette=palette.name;
  const thumb=element('canvas');thumb.width=100;thumb.height=80;const sample={width:300,height:240,background:palette.bg,nodes:[]};
  sample.nodes=backgroundNodes(sample,{...settings,...palette,background:null});sample.nodes.push(node('image','Товар',85,18,160,205,{src:project.assets[0].url,fit:'contain'}));renderScene(thumb.getContext('2d'),sample);
  const swatches=element('span',undefined,'swatches');[palette.bg,palette.secondary,palette.accent].forEach(color=>{const dot=element('i');dot.style.background=color;swatches.append(dot);});
  const copy=element('span');copy.append(element('strong',palette.name),element('small',palette.note),swatches);b.append(thumb,copy);host.append(b);
 }
}
function updateSceneBackground(config,recolor=false){
  if(selectedNode()?.backgroundRole)selected=null;
  if(recolor){const ink=inkFor(config.bg);for(const n of scene().nodes){if(n.type==='text'&&!n.fixedCellInk)n.fill=ink;if(n.type==='pedestal')n.fill=config.secondary;}}
  applyBackground(scene(),config);$('scene-bg').value=config.bg;draw();renderLayers();
  run(async()=>{await loadImages([scene()]);draw();});
}
function renderBackgroundPanel(){
  if(!scene())return;const host=$('background-panel'),config={...settings,...scene().backgroundSettings,bg:scene().background};host.replaceChildren(element('h3','Оформление фона'),element('p','Меняйте текущую карточку. Товар и тексты останутся на своих местах.','hint'));
  const mode=field('Рисунок фона',config.backgroundMode,'select',v=>{config.backgroundMode=v;config.background=null;updateSceneBackground(config);},{values:BACKGROUNDS.map(([id])=>id)});
  for(const option of mode.querySelectorAll('option'))option.textContent=BACKGROUNDS.find(([id])=>id===option.value)?.[1]||option.value;
  host.append(mode,field('Узор',config.pattern||'none','select',v=>{config.pattern=v;updateSceneBackground(config);},{values:[{value:'none',label:'Без узора'},{value:'dots',label:'Точки'},{value:'cross',label:'Плюсы'},{value:'lines',label:'Линии'}]}));
  for(const [key,label] of [['bg','Основной цвет'],['secondary','Второй цвет'],['accent','Акцент']])host.append(field(label,config[key],'color',v=>{config[key]=v;updateSceneBackground(config);}));
  host.append(field('Выразительность',config.backgroundStrength??.7,'range',v=>{config.backgroundStrength=v;updateSceneBackground(config);},{min:0,max:1,step:.05,percent:true}),field('Направление',config.backgroundAngle??125,'range',v=>{config.backgroundAngle=v;updateSceneBackground(config);},{min:0,max:360,step:5}));
  const photo=element('label','Фотография фона'),upload=element('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';
  upload.onchange=()=>run(async()=>{if(!upload.files[0])return;const data=new FormData();data.set('image',upload.files[0]);const result=await api(`/api/projects/${project.id}/background`,{method:'POST',body:data});checkpoint();config.background=result.url;updateSceneBackground(config);renderBackgroundPanel();});photo.append(upload);host.append(photo);
  if(config.background){
    host.append(field('Приближение фона',config.backgroundZoom||1,'range',v=>{config.backgroundZoom=v;updateSceneBackground(config);},{min:1,max:3,step:.05,percent:true}),field('Сдвиг фона X',config.backgroundX||0,'range',v=>{config.backgroundX=v;updateSceneBackground(config);},{min:-60,max:60,step:1}),field('Сдвиг фона Y',config.backgroundY||0,'range',v=>{config.backgroundY=v;updateSceneBackground(config);},{min:-60,max:60,step:1}),field('Тонировка',config.photoWash??.12,'range',v=>{config.photoWash=v;updateSceneBackground(config);},{min:0,max:.8,step:.02,percent:true}),button('Убрать фото фона',()=>{checkpoint();config.background=null;updateSceneBackground(config);renderBackgroundPanel();}));
  }
  const palettes=element('div',undefined,'palette-panel');renderPalettes(palettes,true);host.append(palettes);
}
function sidebarTab(background){$('element-panel').hidden=background;$('background-panel').hidden=!background;$('tab-element').classList.toggle('selected',!background);$('tab-background').classList.toggle('selected',background);}
$('tab-element').onclick=()=>sidebarTab(false);$('tab-background').onclick=()=>sidebarTab(true);
function harmonizedScene(s,proposal){const copy=clone(s);for(const n of copy.nodes){const match=proposal.find(p=>p.src===n.src);if(n.type==='image'&&!n.backgroundRole&&match)for(const key of ['brightness','contrast','saturation'])n[key]=match[key];}return copy;}
function clearHarmony(){harmony=null;harmonyActive=false;$('harmony-preview').hidden=true;}
$('suggest-harmony').onclick=()=>run(async()=>{
  await refreshProfile();await loadImages(project.scenes);
  const input={background:scene().background,nodes:project.assets.map(a=>({type:'image',src:a.url}))};
  const proposal=harmonyProposal(input);if(!proposal.length)throw Error('Не удалось измерить цвета фотографии');
  harmony={sceneId:scene().id,proposal};harmonyActive=true;
  const host=$('harmony-preview');host.hidden=false;host.replaceChildren(element('p','Предпросмотр коррекции. Ограничиваем изменения, чтобы сохранить цвет товара.','hint'));
  for(const [i,p] of proposal.entries())host.append(element('p',`${i?'Деталь '+i:'Товар'}: яркость ${Math.round(p.brightness*100)}%, контраст ${Math.round(p.contrast*100)}%, насыщенность ${Math.round(p.saturation*100)}%`,'hint'));
  host.append(button('Сравнить до / после',()=>{harmonyActive=!harmonyActive;draw();message(harmonyActive?'После: предложенная коррекция':'До: текущие настройки');}),button('Применить ко всем карточкам',()=>{checkpoint();project.scenes=project.scenes.map(s=>harmonizedScene(s,proposal));clearHarmony();renderEditor();message('Мягкая коррекция применена ко всем изображениям товара и деталей. Фон не изменён.');},'primary'),button('Отменить предпросмотр',()=>{clearHarmony();draw();}));draw();
});
syncDesign();
