/* Flamo Text to Vector worker — OpenType parsing and path conversion stay off the UI thread. */
'use strict';
importScripts('../../vendor/flamo/opentype.min.js');

const CANVAS=1080;
const fmt=n=>Number((Math.abs(n)<.0005?0:n).toFixed(3)).toString();
const xmlEscape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const pathAttr=d=>xmlEscape(String(d).replace(/\s+/g,' ').trim());
const argb=hex=>{let h=String(hex||'#ffffff').replace('#','').trim();if(h.length===3)h=h.split('').map(x=>x+x).join('');return '#FF'+h.toUpperCase();};
const pad=n=>String(n).padStart(2,'0');
const safeName=v=>String(v).replace(/[^a-zA-Z0-9_-]/g,c=>'u'+c.codePointAt(0).toString(16)).slice(0,24)||'shape';

function textToRawItems(font,o){
  const items=[],lineHeight=o.fontSize*1.2,lines=o.text.split('\n');let idx=1,penY=0;
  for(const line of lines){
    let penX=0;
    if(o.mode==='word'){
      for(const token of line.split(/(\s+)/)){
        if(!token)continue;
        const adv=font.getAdvanceWidth(token,o.fontSize);
        if(/^\s+$/.test(token)){penX+=adv+o.letterSpacing;continue;}
        items.push({name:`word_${safeName(token)}_${pad(idx)}`,text:token,path:font.getPath(token,penX,penY,o.fontSize),index:idx++});
        penX+=adv+o.letterSpacing;
      }
    }else{
      for(const ch of Array.from(line)){
        const adv=font.getAdvanceWidth(ch,o.fontSize);
        if(/\s/.test(ch)){penX+=adv+o.letterSpacing;continue;}
        items.push({name:`char_${safeName(ch)}_${pad(idx)}`,text:ch,path:font.getPath(ch,penX,penY,o.fontSize),index:idx++});
        penX+=adv+o.letterSpacing;
      }
    }
    penY+=lineHeight;
  }
  return items.filter(item=>item.path.commands.length>0);
}

function pathBox(path){try{const b=path.getBoundingBox();return [b.x1,b.y1,b.x2,b.y2].every(Number.isFinite)&&b.x2>b.x1&&b.y2>b.y1?b:null;}catch(_){return null;}}
function cubicPoint(p0,p1,p2,p3,t){const m=1-t;return{x:m*m*m*p0.x+3*m*m*t*p1.x+3*m*t*t*p2.x+t*t*t*p3.x,y:m*m*m*p0.y+3*m*m*t*p1.y+3*m*t*t*p2.y+t*t*t*p3.y};}
function sampleContour(c,steps=16){const pts=[c.start];for(const s of c.segments){if(s.type==='L')pts.push(s.to);else for(let i=1;i<=steps;i++)pts.push(cubicPoint(s.from,s.c1,s.c2,s.to,i/steps));}return pts;}
function signedArea(pts){let area=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];area+=p.x*q.y-q.x*p.y;}return area/2;}
function contourCenter(c){const pts=c.samples||sampleContour(c);return{x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};}
function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],inter=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-9)+a.x);if(inter)inside=!inside;}return inside;}
function reverseContour(c){const rev=[];for(let i=c.segments.length-1;i>=0;i--){const s=c.segments[i];rev.push(s.type==='L'?{type:'L',from:s.to,to:s.from}:{type:'C',from:s.to,c1:s.c2,c2:s.c1,to:s.from});}const out={start:rev[0]?.from||c.start,segments:rev,idx:c.idx};out.samples=sampleContour(out);out.area=signedArea(out.samples);return out;}

