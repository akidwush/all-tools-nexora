(function(root,factory){
  "use strict";
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.NexoraMultiAiLayout=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  var WORLD_WIDTH=1600,WORLD_HEIGHT=1100,CENTER_X=800,CENTER_Y=570;
  var NODE_WIDTH=232,NODE_HEIGHT=112,PROMPT_WIDTH=280,PROMPT_HEIGHT=130;

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

  function compactRows(count){
    var rowsByCount={
      1:[320],2:[320,820],3:[195,445,820],4:[195,320,820,945],
      5:[70,195,440,700,945],6:[70,195,320,700,825,945],
      7:[70,195,320,440,700,825,945]
    };
    return rowsByCount[count]||rowsByCount[7];
  }

  function compactLayout(count){
    if(count<=4){
      var small=[point(620,420,1),point(980,420,1),point(620,720,1),point(980,720,1)];
      return small.slice(0,count);
    }
    var leftCount=Math.ceil(count/2),rightCount=count-leftCount;
    return compactRows(leftCount).map(function(y){return point(620,y,1);})
      .concat(compactRows(rightCount).map(function(y){return point(980,y,1);}));
  }

  function layout(count,options){
    count=Math.max(0,Math.min(14,Number(count)||0));
    if(options&&options.compact)return compactLayout(count);
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
      if(Math.abs(points[left].x-CENTER_X)<(NODE_WIDTH+PROMPT_WIDTH)/2+8&&Math.abs(points[left].y-CENTER_Y)<(NODE_HEIGHT+PROMPT_HEIGHT)/2+8)return true;
      for(var right=left+1;right<points.length;right++){
        if(Math.abs(points[left].x-points[right].x)<NODE_WIDTH+8&&Math.abs(points[left].y-points[right].y)<NODE_HEIGHT+8)return true;
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
