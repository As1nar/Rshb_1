// All calculations are in scene coordinates; handles retain their CSS pixel size.
const rotate=(x,y,a)=>({x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)});
export function handlePoints(n,unit=1,bounds=null){
 const a=(n.rotation||0)*Math.PI/180,c={x:n.x+n.w/2,y:n.y+n.h/2};
 const controls=[[-1,-1,'nw'],[0,-1,'n'],[1,-1,'ne'],[1,0,'e'],[1,1,'se'],[0,1,'s'],[-1,1,'sw'],[-1,0,'w']].map(([hx,hy,id])=>({id,hx,hy,...rotate(hx*n.w/2,hy*n.h/2,a)}));
 controls.push({id:'rotate',...rotate(0,-n.h/2-34*unit,a)});
 return controls.map(p=>{const point={...p,x:p.x+c.x,y:p.y+c.y};if(p.id==='rotate'&&bounds){point.x=Math.max(13*unit,Math.min(bounds.width-13*unit,point.x));point.y=Math.max(13*unit,Math.min(bounds.height-13*unit,point.y));}return point;});
}
export function hitHandle(n,x,y,unit,bounds=null){if(!n||n.locked||!n.visible)return null;return handlePoints(n,unit,bounds).map(p=>({...p,distance:Math.hypot(x-p.x,y-p.y)})).filter(p=>p.distance<=11*unit).sort((a,b)=>a.distance-b.distance||(a.id==='rotate'?-1:1))[0]||null;}
export function renderSelection(ctx,n,unit,bounds=null){
 const a=(n.rotation||0)*Math.PI/180;ctx.save();ctx.translate(n.x+n.w/2,n.y+n.h/2);ctx.rotate(a);
 ctx.strokeStyle='#3d7cdb';ctx.lineWidth=1.5*unit;ctx.setLineDash([]);ctx.strokeRect(-n.w/2,-n.h/2,n.w,n.h);
 ctx.restore();
 if(n.locked)return;
 ctx.strokeStyle='#3d7cdb';ctx.lineWidth=1.5*unit;const points=handlePoints(n,unit,bounds),top=points.find(p=>p.id==='n'),grip=points.find(p=>p.id==='rotate');ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.lineTo(grip.x,grip.y);ctx.stroke();
 for(const p of points){
  ctx.save();ctx.fillStyle=p.id==='rotate'?'#3d7cdb':'#ffffff';ctx.strokeStyle='#3d7cdb';ctx.lineWidth=1.5*unit;ctx.beginPath();ctx.arc(p.x,p.y,(p.id==='rotate'?11:5)*unit,0,Math.PI*2);ctx.fill();ctx.stroke();
  if(p.id==='rotate'){ctx.fillStyle='#ffffff';ctx.font=`${16*unit}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('↻',p.x,p.y+unit);}ctx.restore();
 }
}
export function startTransform(n,handle,p){
 const original=structuredClone(n),angle=(n.rotation||0)*Math.PI/180,c={x:n.x+n.w/2,y:n.y+n.h/2};
 const hx=handle?.hx||0,hy=handle?.hy||0,offset=rotate(-hx*n.w/2,-hy*n.h/2,angle);
 return {mode:handle?.id==='rotate'?'rotate':handle?'resize':'move',original,start:p,handle,center:c,anchor:{x:c.x+offset.x,y:c.y+offset.y},startAngle:Math.atan2(p.y-c.y,p.x-c.x)};
}
export function applyTransform(n,t,p,shift=false){
 const o=t.original;
 if(t.mode==='move'){n.x=o.x+p.x-t.start.x;n.y=o.y+p.y-t.start.y;return;}
 if(t.mode==='rotate'){
  let degrees=(o.rotation||0)+(Math.atan2(p.y-t.center.y,p.x-t.center.x)-t.startAngle)*180/Math.PI;
  if(shift)degrees=Math.round(degrees/15)*15;n.rotation=((degrees+540)%360)-180;return;
 }
 const {hx,hy}=t.handle,a=(o.rotation||0)*Math.PI/180,d=rotate(p.x-t.anchor.x,p.y-t.anchor.y,-a),min=12;
 let w=hx?Math.max(min,hx*d.x):o.w,h=hy?Math.max(min,hy*d.y):o.h;
 const proportional=(n.type==='image'&&!shift)||(shift&&hx&&hy)||(n.type==='text'&&hx&&hy);
 if(proportional&&o.w>0&&o.h>0){
  const scale=hx&&hy?Math.max(min/o.w,min/o.h,(w*o.w+h*o.h)/(o.w*o.w+o.h*o.h)):hx?w/o.w:h/o.h;
  w=o.w*scale;h=o.h*scale;
 }
 const offset=rotate(hx*w/2,hy*h/2,a),center={x:t.anchor.x+offset.x,y:t.anchor.y+offset.y};
 n.w=w;n.h=h;n.x=center.x-w/2;n.y=center.y-h/2;
 if(n.type==='text'&&hx&&hy)n.fontSize=Math.max(8,Math.min(300,o.fontSize*Math.min(w/o.w,h/o.h)));
}
export function cursorForHandle(handle,rotation=0){
 if(handle.id==='rotate')return 'grab';
 const angle=Math.atan2(handle.hy,handle.hx)*180/Math.PI+rotation,idx=((Math.round(angle/45)%4)+4)%4;
 return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][idx];
}
