// Product-aware colour and exposure measurements; local Canvas pixels only.
import {imageCache,loadImages} from './scene.js';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h*=60;}return [(h+360)%360,s,l];}
export function hsl(h,s,l){h=(h+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2;const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');}
export function hexRgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function mix(color,other,t){const a=hexRgb(color),b=hexRgb(other);return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');}
export function luminance(color){return hexRgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
export function contrast(a,b){const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}
export function inkFor(bg){return contrast(bg,'#1f2925')>contrast(bg,'#fffdf5')?'#1f2925':'#fffdf5';}
export function analyseImage(src){
  const image=imageCache.get(src);if(!image)return null;
  const cv=document.createElement('canvas');cv.width=128;cv.height=128;const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,128,128);
  const {data}=ctx.getImageData(0,0,128,128),buckets=new Map(),samples=[];
  const cornerIds=[0,127,127*128,128*128-1],corner=cornerIds.map(i=>[...data.slice(i*4,i*4+3)]).reduce((a,b)=>a.map((v,i)=>v+b[i]/4),[0,0,0]);
  for(let y=2;y<126;y+=2)for(let x=2;x<126;x+=2){
    const i=(y*128+x)*4;if(data[i+3]<160)continue;
    const rgb=[data[i],data[i+1],data[i+2]],distance=Math.hypot(...rgb.map((v,i)=>v-corner[i]));
    if(distance<22)continue; // Exclude a uniform photographic background, including near-white.
    const [h,s,l]=rgbToHsl(...rgb);if(l>.95||l<.04)continue;
    const brightness=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
    samples.push({brightness,saturation:s,x:x/128,y:y/128});
    const key=rgb.map(v=>Math.min(240,Math.floor(v/24)*24+12)).join(',');buckets.set(key,(buckets.get(key)||0)+1+s*.6);
  }
  // A solid cutout has the same corner colour only if it fills the entire photo; fallback safely.
  if(!samples.length){for(let i=0;i<data.length;i+=16){if(data[i+3]<160)continue;const rgb=[data[i],data[i+1],data[i+2]],c=rgbToHsl(...rgb);samples.push({brightness:rgb.reduce((a,b)=>a+b,0)/765,saturation:c[1],x:.5,y:.5});buckets.set(rgb.join(','),1);}}
  const ranked=[...buckets].sort((a,b)=>b[1]-a[1]),rgb=(ranked[0]?.[0]||'130,145,120').split(',').map(Number);
  const average=key=>samples.length?samples.reduce((a,b)=>a+b[key],0)/samples.length:0;
  const brightness=average('brightness'),saturation=average('saturation'),spread=samples.length?Math.sqrt(samples.reduce((a,b)=>a+(b.brightness-brightness)**2,0)/samples.length):0;
  const focal=(top)=>{const eligible=samples.filter(p=>top?p.y<.55:p.y>.45);if(!eligible.length)return {x:.5,y:top?.35:.7};return {x:eligible.reduce((s,p)=>s+p.x,0)/eligible.length,y:eligible.reduce((s,p)=>s+p.y,0)/eligible.length};};
  return {color:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),rgb,hsl:rgbToHsl(...rgb),brightness,saturation,contrast:spread,focal:[focal(true),focal(false)],pixels:samples.length};
}
export function colorSuggestions(profile){
  const [h,s]=profile?.hsl||[90,.25,.5],sat=clamp(s,.12,.65);
  return [
    {name:'Тон в тон',note:'Спокойный фон в оттенке товара',bg:hsl(h,sat*.25,.93),secondary:hsl(h,sat*.28,.82),accent:hsl(h,sat*.7,.38)},
    {name:'Мягкий контраст',note:'Противоположный оттенок без лишней яркости',bg:hsl(h+180,sat*.18,.94),secondary:hsl(h+180,sat*.3,.82),accent:hsl(h+180,sat*.65,.38)},
    {name:'Тёплый нейтральный',note:'Молочный фон и натуральные акценты',bg:'#f1ede5',secondary:'#d9cbb9',accent:hsl(h,sat*.55,.35)},
    {name:'Глубокий',note:'Светлый текст на насыщенном фоне',bg:hsl(h,sat*.35,.17),secondary:hsl(h,sat*.4,.28),accent:hsl(h+35,sat*.5,.78)},
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
