import {drawOutline} from './outline.js';
import {renderSelection} from './transform.js';
import {imageCache,loadImages} from './assets.js';
import {analyseImage,inkFor,contrast} from './color.js';
export {imageCache,loadImages};
// One scene model and renderer for editing, live previews and PNG export.
export const FONTS=['Manrope','Cormorant Garamond','DejaVu Sans','DejaVu Serif','DejaVu Mono'];
export const STYLES={
  studio:{name:'Минимализм',note:'Воздух · крупный фрагмент · тонкие линии',bg:'#efeee8',ink:'#292b27',accent:'#897a60',soft:'#ddd8cb',backgroundMode:'plain'},
  organic:{name:'Уютный',note:'Тёплый свет · мягкие формы · спокойные подписи',bg:'#e8dace',ink:'#49382d',accent:'#997257',soft:'#c4a88f',backgroundMode:'cozy'},
  promo:{name:'Геометрия',note:'Чёткая форма · цветовой акцент · ячейки',bg:'#f4f6f8',ink:'#162c36',accent:'#0298b5',soft:'#d9edf1',backgroundMode:'diagonal'},
};
export const BACKGROUNDS=[['plain','Однотонный'],['gradient','Мягкий градиент'],['arch','Арка'],['diagonal','Диагональ'],['tiles','Геометрические ячейки'],['cozy','Тёплый интерьер'],['spotlight','Световое пятно']];
export const TEMPLATES=[['hero','01','Главная','Крупный товар и один акцент'],['features','02','Характеристики','До трёх читаемых ячеек'],['dimensions','03','Габариты','Тонкие линии, только ваши размеры'],['closeups','04','Крупные планы','Автоматический зум на детали'],['callouts','05','Выноски','Один товар и две подписи'],['kit','06','Комплектация','Товар и содержимое набора'],['story','07','Акцент на детали','Крупный фрагмент и короткий текст']];
let sequence=0;
export const uid=()=>`n_${Date.now().toString(36)}_${sequence++}`;
export function node(type,title,x,y,w,h,extra={}){
  if(type==='line'&&w<0){x+=w;w=-w;extra={...extra,flipX:true};}
  if(type==='line'&&h<0){y+=h;h=-h;extra={...extra,flip:true};}
  return {id:uid(),type,title,x,y,w,h,rotation:0,opacity:1,visible:true,locked:false,...extra};
}
export function shade(hex,t){const to=t>0?255:0;return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-Math.abs(t))+to*Math.abs(t)).toString(16).padStart(2,'0')).join('');}
function readable(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);return c[0]*.2126+c[1]*.7152+c[2]*.0722>.56?'#242b29':'#fffdf7';}
export function backgroundNodes(scene,settings){
  const W=scene.width,H=scene.height,S=Math.min(W,H),style=STYLES[settings.style]||STYLES.studio,mode=settings.backgroundMode||style.backgroundMode;
  const bg=settings.bg||style.bg,accent=settings.accent||style.accent,secondary=settings.secondary||style.soft,strength=settings.backgroundStrength??.7,angle=settings.backgroundAngle??125,nodes=[];
  const add=(type,title,x,y,w,h,extra)=>nodes.push(node(type,title,x*W,y*H,w*W,h*H,{backgroundRole:true,role:'background',locked:true,...extra}));
  const shape=(title,x,y,w,h,fill,kind='rect',extra={})=>add('shape',title,x,y,w,h,{shape:kind,fill,...extra});
  const finish=()=>{if(settings.pattern&&settings.pattern!=='none')add('shape','Узор фона',.82,.04,.14,.26,{shape:'rect',fill:accent,pattern:settings.pattern,opacity:.16});return nodes;};
  if(settings.background){add('image','Фотография фона',0,0,1,1,{src:settings.background,fit:'cover',zoom:settings.backgroundZoom||1,cropX:settings.backgroundX||0,cropY:settings.backgroundY||0});shape('Тонировка фона',0,0,1,1,bg,'rect',{opacity:settings.photoWash??.12});return finish();}
  if(mode==='gradient')shape('Мягкий градиент',0,0,1,1,bg,'rect',{paint:{colors:[bg,secondary],angle},opacity:strength});
  if(mode==='arch')shape('Арка фона',.43,.17,.65,.97,secondary,'rounded',{radius:S*.34,opacity:strength*.5});
  if(mode==='diagonal'){
    shape('Цветовая диагональ',-.12,.43,1.4,.76,secondary,'rect',{rotation:-14,opacity:strength});
    shape('Цветовой угол',.53,.74,.69,.35,accent,'rounded',{radius:S*.16,opacity:strength});
  }
  if(mode==='tiles'){
    shape('Крупная ячейка',.46,.31,.49,.63,accent,'rounded',{radius:S*.09,opacity:strength});
    shape('Угловая ячейка',.72,-.09,.4,.24,secondary,'rounded',{radius:S*.1,opacity:strength});
  }
  if(mode==='cozy'){
    shape('Тёплый свет',0,0,1,1,bg,'rect',{paint:{colors:[shade(bg,.26),secondary],angle:105},opacity:strength});
    shape('Поверхность',0,.79,1,.21,secondary,'rect',{paint:{colors:[shade(secondary,.3),shade(secondary,-.12)],angle:90},opacity:.9});
    shape('Свет на стене',.04,.12,.56,.63,'#fff3d7','ellipse',{opacity:.15*strength});
  }
  if(mode==='spotlight')shape('Световое пятно',.06,.12,.95,.95,secondary,'ellipse',{paint:{colors:[shade(bg,.3),bg],radial:true},opacity:strength});
  return finish();
}
export function applyBackground(scene,settings){scene.background=settings.bg;scene.backgroundSettings=structuredClone(settings);scene.nodes=[...backgroundNodes(scene,settings),...scene.nodes.filter(n=>!n.backgroundRole)];}
export function buildScenes(project,settings){
 const style=STYLES[settings.style]||STYLES.studio,p=project.product,views=project.assets.filter(a=>a.role==='product'||a.role==='view');
 const facts=p.facts.filter(f=>f.confirmed&&f.value.trim()),ink=inkFor(settings.bg||style.bg),accent=settings.accent||style.accent;
 const extras=project.assets.filter(a=>a.role==='detail').map(a=>({...a,usage:settings.assetRoles?.[a.id]||'auto'})).filter(a=>a.usage!=='omit');
 const titleName=p.name||p.category||'Ваш товар',profiles=new Map(project.assets.map(a=>[a.url,analyseImage(a.url)]));
 return settings.templates.map((template,sceneIndex)=>{
  const [W,H]=settings.format==='16:9'?[1600,900]:settings.format==='9:16'?[900,1600]:settings.format==='3:4'?[1200,1600]:[1200,1200];
  const source=views[sceneIndex%views.length]||project.assets[0],minimal=settings.style==='studio';
  const S=Math.min(W,H),nodes=[],notes=[],used=new Set();
  const add=(type,title,x,y,w,h,extra={})=>{const n=node(type,title,W*x/100,H*y/100,W*w/100,H*h/100,extra);nodes.push(n);return n;};
  const text=(title,value,x,y,w,h,size=40,extra={})=>add('text',title,x,y,w,h,{text:String(value),font:settings.font||FONTS[0],fontSize:size*S/1200,bold:false,align:'left',fill:ink,...extra});
  const shape=(title,x,y,w,h,fill,extra={})=>add('shape',title,x,y,w,h,{shape:'rounded',radius:S*.025,fill,...extra});
  const line=(title,x,y,w,h,extra={})=>add('line',title,x,y,w,h,{fill:ink,lineWidth:S*.0018,arrow:false,...extra});
  const image=(asset,x,y,w,h,extra={})=>{used.add(asset.id||asset.url);return add('image',asset===source?'Товар':`Деталь ${project.assets.findIndex(a=>a.url===asset.url)}`,x,y,w,h,{src:asset.url,assetId:asset.id,role:asset===source?'product':'detail',fit:'contain',zoom:1,cropX:0,cropY:0,...extra});};
  const intrinsic=a=>imageCache.get(a.url)||{width:a.width||600,height:a.height||900};
  const fitted=(asset,x,y,w,h,extra={})=>{
   const im=intrinsic(asset),scale=Math.min(W*w/100/im.width,H*h/100/im.height),nw=im.width*scale/W*100,nh=im.height*scale/H*100;
   return image(asset,x+(w-nw)/2,y+h-nh,nw,nh,extra);
  };
  const cropped=(asset,x,y,w,h,index=0,extra={})=>{
   const n=image(asset,x,y,w,h,{fit:'cover',zoom:1.5,radius:S*.035,...extra}),im=intrinsic(asset),focus=(index===2?{x:.5,y:.5}:profiles.get(asset.url)?.focal[index])||{x:.5,y:index?.7:.3};
   const scale=Math.max(n.w/im.width,n.h/im.height)*n.zoom;
   const ox=(n.w-im.width*scale)/2+(0.5-focus.x)*im.width*scale,oy=(n.h-im.height*scale)/2+(0.5-focus.y)*im.height*scale;
   // Clamp cover crops so transparent/empty margins are not exposed by the automatic offset.
   n.cropX=(Math.max(Math.min(0,ox),n.w-im.width*scale)-(n.w-im.width*scale)/2)/n.w*100;
   n.cropY=(Math.max(Math.min(0,oy),n.h-im.height*scale)-(n.h-im.height*scale)/2)/n.h*100;
   return n;
  };
  const frame=(asset,x,y,w,h,index=0,circle=false)=>{
   if(!minimal)shape('Рамка детали',x-.6,y-.4,w+1.2,h+.8,settings.style==='organic'?'#fff8ed':'#ffffff',{radius:circle?S:S*.025,shadow:true});
   const n=cropped(asset,x,y,w,h,index,{zoom:asset===source?1.35:1.08,radius:circle?S:S*.02,clipShape:circle?'ellipse':'rounded'});
   const caption=settings.assetCaptions?.[asset.id];if(caption)text('Подпись детали',caption,x,y+h+1,w,6,24);
   return n;
  };
  const cell=(f,x,y,w=28,h=15,i=0)=>{
   const boxed=!minimal&&settings.bubble!=='none',cellInk=boxed?'#243039':ink;
   if(boxed)shape('Ячейка: '+f.label,x,y,w,h,settings.style==='organic'?'#fff9f0':'#ffffff',{shape:settings.bubble,opacity:settings.style==='organic'?.89:.97,shadow:settings.style==='promo'});
   // A small geometric sign carries no extra product claim.
   if(settings.style==='promo')shape('Акцент характеристики',x+2,y+2,1,h-4,accent,{radius:3});
   const inset=settings.style==='promo'?5:2.5;
   text('Значение: '+f.label,f.value,x+inset,y+1.8,w-inset-2,h*.52,64,{bold:true,fill:cellInk,fixedCellInk:boxed});
   text('Подпись: '+f.label,f.label,x+inset,y+h*.64,w-inset-2,h*.25,28,{fill:cellInk,fixedCellInk:boxed});
  };
  const header=template==='dimensions'?'Размеры':template==='closeups'?'В деталях':titleName;
  text('Название товара',header,6,4,88,16,header.length<13?178:112,{bold:!minimal});
  if(['dimensions','closeups'].includes(template))text('Название модели',titleName,6,20,85,5,25);
  let main;
  const product=(x,y,w,h,withPedestal=false)=>{
   if(withPedestal&&settings.pedestal!=='none'){
    const pw=w*.8,px=x+(w-pw)/2,ph=settings.pedestal==='box'?13:9,py=y+h-3;
    add('pedestal','Подставка',px,py,pw,ph,{fill:settings.pedestalColor||style.soft,kind:settings.pedestal,depth:.32});
   }
   main=fitted(source,x,y,w,h);
   if(!minimal){const sh=shape('Контактная тень',main.x/W*100+main.w/W*15,(main.y+main.h)/H*100-.8,main.w/W*70,2,'#1e2421',{shape:'ellipse',opacity:.12,blur:S*.009});
   nodes.splice(nodes.indexOf(main),0,nodes.pop());}
   return main;
  };
  if(template==='hero'){
   product(20,24,76,67,true);if(facts[0])cell(facts[0],5,32,25,14);
  }else if(template==='features'){
   product(40,26,56,64,true);facts.slice(0,3).forEach((f,i)=>cell(f,5,30+i*20,30,17,i));
   if(!facts.length)notes.push('Добавьте подтверждённые свойства, чтобы заполнить ячейки.');
  }else if(template==='dimensions'){
   product(24,28,65,55);
   const width=facts.find(f=>/ширина|длина/i.test(f.label)),height=facts.find(f=>/высота/i.test(f.label));
   const mx=main.x/W*100,my=main.y/H*100,mw=main.w/W*100,mh=main.h/H*100;
   if(width){line('Ширина',mx,87,mw,0,{arrow:true,doubleArrow:true});text('Значение ширины',width.value,mx,90,mw,6,44,{align:'center'});}else notes.push('Для размерной линии нужна ширина или длина.');
   if(height){line('Высота',Math.max(15,mx-5),my,0,mh,{arrow:true,doubleArrow:true});text('Значение высоты',height.value,1,my+mh*.4,13,11,40);}else notes.push('Для размерной линии нужна высота.');
  }else if(template==='closeups'){
   main=cropped(source,39,25,67,75,1,{zoom:1.35,radius:0});
   if(!minimal)shape('Панель деталей',5,28,37,65,settings.style==='organic'?'#fff5e8':'#ffffff',{opacity:.8,radius:S*.04});
   const candidates=extras.filter(a=>a.usage!=='decor'&&!(a.usage==='auto'&&profiles.get(a.url)?.hasAlpha)),frames=[...candidates,source,source,source].slice(0,3);
   frames.forEach((a,i)=>frame(a,8,31+i*20,30,17,i));
  }else if(template==='callouts'){
   product(24,28,66,61);facts.slice(0,2).forEach((f,i)=>{const x=i?66:4,y=i?65:31;line('Выноска',x+5,y+10,i?-19:28,i?-6:10);text('Свойство: '+f.label,f.value,x,y,30,10,34);});
  }else if(template==='kit'){
   product(7,28,60,56);extras.slice(0,3).forEach((a,i)=>frame(a,72,29+i*18,22,15,i%2));
   const kit=facts.find(f=>/комплект/i.test(f.label));if(kit)text('Комплектация',kit.value,6,88,87,8,31);else notes.push('Состав набора не указан.');
  }else{
   main=cropped(source,39,24,69,80,1,{zoom:1.55,radius:0});
   const description=p.description||facts.slice(0,2).map(f=>`${f.label}: ${f.value}`).join('. ');
   if(description){if(!minimal)shape('Подложка описания',4,30,36,42,settings.style==='organic'?'#fff7ea':'#ffffff',{opacity:.9,radius:S*.025});text('Короткое описание',description,7,33,30,36,35,{fill:'#29332f',fixedCellInk:true});}
  }
  // Use uploaded images in every content family. Photos become detail windows;
  // transparent assets become supporting objects behind the main silhouette.
  const remaining=extras.filter(a=>!used.has(a.id||a.url));
  const selectedExtras=remaining.slice((sceneIndex*2)%Math.max(1,remaining.length)).concat(remaining).filter((a,i,arr)=>arr.findIndex(b=>b.url===a.url)===i).slice(0,2);
  const placements=[[72,71,23,23],[3,70,26,24],[72,28,23,21],[4,48,24,21]],occupied=[];
  for(const a of selectedExtras){
   const decorative=a.usage==='decor'||(a.usage==='auto'&&profiles.get(a.url)?.hasAlpha);
   const obstacles=nodes.filter(n=>n.type==='text'||(n.type==='shape'&&n.title!=='Контактная тень')||(!decorative&&n===main));
   const overlap=(r,n)=>Math.max(0,Math.min((r[0]+r[2])*W/100,n.x+n.w)-Math.max(r[0]*W/100,n.x))*Math.max(0,Math.min((r[1]+r[3])*H/100,n.y+n.h)-Math.max(r[1]*H/100,n.y));
   const ranked=placements.map((r,i)=>({r,i,score:obstacles.reduce((s,n)=>s+overlap(r,n),0)+occupied.reduce((s,n)=>s+overlap(r,n)*3,0)+(decorative&&i>1?W*H*.2:0)})).sort((a,b)=>a.score-b.score);
   const r=ranked[0].r;
   let n;if(decorative){n=fitted(a,...r,{usage:'decor'});const occluded=overlap(r,main)/(r[2]*r[3]*W*H/10000)>.45||obstacles.some(o=>overlap(r,o)/(r[2]*r[3]*W*H/10000)>.2);if(!occluded)nodes.splice(nodes.indexOf(main),0,nodes.pop());}else n=frame(a,...r,0,settings.style==='studio');
   occupied.push(n);
  }
  const result={id:uid(),template,title:TEMPLATES.find(t=>t[0]===template)[2],width:W,height:H,background:settings.bg||style.bg,nodes,notes,style:settings.style,generatorVersion:3,usedAssets:[...used]};
  applyBackground(result,{...settings,bg:result.background});
  const measure=document.createElement('canvas').getContext('2d');for(const n of nodes.filter(n=>n.type==='text'))fitText(n,measure,Math.max(15,20*S/1200));
  ensureTextContrast(result);return result;
 });
}

