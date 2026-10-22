// One scene model and renderer for editing, live previews and PNG export.
export const FONTS=['Manrope','Cormorant Garamond','DejaVu Sans','DejaVu Serif','DejaVu Mono'];
export const STYLES={
  studio:{name:'Минимализм',note:'Воздух · крупный фрагмент · тонкие линии',bg:'#efeee8',ink:'#292b27',accent:'#897a60',soft:'#ddd8cb',backgroundMode:'arch'},
  organic:{name:'Уютный',note:'Тёплый свет · мягкие формы · спокойные подписи',bg:'#e8dace',ink:'#49382d',accent:'#997257',soft:'#c4a88f',backgroundMode:'cozy'},
  promo:{name:'Геометрия',note:'Чёткая форма · цветовой акцент · ячейки',bg:'#f4f6f8',ink:'#162c36',accent:'#0298b5',soft:'#d9edf1',backgroundMode:'diagonal'},
};
export const BACKGROUNDS=[['plain','Однотонный'],['gradient','Мягкий градиент'],['arch','Арка'],['diagonal','Диагональ'],['tiles','Геометрические ячейки'],['cozy','Тёплый интерьер'],['spotlight','Световое пятно']];
export const TEMPLATES=[['hero','01','Главная','Крупный товар и один акцент'],['features','02','Характеристики','До трёх читаемых ячеек'],['dimensions','03','Габариты','Тонкие линии, только ваши размеры'],['closeups','04','Крупные планы','Автоматический зум на детали'],['callouts','05','Выноски','Один товар и две подписи'],['kit','06','Комплектация','Товар и содержимое набора'],['story','07','Акцент на детали','Крупный фрагмент и короткий текст']];
let sequence=0;
export const uid=()=>`n_${Date.now().toString(36)}_${sequence++}`;
export function node(type,title,x,y,w,h,extra={}){
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
  if(settings.background){add('image','Фотография фона',0,0,1,1,{src:settings.background,fit:'cover',zoom:settings.backgroundZoom||1,cropX:settings.backgroundX||0,cropY:settings.backgroundY||0});shape('Тонировка фона',0,0,1,1,bg,'rect',{opacity:settings.photoWash??.12});return nodes;}
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
  return nodes;
}
export function applyBackground(scene,settings){scene.background=settings.bg;scene.backgroundSettings=structuredClone(settings);scene.nodes=[...backgroundNodes(scene,settings),...scene.nodes.filter(n=>!n.backgroundRole)];}
export function buildScenes(project,settings){
  const style=STYLES[settings.style]||STYLES.studio,palette={...style,accent:settings.accent||style.accent},p=project.product;
  const facts=p.facts.filter(f=>f.confirmed&&f.value.trim()),bodyInk=readable(settings.bg||palette.bg);
  return settings.templates.map(template=>{
    const [W,H]=settings.format==='16:9'?[1600,900]:settings.format==='9:16'?[900,1600]:settings.format==='3:4'?[1200,1600]:[1200,1200],S=Math.min(W,H),nodes=[],notes=[];
    const add=(type,title,x,y,w,h,extra={})=>{const n=node(type,title,W*x/100,H*y/100,W*w/100,H*h/100,extra);nodes.push(n);return n;};
    const text=(title,value,x,y,w,h,size=40,extra={})=>add('text',title,x,y,w,h,{text:value,font:settings.font||FONTS[0],fontSize:size*S/1200,bold:false,align:'left',fill:bodyInk,...extra});
    const shape=(title,x,y,w,h,fill,extra={})=>add('shape',title,x,y,w,h,{shape:settings.bubble==='none'?'rounded':settings.bubble,fill,radius:S*.025,...extra});
    const source=project.assets[0],details=project.assets.slice(1),focal=settings.focal||[{x:.5,y:.32},{x:.5,y:.7}];
    const image=(asset,x,y,w,h,extra={})=>add('image',asset===source?'Товар':'Фото детали',x,y,w,h,{src:asset.url,fit:'contain',zoom:1,cropX:0,cropY:0,...extra});
    const cropped=(asset,x,y,w,h,index=0,extra={})=>{
      const n=image(asset,x,y,w,h,{fit:'cover',zoom:1.55,radius:S*.035,...extra});
      const img=imageCache.get(asset.url),focus=asset===source?focal[index]:{x:.5,y:.5};
      if(img){const scale=Math.max(n.w/img.width,n.h/img.height)*n.zoom;n.cropX=(.5-focus.x)*img.width*scale/n.w*100;n.cropY=(.5-focus.y)*img.height*scale/n.h*100;}
      return n;
    };
    const cell=(fact,x,y,w=30,h=15,index=0)=>{
      const fill=settings.style==='organic'?'#fff9f1':'#ffffff';
      if(settings.bubble!=='none')shape('Ячейка: '+fact.label,x,y,w,h,fill,{opacity:.94,shadow:settings.style==='promo'});
      const ink=settings.bubble==='none'?bodyInk:'#29332f';
      text('Значение: '+fact.label,fact.value,x+2,y+2,w-4,h*.54,38,{bold:true,fill:ink,fixedCellInk:settings.bubble!=='none'});
      text('Подпись: '+fact.label,fact.label,x+2,y+h*.62,w-4,h*.27,19,{fill:ink,fixedCellInk:settings.bubble!=='none'});
    };
    const line=(title,x,y,w,h,extra={})=>add('line',title,x,y,w,h,{fill:bodyInk,lineWidth:S*.0018,arrow:false,...extra});
    const title=p.name||p.category||'Название товара';
    text('Название товара',title,7,6,86,14,settings.style==='organic'?80:64,{bold:settings.style!=='studio',font:settings.font||FONTS[0]});
    const pedestal=(x,y,w)=>{if(settings.pedestal!=='none')add('pedestal','Подставка',x,y,w,settings.pedestal==='box'?17:12,{fill:settings.pedestalColor,kind:settings.pedestal,depth:.36});};
    if(template==='hero'){
      pedestal(31,78,48);image(source,18,23,69,59);
      if(facts[0])cell(facts[0],7,79,27,14);
    }else if(template==='features'){
      pedestal(43,76,49);image(source,40,24,56,57);
      facts.slice(0,3).forEach((f,i)=>cell(f,7,27+i*20,30,17,i));
      if(!facts.length)notes.push('Добавьте подтверждённые характеристики — приложение разместит до трёх ячеек.');
    }else if(template==='dimensions'){
      image(source,24,23,56,58);
      const width=facts.find(f=>/ширина|длина/i.test(f.label)),height=facts.find(f=>/высота/i.test(f.label));
      if(width){line('Ширина',25,85,52,0,{doubleArrow:true,arrow:true});text('Значение ширины',width.value,32,89,40,6,30,{align:'center'});}else notes.push('Для размерной линии введите ширину или длину.');
      if(height){line('Высота',17,26,0,52,{doubleArrow:true,arrow:true});text('Значение высоты',height.value,2,49,14,10,27);}else notes.push('Для размерной линии введите высоту.');
    }else if(template==='closeups'){
      // A deliberately cropped large product, plus two distinct automatically selected details.
      cropped(source,43,26,64,74,1,{zoom:1.25,radius:0});
      [0,1].forEach(i=>{cropped(details[i]||source,7,28+i*32,27,24,i,{zoom:details[i]?1.1:1.9});if(facts[i])text('Подпись детали',facts[i].value,7,53+i*32,29,6,23);});
    }else if(template==='callouts'){
      image(source,24,24,54,60);
      facts.slice(0,2).forEach((f,i)=>{const right=i===1;line('Выноска',right?64:10,right?67:38,23,right?-10:9);text('Свойство: '+f.label,f.value,right?65:5,right?72:26,29,12,29);});
    }else if(template==='kit'){
      image(source,7,25,57,59);details.slice(0,2).forEach((a,i)=>image(a,69,29+i*26,24,22));
      const kit=facts.find(f=>/комплект/i.test(f.label));if(kit)text('Комплектация',kit.value,7,86,84,8,30);else notes.push('Состав набора добавится после заполнения «Комплектация».');
    }else{
      // Editorial framing: allow the object to leave the frame, like the plate reference.
      cropped(source,43,25,66,78,1,{zoom:1.55,radius:0});
      const description=p.description||facts.slice(0,2).map(f=>`${f.label}: ${f.value}`).join('. ');
      if(description)text('Короткое описание',description,7,31,32,40,32);
    }
    const result={id:uid(),template,title:TEMPLATES.find(t=>t[0]===template)[2],width:W,height:H,background:settings.bg||palette.bg,nodes,notes,style:settings.style};
    applyBackground(result,{...settings,bg:result.background});
    const measure=document.createElement('canvas').getContext('2d');for(const n of nodes.filter(n=>n.type==='text'))fitText(n,measure,Math.max(14,18*S/1200));
    return result;
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
    if(n.paint){
      const colors=n.paint.colors;
      const angle=(n.paint.angle||0)*Math.PI/180,extent=Math.abs(n.w*Math.cos(angle))+Math.abs(n.h*Math.sin(angle));
      const gradient=n.paint.radial?ctx.createRadialGradient(n.w*.5,n.h*.4,0,n.w*.5,n.h*.4,Math.max(n.w,n.h)*.65):ctx.createLinearGradient(n.w/2-Math.cos(angle)*extent/2,n.h/2-Math.sin(angle)*extent/2,n.w/2+Math.cos(angle)*extent/2,n.h/2+Math.sin(angle)*extent/2);
      colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));ctx.fillStyle=gradient;
    }
    if(n.type==='shape'){if(n.shadow){ctx.shadowColor='#102f3520';ctx.shadowBlur=18;ctx.shadowOffsetY=7;}path(ctx,n);ctx.fill();}
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
  const issues=[...(scene.notes||[])];
  for(const n of scene.nodes.filter(n=>n.visible)){
    if(n.type==='image'&&!imageCache.has(n.src))issues.push(`${n.title}: изображение недоступно`);
    if(n.placeholder)issues.push(`${n.title}: замените текст-заполнитель`);
    if(n.type==='text' && textLines(ctx,n).length*n.fontSize*1.25>n.h+1)issues.push(`${n.title}: текст не помещается — увеличьте блок или уменьшите шрифт`);
    if(n.type==='text'&&(n.x<0||n.y<0||n.x+n.w>scene.width+1||n.y+n.h>scene.height+1))issues.push(`${n.title}: блок выходит за холст`);
  }
  return issues;
}
