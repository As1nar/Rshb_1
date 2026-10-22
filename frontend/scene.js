// Shared scene renderer: editing and exported PNG use exactly this code.
export const FONTS = ['DejaVu Sans', 'DejaVu Serif', 'DejaVu Mono'];
export const STYLES = {
  studio: {name:'Studio',note:'Свет и чистая геометрия',bg:'#f3eee5',ink:'#343b36',accent:'#b49972',soft:'#e4dac8'},
  organic: {name:'Organic',note:'Мягкие природные формы',bg:'#e9eddf',ink:'#324836',accent:'#839b67',soft:'#d1dcbc'},
  promo: {name:'Promo',note:'Контраст и крупный текст',bg:'#263f35',ink:'#f8f5e9',accent:'#d9e99c',soft:'#3e5a49'},
};
export const TEMPLATES = [
  ['hero','01','Главная','Товар крупно + название'],['features','02','Характеристики','До трёх проверенных свойств'],
  ['dimensions','03','Габариты','Размерные линии и подписи'],['closeups','04','Крупные планы','Два изменяемых фрагмента'],
  ['callouts','05','Выноски','Детали с пояснениями'],['kit','06','Комплектация','Фотографии + состав набора'],['story','07','Описание','Короткая история товара'],
];
let sequence = 0;
export const uid = () => `n_${Date.now().toString(36)}_${sequence++}`;
export function node(type, title, x, y, w, h, extra={}) {
  if(type==='line' && h<0){y+=h;h=-h;extra={...extra,flip:true};}
  return {id:uid(),type,title,x,y,w,h,rotation:0,opacity:1,visible:true,locked:false,...extra};
}
export function buildScenes(project, settings) {
  const palette=STYLES[settings.style], product=project.product;
  const confirmed=product.facts.filter(f=>f.confirmed && f.value.trim());
  return settings.templates.map(template=>{
    const [W,H]=settings.format==='16:9'?[1600,900]:settings.format==='9:16'?[900,1600]:[1200,1200];
    const S=Math.min(W,H), nodes=[], X=n=>W*n/100, Y=n=>H*n/100;
    const add=(type,title,x,y,w,h,extra={})=>{const n=node(type,title,X(x),Y(y),X(w),Y(h),extra);nodes.push(n);return n;};
    const text=(title,value,x,y,w,h,size=40,extra={})=>add('text',title,x,y,w,h,{text:value,font:settings.font,fontSize:size*S/1200,bold:false,align:'left',fill:palette.ink,...extra});
    const shape=(title,x,y,w,h,fill=palette.soft,kind='rounded',extra={})=>add('shape',title,x,y,w,h,{shape:kind,fill,radius:S*.025,...extra});
    const image=(asset,x,y,w,h,crop=false)=>add('image',asset.role==='product'?'Товар':'Фото детали',x,y,w,h,{src:asset.url,fit:crop?'cover':'contain',cropX:0,cropY:0,zoom:1,radius:crop?S*.025:0});
    const label=(title,value,x,y,w=34)=>{
      if(settings.bubble!=='none')shape('Плашка: '+title,x,y,w,10,settings.style==='promo'?'#f8f5e9':'#ffffff',settings.bubble);
      return text(title,value,x+2,y+1,w-4,8,27,{fill:settings.style==='promo'?'#263f35':palette.ink});
    };
    const line=(title,x,y,w,h,extra={})=>add('line',title,x,y,w,h,{fill:palette.accent,lineWidth:S*.003,arrow:true,...extra});
    const source=project.assets[0], details=project.assets.slice(1);
    if(settings.background) add('image','Фотография фона',0,0,100,100,{src:settings.background,fit:'cover',cropX:0,cropY:0,zoom:1,locked:true});
    if(settings.style==='organic'){
      shape('Органическая форма',-14,30,51,51,palette.soft,'blob',{rotation:-20});
      shape('Цветовой акцент',78,13,35,38,'#c6b7cc','blob',{rotation:24,opacity:.7});
      shape('Мягкий круг',67,74,36,30,palette.accent,'ellipse',{opacity:.18});
    } else if(settings.style==='promo'){
      shape('Диагональный акцент',-10,70,115,8,palette.accent,'rect',{rotation:-12,opacity:.14});
    } else {
      shape('Студийный свет',12,21,77,68,'#ffffff','ellipse',{opacity:.38});
    }
    if(settings.pedestal!=='none') add('pedestal','Подставка',27,75,46,12,{fill:settings.pedestalColor,kind:settings.pedestal});
    const title=product.name||product.category||'Название товара';
    text('Название товара',title,7,5,86,16,66,{bold:true});
    if(template==='hero'){
      image(source,17,23,66,59);
      confirmed.slice(0,2).forEach((f,i)=>label(f.label,f.value,7+i*47,85,39));
    } else if(template==='features'){
      image(source,5,25,51,61);
      confirmed.slice(0,3).forEach((f,i)=>{text('Заголовок: '+f.label,f.label,60,27+i*20,34,5,21,{fill:palette.accent});label(f.label,f.value,58,33+i*20,36);});
      if(!confirmed.length)text('Добавьте характеристики','Добавьте подтверждённые характеристики',59,35,34,32,30,{placeholder:true});
    } else if(template==='dimensions'){
      image(source,23,25,54,55);
      line('Высота',15,27,0,50,{doubleArrow:true});line('Ширина',25,85,50,0,{doubleArrow:true});
      const width=confirmed.find(f=>/ширина|длина/i.test(f.label)), height=confirmed.find(f=>/высота/i.test(f.label));
      text('Значение ширины',width?.value||'Укажите ширину',29,88,46,8,30,{align:'center',placeholder:!width});
      text('Значение высоты',height?.value||'Укажите высоту',2,27,19,13,26,{placeholder:!height});
    } else if(template==='closeups'){
      image(source,3,23,52,63);
      [0,1].forEach(i=>{image(details[i]||source,61,26+i*31,31,23,true);text('Подпись фрагмента',confirmed[i]?.value||'Добавьте подпись',61,51+i*31,32,8,24,{placeholder:!confirmed[i]});});
    } else if(template==='callouts'){
      image(source,26,27,48,55);
      const points=[[4,27,35,13],[64,58,30,-14],[3,78,33,-14]];
      points.forEach(([x,y,w,h],i)=>{line('Выноска '+(i+1),x+3,y+5,w,h);label('Подпись выноски',confirmed[i]?.value||'Укажите свойство',x,y,31).placeholder=!confirmed[i];});
    } else if(template==='kit'){
      image(source,5,27,52,58);
      details.slice(0,3).forEach((a,i)=>image(a,62,24+i*18,24,16));
      const kit=confirmed.find(f=>/комплект/i.test(f.label));
      label('Комплектация',kit?.value||'Укажите комплектацию',7,86,85).placeholder=!kit;
    } else {
      image(source,45,26,51,61);
      text('Описание товара',product.description||'Добавьте описание из проверенных сведений',7,30,36,48,33,{placeholder:!product.description});
    }
    const measure=document.createElement('canvas').getContext('2d');
    for(const n of nodes.filter(n=>n.type==='text'))fitText(n,measure,Math.max(14,18*S/1200));
    return {id:uid(),template,title:TEMPLATES.find(t=>t[0]===template)[2],width:W,height:H,background:settings.bg,nodes};
  });
}