// Inspect the actual surface behind text, including user-uploaded backgrounds.
function ensureTextContrast(scene){
 const cv=document.createElement('canvas');cv.width=120;cv.height=Math.round(120*scene.height/scene.width);const cx=cv.getContext('2d',{willReadFrequently:true});
 renderScene(cx,{...scene,nodes:scene.nodes.filter(n=>n.type!=='text')});const pixels=cx.getImageData(0,0,cv.width,cv.height).data;
 for(const n of scene.nodes.filter(n=>n.type==='text'&&!n.fixedCellInk)){
  const colors=[];for(let x=Math.max(0,Math.floor(n.x/scene.width*cv.width));x<Math.min(cv.width,(n.x+n.w)/scene.width*cv.width);x+=3)for(let y=Math.max(0,Math.floor(n.y/scene.height*cv.height));y<Math.min(cv.height,(n.y+n.h)/scene.height*cv.height);y+=3){const i=(y*cv.width+x)*4;colors.push('#'+[pixels[i],pixels[i+1],pixels[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''));}
  if(!colors.length)continue;const target=n.fontSize>=38?3.5:4.5;
  const score=ink=>colors.reduce((sum,c)=>sum+(contrast(ink,c)>=target?1:0),0)/colors.length;
  const dark='#202925',light='#fffdf5',best=score(dark)>=score(light)?dark:light;
  if(score(n.fill)<.85)n.fill=best;
  if(score(n.fill)<.8){n.backplate=n.fill===dark?'#ffffff':'#19231e';n.backplateOpacity=.88;}
 }
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
    if(n.paint){
      const colors=n.paint.colors;
      const angle=(n.paint.angle||0)*Math.PI/180,extent=Math.abs(n.w*Math.cos(angle))+Math.abs(n.h*Math.sin(angle));
      const gradient=n.paint.radial?ctx.createRadialGradient(n.w*.5,n.h*.4,0,n.w*.5,n.h*.4,Math.max(n.w,n.h)*.65):ctx.createLinearGradient(n.w/2-Math.cos(angle)*extent/2,n.h/2-Math.sin(angle)*extent/2,n.w/2+Math.cos(angle)*extent/2,n.h/2+Math.sin(angle)*extent/2);
      colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));ctx.fillStyle=gradient;
    }
    if(n.type==='shape'&&n.pattern){ctx.fillStyle=n.fill;ctx.strokeStyle=n.fill;ctx.lineWidth=1.8;const step=Math.max(22,scene.width*.026);for(let x=step/2;x<n.w;x+=step)for(let y=step/2;y<n.h;y+=step){ctx.beginPath();if(n.pattern==='dots'){ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}else{ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);if(n.pattern==='cross'){ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);}ctx.stroke();}}}
    if(n.type==='shape'&&!n.pattern){if(n.blur)ctx.filter=`blur(${n.blur}px)`;if(n.shadow){ctx.shadowColor='#102f3520';ctx.shadowBlur=18;ctx.shadowOffsetY=7;}path(ctx,n);ctx.fill();if(n.outlineWidth){ctx.strokeStyle=n.outlineColor||'#ffffff';ctx.lineWidth=n.outlineWidth;ctx.stroke();}}
    if(n.type==='pedestal'){
      const c=n.fill||'#d8c7ad',w=n.w,h=n.h;
      ctx.save();ctx.shadowColor='#201b1840';ctx.shadowBlur=h*.18;ctx.shadowOffsetY=h*.14;
      ctx.beginPath();ctx.ellipse(w*.51,h*.86,w*.5,h*.12,0,0,Math.PI*2);ctx.fillStyle='#1f181825';ctx.fill();ctx.restore();
      if(n.kind==='cylinder'){
        const top=h*.24,bottom=h*.77,ry=h*.22;
        const body=ctx.createLinearGradient(0,0,w,0);body.addColorStop(0,shade(c,-.22));body.addColorStop(.24,shade(c,.06));body.addColorStop(.7,shade(c,-.08));body.addColorStop(1,shade(c,-.3));
        ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(0,bottom);ctx.bezierCurveTo(0,bottom+ry,w,bottom+ry,w,bottom);ctx.lineTo(w,top);ctx.closePath();ctx.fill();
        const face=ctx.createLinearGradient(0,0,w,h*.5);face.addColorStop(0,shade(c,.28));face.addColorStop(1,c);
        ctx.fillStyle=face;ctx.beginPath();ctx.ellipse(w/2,top,w/2,ry,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=shade(c,.35);ctx.lineWidth=Math.max(1,w*.0015);ctx.stroke();
      }else{
        const thickness=h*(n.depth??.36),topH=h-thickness;
        const A=[0,topH*.56],B=[w*.57,0],C=[w,topH*.44],D=[w*.43,topH];
        const face=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
        face([A,D,[D[0],D[1]+thickness],[A[0],A[1]+thickness]],shade(c,-.12));
        face([D,C,[C[0],C[1]+thickness],[D[0],D[1]+thickness]],shade(c,-.3));
        const top=ctx.createLinearGradient(0,0,w,topH);top.addColorStop(0,shade(c,.27));top.addColorStop(1,c);face([A,B,C,D],top);
      }
    }
    if(n.type==='image'){
      const img=imageCache.get(n.src);
      if(img&&n.outlineWidth)drawOutline(ctx,n,img);
      ctx.beginPath();if(n.clipShape==='ellipse')ctx.ellipse(n.w/2,n.h/2,n.w/2,n.h/2,0,0,Math.PI*2);else ctx.roundRect(0,0,n.w,n.h,Math.min(n.radius||0,n.w/2,n.h/2));ctx.clip();
      if(img){
        ctx.filter=`brightness(${n.brightness??1}) contrast(${n.contrast??1}) saturate(${n.saturation??1})`;
        const scale=(n.fit==='cover'?Math.max(n.w/img.width,n.h/img.height):Math.min(n.w/img.width,n.h/img.height))*(n.zoom||1);
        const w=img.width*scale,h=img.height*scale;
        ctx.drawImage(img,(n.w-w)/2+(n.cropX||0)*n.w/100,(n.h-h)/2+(n.cropY||0)*n.h/100,w,h);
      } else {ctx.fillStyle='#eee';ctx.fillRect(0,0,n.w,n.h);}
    }
    if(n.type==='text'){
      if(n.backplate){ctx.save();ctx.globalAlpha*=n.backplateOpacity??.88;ctx.fillStyle=n.backplate;ctx.beginPath();ctx.roundRect(-4,-2,n.w+8,n.h+4,8);ctx.fill();ctx.restore();}
      const lines=textLines(ctx,n);ctx.textBaseline='top';ctx.textAlign=n.align||'left';
      const x=n.align==='center'?n.w/2:n.align==='right'?n.w:0;
      // Same clipping in editor and export. Overflow is reported by inspectScene.
      ctx.beginPath();ctx.rect(0,0,n.w,n.h);ctx.clip();
      lines.forEach((line,i)=>ctx.fillText(line,x,i*n.fontSize*1.25));
    }
    if(n.type==='line'){
      // Lines use positive bounding boxes and a separate endpoint direction.
      const x1=n.flipX?n.w:0,x2=n.flipX?0:n.w,y1=n.flip?n.h:0,y2=n.flip?0:n.h;
      ctx.strokeStyle=n.fill;ctx.lineWidth=n.lineWidth||3;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      if(n.arrow){const angle=Math.atan2(y2-y1,x2-x1),a=14;const head=(x,y,t)=>{ctx.beginPath();ctx.moveTo(x-a*Math.cos(t-.45),y-a*Math.sin(t-.45));ctx.lineTo(x,y);ctx.lineTo(x-a*Math.cos(t+.45),y-a*Math.sin(t+.45));ctx.stroke();};head(x2,y2,angle);if(n.doubleArrow)head(x1,y1,angle+Math.PI);}
    }
    ctx.restore();
  }
  if(selected){const n=scene.nodes.find(n=>n.id===selected);if(n?.visible)renderSelection(ctx,n,scene.width/(cv.clientWidth||cv.width),scene);}
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
  const issues=[...(scene.notes||[])];
  for(const n of scene.nodes.filter(n=>n.visible)){
    if(n.type==='image'&&!imageCache.has(n.src))issues.push(`${n.title}: изображение недоступно`);
    if(n.placeholder)issues.push(`${n.title}: замените текст-заполнитель`);
    if(n.type==='text' && textLines(ctx,n).length*n.fontSize*1.25>n.h+1)issues.push(`${n.title}: текст не помещается — увеличьте блок или уменьшите шрифт`);
    if(n.type==='text'&&(n.x<0||n.y<0||n.x+n.w>scene.width+1||n.y+n.h>scene.height+1))issues.push(`${n.title}: блок выходит за холст`);
  }
  return issues;
}