function commandsToContours(commands,dx,dy,scale=1){
  const contours=[];let cur=null,curX=0,curY=0;
  const start=(x,y)=>{if(cur&&cur.segments.length)contours.push(cur);cur={start:{x:(x+dx)*scale,y:(y+dy)*scale},segments:[]};curX=x;curY=y;};
  for(const c of commands){
    if(c.type==='M')start(c.x,c.y);
    else if(c.type==='L'&&cur){cur.segments.push({type:'L',from:{x:(curX+dx)*scale,y:(curY+dy)*scale},to:{x:(c.x+dx)*scale,y:(c.y+dy)*scale}});curX=c.x;curY=c.y;}
    else if(c.type==='C'&&cur){cur.segments.push({type:'C',from:{x:(curX+dx)*scale,y:(curY+dy)*scale},c1:{x:(c.x1+dx)*scale,y:(c.y1+dy)*scale},c2:{x:(c.x2+dx)*scale,y:(c.y2+dy)*scale},to:{x:(c.x+dx)*scale,y:(c.y+dy)*scale}});curX=c.x;curY=c.y;}
    else if(c.type==='Q'&&cur){const x1=curX+(2/3)*(c.x1-curX),y1=curY+(2/3)*(c.y1-curY),x2=c.x+(2/3)*(c.x1-c.x),y2=c.y+(2/3)*(c.y1-c.y);cur.segments.push({type:'C',from:{x:(curX+dx)*scale,y:(curY+dy)*scale},c1:{x:(x1+dx)*scale,y:(y1+dy)*scale},c2:{x:(x2+dx)*scale,y:(y2+dy)*scale},to:{x:(c.x+dx)*scale,y:(c.y+dy)*scale}});curX=c.x;curY=c.y;}
    else if(c.type==='Z'&&cur){contours.push(cur);cur=null;}
  }
  if(cur&&cur.segments.length)contours.push(cur);
  return contours.map((c,i)=>{c.idx=i;c.samples=sampleContour(c);c.area=signedArea(c.samples);return c;});
}
function applyContourMode(contours,mode){if(mode==='original')return contours;const enriched=contours.map((c,i)=>({...c,idx:i,absArea:Math.abs(c.area),center:contourCenter(c)})),sorted=[...enriched].sort((a,b)=>b.absArea-a.absArea);return enriched.map(c=>{let depth=0;for(const outer of sorted){if(outer.idx!==c.idx&&outer.absArea>c.absArea&&pointInPolygon(c.center,outer.samples))depth++;}const hole=depth%2===1,wantPositive=mode==='amFixB'?hole:!hole;return (c.area>0)===wantPositive?c:reverseContour(c);}).sort((a,b)=>a.idx-b.idx);}
function classifyContours(contours){const enriched=contours.map((c,i)=>({...c,idx:c.idx??i,absArea:Math.abs(c.area),center:contourCenter(c)})),sorted=[...enriched].sort((a,b)=>b.absArea-a.absArea),outers=[],holes=[];for(const c of enriched){let depth=0;for(const outer of sorted){if(outer.idx!==c.idx&&outer.absArea>c.absArea&&pointInPolygon(c.center,outer.samples))depth++;}(depth%2?holes:outers).push(c);}return{outers:outers.sort((a,b)=>a.idx-b.idx),holes:holes.sort((a,b)=>a.idx-b.idx)};}
function contoursToCubicD(contours){const out=[];for(const c of contours){if(!c.segments.length)continue;out.push(`M ${fmt(c.start.x)} ${fmt(c.start.y)}`);for(const s of c.segments)out.push(s.type==='L'?`L ${fmt(s.to.x)} ${fmt(s.to.y)}`:`C ${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.to.x)} ${fmt(s.to.y)}`);out.push('Z');}return out.join(' ');}
function contoursToFlatD(contours){const out=[];for(const c of contours){const pts=sampleContour(c,10);if(!pts.length)continue;out.push(`M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`);for(let i=1;i<pts.length;i++)out.push(`L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`);out.push('Z');}return out.join(' ');}
function commandsToContourLayers(commands,dx,dy,scale,o){const fixed=applyContourMode(commandsToContours(commands,dx,dy,scale),o.contourMode||'amFixA'),classified=classifyContours(fixed),toD=items=>(o.pathMode||'cubic')==='flatten'?contoursToFlatD(items):contoursToCubicD(items),outer=classified.outers.map(item=>toD([item])).filter(Boolean),holes=classified.holes.map(item=>toD([item])).filter(Boolean);return{outerD:[...outer,...holes].join(' '),contours:[...outer.map(d=>({d,exclude:false})),...holes.map(d=>({d,exclude:true}))]};}

