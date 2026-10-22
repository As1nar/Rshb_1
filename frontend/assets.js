// Shared decoded images. Pending requests are reused by all previews.
export const imageCache=new Map();
const pending=new Map();
export async function loadImages(scenes){
 const urls=[...new Set(scenes.flatMap(s=>s.nodes.filter(n=>n.type==='image').map(n=>n.src)))];
 await Promise.all(urls.map(src=>{
  if(imageCache.has(src))return;
  if(!pending.has(src))pending.set(src,(async()=>{const img=new Image();img.src=src;await img.decode();imageCache.set(src,img);})().finally(()=>pending.delete(src)));
  return pending.get(src);
 }));
}