export const imageCache=new Map();
export async function loadImages(scenes){
  const urls=[...new Set(scenes.flatMap(s=>s.nodes.filter(n=>n.type==='image').map(n=>n.src)))];
  await Promise.all(urls.map(async src=>{
    if(imageCache.has(src))return;
    const img=new Image();img.src=src;
    await img.decode();imageCache.set(src,img);
  }));
}
export async function loadFonts(){
  await Promise.all(FONTS.map(font=>document.fonts.load(`24px "${font}"`)));
  await document.fonts.ready;
}
export function wrapText(ctx,text,maxWidth){
  const lines=[];
  for(const paragraph of String(text).split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/)){
      if(ctx.measureText(line?line+' '+word:word).width<=maxWidth){line=line?line+' '+word:word;continue;}
      if(line){lines.push(line);line='';}
      // Long unbroken words are wrapped too.
      for(const ch of word){if(line && ctx.measureText(line+ch).width>maxWidth){lines.push(line);line='';}line+=ch;}
    }
    lines.push(line);
  }
  return lines;
}
function path(ctx,n){
  const {w,h}=n;ctx.beginPath();
  if(n.shape==='ellipse')ctx.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);
  else if(n.shape==='blob'){
    ctx.moveTo(.1*w,.4*h);ctx.bezierCurveTo(-.1*w,-.15*h,.9*w,-.1*h,.97*w,.35*h);ctx.bezierCurveTo(1.1*w,.9*h,.65*w,1.12*h,.25*w,.88*h);ctx.bezierCurveTo(0,.76*h,.04*w,.65*h,.1*w,.4*h);
  } else ctx.roundRect(0,0,w,h,n.shape==='capsule'?Math.min(w,h)/2:n.shape==='rect'?0:Math.min(n.radius||20,w/2,h/2));
  ctx.closePath();
}
export function textLines(ctx,n){ctx.font=`${n.bold?'700':'400'} ${n.fontSize}px "${n.font}"`;return wrapText(ctx,n.text,n.w);}
export function fitText(n,ctx,min=14){
  while(n.fontSize>min && textLines(ctx,n).length*n.fontSize*1.25>n.h)n.fontSize=Math.max(min,n.fontSize-1);
}
export function renderScene(ctx,scene,selected=null){
  const cv=ctx.canvas;ctx.save();ctx.setTransform(cv.width/scene.width,0,0,cv.height/scene.height,0,0);
  ctx.fillStyle=scene.background;ctx.fillRect(0,0,scene.width,scene.height);
  for(const n of scene.nodes){
    if(!n.visible)continue;
    ctx.save();ctx.globalAlpha=n.opacity??1;ctx.translate(n.x+n.w/2,n.y+n.h/2);ctx.rotate((n.rotation||0)*Math.PI/180);ctx.translate(-n.w/2,-n.h/2);
    ctx.fillStyle=n.fill||'#233c32';
    if(n.type==='shape'){path(ctx,n);ctx.fill();}
    if(n.type==='pedestal'){
      const c=n.fill||'#d8c7ad';ctx.fillStyle=c;
      ctx.save();ctx.shadowColor='#0003';ctx.shadowBlur=24;ctx.shadowOffsetY=16;
      if(n.kind==='cylinder'){
        ctx.fillRect(0,n.h*.25,n.w,n.h*.5);ctx.beginPath();ctx.ellipse(n.w/2,n.h*.75,n.w/2,n.h*.25,0,0,Math.PI);ctx.fill();
      }else ctx.fillRect(0,n.h*.15,n.w,n.h*.85);
      ctx.restore();ctx.fillStyle='#0002';ctx.fillRect(0,n.h*.3,n.w,n.h*.5);ctx.fillStyle=c;
      if(n.kind==='cylinder'){ctx.beginPath();ctx.ellipse(n.w/2,n.h*.25,n.w/2,n.h*.25,0,0,Math.PI*2);ctx.fill();}else ctx.fillRect(0,0,n.w,n.h*.2);
    }
    if(n.type==='image'){
      const img=imageCache.get(n.src);
      ctx.beginPath();ctx.roundRect(0,0,n.w,n.h,Math.min(n.radius||0,n.w/2,n.h/2));ctx.clip();
      if(img){
        ctx.filter=`brightness(${n.brightness??1}) contrast(${n.contrast??1}) saturate(${n.saturation??1})`;
        const scale=(n.fit==='cover'?Math.max(n.w/img.width,n.h/img.height):Math.min(n.w/img.width,n.h/img.height))*(n.zoom||1);
        const w=img.width*scale,h=img.height*scale;
        ctx.drawImage(img,(n.w-w)/2+(n.cropX||0)*n.w/100,(n.h-h)/2+(n.cropY||0)*n.h/100,w,h);
      } else {ctx.fillStyle='#eee';ctx.fillRect(0,0,n.w,n.h);}
    }
    if(n.type==='text'){
      const lines=textLines(ctx,n);ctx.textBaseline='top';ctx.textAlign=n.align||'left';
      const x=n.align==='center'?n.w/2:n.align==='right'?n.w:0;
      // Same clipping in editor and export. Overflow is reported by inspectScene.
      ctx.beginPath();ctx.rect(0,0,n.w,n.h);ctx.clip();
      lines.forEach((line,i)=>ctx.fillText(line,x,i*n.fontSize*1.25));
    }
    if(n.type==='line'){
      // Lines use positive bounding boxes and a separate endpoint direction.
      const y1=n.flip? n.h:0,y2=n.flip?0:n.h;
      ctx.strokeStyle=n.fill;ctx.lineWidth=n.lineWidth||3;ctx.beginPath();ctx.moveTo(0,y1);ctx.lineTo(n.w,y2);ctx.stroke();
      if(n.arrow){const angle=Math.atan2(y2-y1,n.w),a=14;const head=(x,y,t)=>{ctx.beginPath();ctx.moveTo(x-a*Math.cos(t-.45),y-a*Math.sin(t-.45));ctx.lineTo(x,y);ctx.lineTo(x-a*Math.cos(t+.45),y-a*Math.sin(t+.45));ctx.stroke();};head(n.w,y2,angle);if(n.doubleArrow)head(0,y1,angle+Math.PI);}
    }
    ctx.restore();
  }
  if(selected){const n=scene.nodes.find(n=>n.id===selected);if(n?.visible){ctx.save();ctx.translate(n.x+n.w/2,n.y+n.h/2);ctx.rotate((n.rotation||0)*Math.PI/180);ctx.strokeStyle='#3f80df';ctx.lineWidth=2*scene.width/cv.clientWidth;ctx.setLineDash([6,4]);ctx.strokeRect(-n.w/2,-n.h/2,n.w,n.h);ctx.restore();}}
  ctx.restore();
}
export function hitTest(scene,x,y){
  return [...scene.nodes].reverse().find(n=>{
    if(!n.visible||n.locked)return false;
    const a=-(n.rotation||0)*Math.PI/180,dx=x-n.x-n.w/2,dy=y-n.y-n.h/2;
    const lx=dx*Math.cos(a)-dy*Math.sin(a)+n.w/2,ly=dx*Math.sin(a)+dy*Math.cos(a)+n.h/2;
    return lx>=-5&&lx<=n.w+5&&ly>=-5&&ly<=n.h+5;
  });
}
export function inspectScene(scene,ctx){
  const issues=[];
  for(const n of scene.nodes.filter(n=>n.visible)){
    if(n.type==='image'&&!imageCache.has(n.src))issues.push(`${n.title}: изображение недоступно`);
    if(n.placeholder)issues.push(`${n.title}: замените текст-заполнитель`);
    if(n.type==='text' && textLines(ctx,n).length*n.fontSize*1.25>n.h+1)issues.push(`${n.title}: текст не помещается — увеличьте блок или уменьшите шрифт`);
    if(n.type==='text'&&(n.x<0||n.y<0||n.x+n.w>scene.width+1||n.y+n.h>scene.height+1))issues.push(`${n.title}: блок выходит за холст`);
  }
  return issues;
}
