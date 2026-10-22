// Dilate the visible alpha silhouette, not the image bounding rectangle.
const cache=new Map();
export function drawOutline(ctx,n,img){
 const width=n.outlineWidth||0;if(!width)return;
 const scale=Math.min(1,1400/Math.max(n.w,n.h)),pad=Math.ceil(width*scale)+2;
 const key=JSON.stringify([n.src,n.w,n.h,n.fit,n.zoom,n.cropX,n.cropY,n.radius,n.clipShape,width,n.outlineColor]);
 let result=cache.get(key);
 if(!result){
  const mask=document.createElement('canvas');mask.width=Math.ceil(n.w*scale);mask.height=Math.ceil(n.h*scale);const m=mask.getContext('2d');m.scale(scale,scale);
  m.beginPath();if(n.clipShape==='ellipse')m.ellipse(n.w/2,n.h/2,n.w/2,n.h/2,0,0,Math.PI*2);else m.roundRect(0,0,n.w,n.h,Math.min(n.radius||0,n.w/2,n.h/2));m.clip();
  const z=(n.fit==='cover'?Math.max(n.w/img.width,n.h/img.height):Math.min(n.w/img.width,n.h/img.height))*(n.zoom||1),w=img.width*z,h=img.height*z;
  m.drawImage(img,(n.w-w)/2+(n.cropX||0)*n.w/100,(n.h-h)/2+(n.cropY||0)*n.h/100,w,h);
  result=document.createElement('canvas');result.width=mask.width+pad*2;result.height=mask.height+pad*2;const r=result.getContext('2d');
  for(let i=0;i<64;i++){const a=i*Math.PI/32;r.drawImage(mask,pad+Math.cos(a)*width*scale,pad+Math.sin(a)*width*scale);}
  r.globalCompositeOperation='source-in';r.fillStyle=n.outlineColor||'#ffffff';r.fillRect(0,0,result.width,result.height);
  // Keep holes and translucent edges clean: only the outer ring remains.
  r.globalCompositeOperation='destination-out';r.drawImage(mask,pad,pad);
  if(cache.size>32)cache.delete(cache.keys().next().value);cache.set(key,result);
 }
 ctx.drawImage(result,-pad/scale,-pad/scale,result.width/scale,result.height/scale);
}
