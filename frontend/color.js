// Product-aware colour and exposure measurements; local Canvas pixels only.
import {imageCache,loadImages} from './assets.js';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h*=60;}return [(h+360)%360,s,l];}
export function hsl(h,s,l){h=(h+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2;const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');}
export function hexRgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function mix(color,other,t){const a=hexRgb(color),b=hexRgb(other);return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');}
export function luminance(color){return hexRgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
export function contrast(a,b){const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}
export function inkFor(bg){return contrast(bg,'#1f2925')>contrast(bg,'#fffdf5')?'#1f2925':'#fffdf5';}
const measured=new Map();
export function lab(rgb){
 const c=rgb.map(v=>{v/=255;return v>.04045?((v+.055)/1.055)**2.4:v/12.92;});
 const xyz=[(c[0]*.4124564+c[1]*.3575761+c[2]*.1804375)/.95047,c[0]*.2126729+c[1]*.7151522+c[2]*.072175,(c[0]*.0193339+c[1]*.119192+c[2]*.9503041)/1.08883].map(v=>v>.008856?Math.cbrt(v):7.787*v+16/116);
 return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];
}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function rgbHex(rgb){return '#'+rgb.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');}
export function analyseImage(src){
 const image=imageCache.get(src);if(!image)return null;if(measured.get(src)?.image===image)return measured.get(src).profile;
 const W=120,H=120,cv=document.createElement('canvas');cv.width=W;cv.height=H;
 const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,W,H);const data=ctx.getImageData(0,0,W,H).data,N=W*H;
 const rgb=Array.from({length:N},(_,i)=>[data[i*4],data[i*4+1],data[i*4+2]]),labs=rgb.map(lab);
 const transparent=rgb.reduce((n,_,i)=>n+(data[i*4+3]<100),0)/N>.025;
 let mask=new Uint8Array(N),confidence='alpha';
 if(transparent){for(let i=0;i<N;i++)mask[i]=data[i*4+3]>=150?1:0;}
 else{
  // Remove only edge-connected colours. Dark/white product pixels remain candidates.
  const border=[];for(let x=0;x<W;x++){border.push(x,(H-1)*W+x);}for(let y=1;y<H-1;y++)border.push(y*W,y*W+W-1);
  const buckets=new Map();for(const i of border){const key=rgb[i].map(v=>Math.floor(v/28)).join(',');const b=buckets.get(key)||{ids:[]};b.ids.push(i);buckets.set(key,b);}
  const common=[...buckets.values()].sort((a,b)=>b.ids.length-a.ids.length).slice(0,2).filter(b=>b.ids.length/border.length>.12);
  const seeds=common.map(b=>labs[b.ids[Math.floor(b.ids.length/2)]]),visited=new Uint8Array(N),queue=[];
  const background=i=>seeds.some(c=>distance(c,labs[i])<18);
  for(const i of border)if(background(i)){visited[i]=1;queue.push(i);}
  for(let k=0;k<queue.length;k++){const i=queue[k],x=i%W,y=Math.floor(i/W);for(const j of [x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1])if(j>=0&&!visited[j]&&background(j)){visited[j]=1;queue.push(j);}}
  for(let i=0;i<N;i++)mask[i]=!visited[i]?1:0;
  const area=mask.reduce((a,b)=>a+b,0)/N;confidence=seeds.length&&area>.04&&area<.94?'edge-mask':'uncertain';
  if(confidence==='uncertain'){for(let i=0;i<N;i++){const x=i%W/W,y=Math.floor(i/W)/H;mask[i]=x>.15&&x<.85&&y>.12&&y<.88?1:0;}}
 }
 const samples=[];for(let i=0;i<N;i+=2)if(mask[i]){const x=(i%W+.5)/W,y=(Math.floor(i/W)+.5)/H,c=rgb[i],hsl=rgbToHsl(...c);samples.push({rgb:c,lab:labs[i],weight:.8+.2*(1-Math.abs(x-.5)*2),brightness:(c[0]*.2126+c[1]*.7152+c[2]*.0722)/255,saturation:hsl[1],x,y});}
 if(!samples.length)return null;
 // Perceptual clusters are weighted by area, never by saturation alone.
 let centers=[samples[Math.floor(samples.length/2)].lab];
 for(let k=1;k<5;k++){let best=null,score=-1;for(const p of samples){const d=Math.min(...centers.map(c=>distance(c,p.lab)));if(d>score){score=d;best=p.lab;}}if(score<10)break;centers.push(best);}
 let groups=[];
 for(let iteration=0;iteration<9;iteration++){
  groups=centers.map(()=>[]);for(const p of samples){let idx=0,d=Infinity;centers.forEach((c,i)=>{const nd=distance(c,p.lab);if(nd<d){idx=i;d=nd;}});groups[idx].push(p);}
  centers=groups.map((g,i)=>g.length?[0,1,2].map(k=>g.reduce((s,p)=>s+p.lab[k]*p.weight,0)/g.reduce((s,p)=>s+p.weight,0)):centers[i]);
 }
 const clusters=groups.filter(g=>g.length).map(g=>({rgb:[0,1,2].map(k=>g.reduce((s,p)=>s+p.rgb[k],0)/g.length),share:g.length/samples.length})).sort((a,b)=>b.share-a.share);
 const merged=[];for(const c of clusters){const match=merged.find(m=>distance(lab(m.rgb),lab(c.rgb))<14);if(match){const total=match.share+c.share;match.rgb=match.rgb.map((v,i)=>(v*match.share+c.rgb[i]*c.share)/total);match.share=total;}else merged.push(c);}
 merged.sort((a,b)=>b.share-a.share);const primary=merged[0],color=rgbHex(primary.rgb),mean=key=>samples.reduce((s,p)=>s+p[key],0)/samples.length,brightness=mean('brightness');
 const colors=merged.filter(c=>c.share>.045).map(c=>({...c,color:rgbHex(c.rgb),hsl:rgbToHsl(...c.rgb)}));
 // Distinct foreground regions for automatic closeups; do not attach unverified descriptions.
 const focal=top=>{const points=samples.filter(p=>top?p.y<.48:p.y>.52);return points.length?{x:points.reduce((a,p)=>a+p.x,0)/points.length,y:points.reduce((a,p)=>a+p.y,0)/points.length}:{x:.5,y:top?.28:.72};};
 const profile={color,rgb:primary.rgb,hsl:rgbToHsl(...primary.rgb),colors,confidence,hasAlpha:transparent,brightness,saturation:mean('saturation'),contrast:Math.sqrt(samples.reduce((s,p)=>s+(p.brightness-brightness)**2,0)/samples.length),focal:[focal(true),focal(false)],pixels:samples.length};
 measured.set(src,{image,profile});return profile;
}
export function colorSuggestions(profile){
 const primary=profile?.color||'#8c867b',colors=profile?.colors||[{color:primary,share:1,hsl:rgbToHsl(...hexRgb(primary))}];
 const chromatic=colors.find(c=>c.hsl[1]>.22&&c.share>.09),base=chromatic?.hsl||profile?.hsl||[35,.1,.5],h=base[0],s=clamp(base[1],.08,.5),white=luminance(primary)>.58,dark=luminance(primary)<.1;
 const separation=(color)=>{
  let c=color;const [,cs,cl]=rgbToHsl(...hexRgb(c));if(contrast(primary,c)<1.65)c=hsl(h+170,Math.min(cs,.15),white?.61:dark?.92:cl>.6?.95:.18);return c;
 };
 const make=(name,note,bg,secondary,accent)=>{bg=separation(bg);return {name,note,bg,secondary,accent,ink:inkFor(bg),score:contrast(primary,bg)};};
 return [
  make('Спокойный контраст','Фон отделяет силуэт товара',hsl(h+175,s*.18,white?.64:.95),hsl(h+175,s*.25,white?.52:.83),hsl(h+175,s*.7,.38)),
  make('Оттенки товара',chromatic?'Акцент взят из заметной детали':'Нейтральная палитра для спокойного товара',hsl(h,s*.12,white?.68:.94),hsl(h,s*.28,white?.52:.8),hsl(h,s*.8,.36)),
  make('Мягкая студия','Тёплые или прохладные нейтральные тона',white?'#b4afa2':'#f0ece4',white?'#d7cfbc':'#d7cdbb',hsl(h,Math.min(s,.3),.35)),
  make(dark?'Светлый акцент':'Глубокий фон',dark?'Светлая основа для тёмного силуэта':'Выразительный фон без яркого шума',hsl(h,s*.25,dark?.82:.19),hsl(h,s*.32,dark?.65:.31),hsl(h+25,s*.5,dark?.25:.8)),
 ];
}
export async function productProfile(project){await loadImages([{nodes:project.assets.map(a=>({type:'image',src:a.url}))}]);return analyseImage(project.assets[0].url);}
export function harmonyProposal(scene){
  const objects=scene.nodes.filter(n=>n.type==='image'&&n.role!=='background'&&!n.backgroundRole),unique=[...new Set(objects.map(n=>n.src))],profiles=unique.map(src=>({src,profile:analyseImage(src)})).filter(p=>p.profile?.pixels);
  const primary=profiles[0]?.profile;if(!primary)return [];
  const bg=luminance(scene.background),target=clamp(primary.brightness+(bg>.6?.04:0),.35,.68);
  return profiles.map(({src,profile:p})=>({src,
    brightness:+clamp(target/Math.max(.12,p.brightness),.8,1.2).toFixed(2),
    contrast:+clamp(.18/Math.max(.09,p.contrast),.9,1.12).toFixed(2),
    saturation:+clamp((primary.saturation*.6+.18)/Math.max(.15,p.saturation),.85,1.15).toFixed(2),
    measured:p,
  }));
}