function normalizeLayers(raw,o){
  const valid=raw.map(item=>({item,box:pathBox(item.path)})).filter(row=>row.box);
  if(!valid.length)return{layers:[],width:CANVAS,height:CANVAS,autoScale:1};
  const minX=Math.min(...valid.map(v=>v.box.x1)),minY=Math.min(...valid.map(v=>v.box.y1)),maxX=Math.max(...valid.map(v=>v.box.x2)),maxY=Math.max(...valid.map(v=>v.box.y2)),rawW=Math.max(1,maxX-minX),rawH=Math.max(1,maxY-minY),available=Math.max(10,CANVAS-Math.max(0,o.padding)*2),scale=Math.min(available/rawW,available/rawH),textW=rawW*scale,textH=rawH*scale,offX=(CANVAS-textW)/2,offY=(CANVAS-textH)/2,layers=[];
  for(const {item,box} of valid){const cx=(box.x1+box.x2)/2,cy=(box.y1+box.y2)/2,pack=commandsToContourLayers(item.path.commands,-cx,-cy,scale,o);if(pack.outerD)layers.push({name:item.name,d:pack.outerD,contours:pack.contours,x:offX+(cx-minX)*scale,y:offY+(cy-minY)*scale});}
  return{layers,width:CANVAS,height:CANVAS,autoScale:scale,textWidth:textW,textHeight:textH};
}
function generateXml(layers,o,doc,fontName){const totalMs=Math.max(1,Math.round(o.duration*1000)),now=Date.now(),shapes=[...layers].reverse().map((layer,i)=>{const contours=layer.contours.map(c=>`      <contour${c.exclude?' exclude="true"':''} d="${pathAttr(c.d)}"/>`).join('\n'),fillType=o.vectorStyle==='strokeOnly'?'none':'color',fill=o.vectorStyle==='strokeOnly'?'':`\n    <fillColor value="${argb(o.fill)}"/>`,stroke=o.vectorStyle==='fillOnly'?'':`\n    <path-stroke direction="centered" join="round" width="${fmt(o.strokeWidth)}">\n      <color value="${argb(o.stroke)}"/>\n    </path-stroke>`;return `  <shape id="${i+1}" label="${xmlEscape(layer.name)}" startTime="0" endTime="${totalMs}" fillType="${fillType}">\n    <transform>\n      <location value="${fmt(layer.x)},${fmt(layer.y)},0.000000"/>\n      <pivot value="0.000000,0.000000"/>\n      <scale value="1.000000,1.000000"/>\n    </transform>${fill}\n    <path>\n${contours}\n    </path>${stroke}\n  </shape>`;}).join('\n');return `<?xml version='1.0' encoding='UTF-8' ?>\n<!--\nCreated by Text to Vektor - Flamo Creative\nMode: ${xmlEscape(o.mode)}\nFont: ${xmlEscape(fontName||'unknown')}\nCanvas fixed 1080x1080. Text auto-fit, padding ${o.padding}px.\n-->\n<scene title="${xmlEscape(o.filename||'Text to Vektor')}" width="${doc.width}" height="${doc.height}" exportWidth="${doc.width}" exportHeight="${doc.height}" bgcolor="#FF000000" totalTime="${totalMs}" fps="${o.fps}" modifiedTime="${now}" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="freeze">\n${shapes}\n</scene>`;}

self.onmessage=event=>{
  const {id,fontBuffer,options,fontName}=event.data||{};
  try{
    const font=opentype.parse(fontBuffer),o=options||{};
    if(!String(o.text||'').trim())throw new Error('Teks tidak boleh kosong.');
    const doc=normalizeLayers(textToRawItems(font,o),o);
    if(!doc.layers.length)throw new Error('Font tidak menghasilkan path untuk teks ini.');
    self.postMessage({id,ok:true,xml:generateXml(doc.layers,o,doc,fontName),layers:doc.layers.length,scale:doc.autoScale});
  }catch(error){self.postMessage({id,ok:false,error:error&&error.message?error.message:'Konversi vector gagal.'});}
};
