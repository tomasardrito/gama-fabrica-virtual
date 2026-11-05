// DOM-free camera controller. direct() may be called every frame.
const mix=(a,b,u)=>a+(b-a)*u;
const pose=shot=>({x:shot.position[0],z:shot.position[1],span:shot.span??40,
 height:shot.cameraHeight??35,orbit:shot.orbit??.7});
export function createFilmCameraRig({camera}){
 let shot=null,id=null,current=null,from=null,start=null,lastElapsed=null;
 return {
  direct(next){
   if(!next?.position)return;
   if(next.id!==id){from=current?{...current}:pose(next);start=null;id=next.id;}
   shot=next;
  },
  update({elapsed,dt=0,width=1,height=1}){
   if(!shot)return;
   if(lastElapsed!=null&&(elapsed<lastElapsed||elapsed-lastElapsed>Math.max(1,dt*2))){from=pose(shot);start=elapsed;}
   if(start==null)start=elapsed;
   lastElapsed=elapsed;
   const duration=Math.max(1,Math.min(1.5,shot.transitionSeconds??1.2));
   const u=Math.max(0,Math.min(1,(elapsed-start)/duration)),ease=u*u*(3-2*u),goal=pose(shot);
   current=Object.fromEntries(Object.keys(goal).map(k=>[k,mix(from[k],goal[k],ease)]));
   const aspect=Math.max(1,width)/Math.max(1,height);
   camera.left=-current.span/2;camera.right=current.span/2;
   camera.top=current.span/(2*aspect);camera.bottom=-camera.top;
   camera.updateProjectionMatrix();
   const reach=current.height*38/35;
   camera.position.set(current.x+Math.sin(current.orbit)*reach,current.height,current.z+Math.cos(current.orbit)*reach);
   camera.lookAt(current.x,.5,current.z);
  },
  reset(){shot=null;id=null;current=null;from=null;start=null;lastElapsed=null;}
 };
}
