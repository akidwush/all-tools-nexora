(function(root,factory){
  "use strict";
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.NexoraMultiAiLayout=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  var WORLD_WIDTH=1600,WORLD_HEIGHT=1100,CENTER_X=800,CENTER_Y=550;
  var NODE_WIDTH=232,NODE_HEIGHT=142,PROMPT_WIDTH=300,PROMPT_HEIGHT=122;

  function point(x,y,ring){return{x:Math.round(x),y:Math.round(y),ring:ring};}

  function ring(count,radiusX,radiusY,startAngle,ringIndex){
    var result=[];
    if(!count)return result;
    for(var index=0;index<count;index++){
      var angle=startAngle+(Math.PI*2*index/count);
      result.push(point(CENTER_X+Math.cos(angle)*radiusX,CENTER_Y+Math.sin(angle)*radiusY,ringIndex));
    }
    return result;
  }

  function layout(count){
    count=Math.max(0,Math.min(14,Number(count)||0));
    if(count===1)return[point(CENTER_X+430,CENTER_Y,1)];
    if(count===2)return[point(CENTER_X-430,CENTER_Y,1),point(CENTER_X+430,CENTER_Y,1)];
    if(count<=4)return ring(count,470,275,-Math.PI/2,1);
    if(count<=8)return ring(count,505,315,-Math.PI/2,1);
    var outerCount=8,innerCount=count-outerCount;
    return ring(innerCount,340,215,-Math.PI/2,1).concat(ring(outerCount,650,420,-Math.PI/2+Math.PI/8,2));
  }

  function bounds(points){
    var left=CENTER_X-PROMPT_WIDTH/2,right=CENTER_X+PROMPT_WIDTH/2;
    var top=CENTER_Y-PROMPT_HEIGHT/2,bottom=CENTER_Y+PROMPT_HEIGHT/2;
    points.forEach(function(item){
      left=Math.min(left,item.x-NODE_WIDTH/2);right=Math.max(right,item.x+NODE_WIDTH/2);
      top=Math.min(top,item.y-NODE_HEIGHT/2);bottom=Math.max(bottom,item.y+NODE_HEIGHT/2);
    });
    return{left:left,right:right,top:top,bottom:bottom,width:right-left,height:bottom-top};
  }

  function fit(points,viewportWidth,viewportHeight,padding){
    var box=bounds(points),safePadding=Math.max(18,Number(padding)||36);
    var availableWidth=Math.max(1,viewportWidth-safePadding*2),availableHeight=Math.max(1,viewportHeight-safePadding*2);
    var scale=Math.max(.16,Math.min(1.15,availableWidth/box.width,availableHeight/box.height));
    return{
      scale:scale,
      x:viewportWidth/2-(box.left+box.width/2)*scale,
      y:viewportHeight/2-(box.top+box.height/2)*scale
    };
  }

  function connectorPath(target){
    var dx=target.x-CENTER_X,dy=target.y-CENTER_Y;
    var sourceX=CENTER_X,sourceY=CENTER_Y,endX=target.x,endY=target.y;
    if(Math.abs(dx)>Math.abs(dy)){
      sourceX+=Math.sign(dx)*PROMPT_WIDTH/2;
      endX-=Math.sign(dx)*NODE_WIDTH/2;
    }else{
      sourceY+=Math.sign(dy)*PROMPT_HEIGHT/2;
      endY-=Math.sign(dy)*NODE_HEIGHT/2;
    }
    var bend=Math.abs(dx)>Math.abs(dy)?Math.max(80,Math.abs(dx)*.44):Math.max(70,Math.abs(dy)*.44);
    var c1x=sourceX+(Math.abs(dx)>Math.abs(dy)?Math.sign(dx)*bend:0);
    var c1y=sourceY+(Math.abs(dx)>Math.abs(dy)?0:Math.sign(dy)*bend);
    var c2x=endX-(Math.abs(dx)>Math.abs(dy)?Math.sign(dx)*bend:0);
    var c2y=endY-(Math.abs(dx)>Math.abs(dy)?0:Math.sign(dy)*bend);
    return"M "+sourceX+" "+sourceY+" C "+c1x+" "+c1y+", "+c2x+" "+c2y+", "+endX+" "+endY;
  }

  function overlaps(points){
    for(var left=0;left<points.length;left++){
      if(Math.abs(points[left].x-CENTER_X)<(NODE_WIDTH+PROMPT_WIDTH)/2+24&&Math.abs(points[left].y-CENTER_Y)<(NODE_HEIGHT+PROMPT_HEIGHT)/2+24)return true;
      for(var right=left+1;right<points.length;right++){
        if(Math.abs(points[left].x-points[right].x)<NODE_WIDTH+24&&Math.abs(points[left].y-points[right].y)<NODE_HEIGHT+24)return true;
      }
    }
    return false;
  }

  return{
    WORLD_WIDTH:WORLD_WIDTH,WORLD_HEIGHT:WORLD_HEIGHT,CENTER_X:CENTER_X,CENTER_Y:CENTER_Y,
    NODE_WIDTH:NODE_WIDTH,NODE_HEIGHT:NODE_HEIGHT,PROMPT_WIDTH:PROMPT_WIDTH,PROMPT_HEIGHT:PROMPT_HEIGHT,
    layout:layout,bounds:bounds,fit:fit,connectorPath:connectorPath,overlaps:overlaps
  };
});
