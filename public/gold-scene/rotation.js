import * as THREE from 'three';
import { SPHERE_MOTION } from '../inspection-effects/viewer-settings.js';

export function enableRotation(canvas,pivot,{returnToFront=false,returnDelay=1.1,returnDuration=.85,unrestricted:initialUnrestricted=false,settings=null,onPinchScale}={}){
  const points=new Map();let vx=0,vy=0,vz=0,lastMove=0,previewSpin=null;
  let profile=settings,unrestricted=initialUnrestricted,windX=0,windY=0;
  // Cruise uses the same screen-space angular axis as the user's last gesture.
  // A nugget has no privileged front or upright side.
  const cruiseAxis=new THREE.Vector3(0,-1,0);
  const sensitivity=()=>profile?SPHERE_MOTION.dragRadiansPerPixel*profile.rotationSensitivity:.008;
  const inertiaKick=()=>profile?SPHERE_MOTION.inertiaKick:1.35;
  const cruiseSpeed=()=>profile&&unrestricted&&profile.autoRotationEnabled
    ?SPHERE_MOTION.autoRadiansPerSecond*profile.autoRotationSpeed/60:0;
  const rememberAxis=(x,y,z)=>{if(profile&&unrestricted&&Math.hypot(x,y,z)>0)cruiseAxis.set(x,y,z).normalize();};
  const pushWind=(x,y)=>{
    if(!profile?.particleWindEnabled)return;
    windX=THREE.MathUtils.clamp(windX*SPHERE_MOTION.windBlend+y*SPHERE_MOTION.windKick,-SPHERE_MOTION.windMax,SPHERE_MOTION.windMax);
    windY=THREE.MathUtils.clamp(windY*SPHERE_MOTION.windBlend-x*SPHERE_MOTION.windKick,-SPHERE_MOTION.windMax,SPHERE_MOTION.windMax);
  };
  let returnWait=-1,returnMotion=null;
  const cancelReturn=()=>{returnWait=-1;returnMotion=null;};
  const scheduleReturn=()=>{if(returnToFront&&(!profile||profile.autoReturnEnabled)&&!points.size){returnWait=0;returnMotion=null;}};
  const limit=THREE.MathUtils.degToRad(35);
  const tilt=delta=>{const old=pivot.rotation.x;pivot.rotation.x=THREE.MathUtils.clamp(old+delta,-limit,limit);return pivot.rotation.x-old;};
  // Apply free inspection in screen axes, so an upside-down object remains easy to turn.
  const axis=new THREE.Vector3(),turn=new THREE.Quaternion();
  const rotateFree=(x,y,z)=>{
    axis.set(x,y,z);const angle=axis.length();if(!angle)return;
    turn.setFromAxisAngle(axis.divideScalar(angle),angle);
    pivot.quaternion.premultiply(turn).normalize();
  };
  const pair=()=>{const [a,b]=[...points.values()];return {distance:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};};
  let sphereMobile=false,pinchStartDistance=0;
  const syncPinch=()=>{
    if(!sphereMobile||!onPinchScale)return;
    if(points.size===2){
      pinchStartDistance=pair().distance;
    }else if(pinchStartDistance){
      pinchStartDistance=0;
      onPinchScale(1);
    }
  };
  canvas.style.touchAction='none';canvas.style.cursor='grab';
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    cancelReturn();
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});vx=vy=vz=0;lastMove=performance.now();previewSpin=null;
    syncPinch();
    canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';
  });
  canvas.addEventListener('pointermove',event=>{
    const old=points.get(event.pointerId);if(!old)return;
    const before=points.size===2?pair():null,dx=event.clientX-old.x,dy=event.clientY-old.y;
    const now=performance.now();
    // The browser profile normalizes input to 60 Hz. Sphere uses each event's
    // displacement directly and retains the last meaningful movement.
    const velocityScale=profile&&!sphereMobile?1/(THREE.MathUtils.clamp((now-lastMove)/1000,1/240,1/30)*60):1;
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});lastMove=now;
    const gain=sensitivity(),kick=inertiaKick()*velocityScale,threshold=profile?SPHERE_MOTION.dragThreshold:1.25;
    if(before){
      const after=pair();
      const angle=Math.atan2(Math.sin(after.angle-before.angle),Math.cos(after.angle-before.angle));
      if(unrestricted)rotateFree(0,0,angle);else pivot.rotation.z+=angle;
      if(!sphereMobile||Math.abs(angle)>=.0015)vz=angle*kick;
      vx=vy=0;
      if(pinchStartDistance){
        onPinchScale(THREE.MathUtils.clamp(after.distance/pinchStartDistance,.75,1.5));
      }
      if(!profile||Math.abs(vz)>=SPHERE_MOTION.stopThreshold)rememberAxis(0,0,vz);
    }else if(points.size===1){
      if(unrestricted){
        const roll=event.shiftKey?dx*gain:0;
        const x=event.shiftKey?0:dy*gain,y=event.shiftKey?0:dx*gain;
        rotateFree(x,y,roll);
        vx=!event.shiftKey&&Math.abs(dy*velocityScale)>=threshold?dy*gain*kick:0;
        vy=!event.shiftKey&&Math.abs(dx*velocityScale)>=threshold?dx*gain*kick:0;
        vz=event.shiftKey&&Math.abs(dx*velocityScale)>=threshold?roll*kick:0;
        rememberAxis(vx,vy,vz);
      }else{
        const applied=tilt(dy*gain);pivot.rotation.y+=dx*gain;
        if(Math.abs(dy*velocityScale)>=threshold)vx=applied*kick;
        else if(!sphereMobile)vx=0;
        if(Math.abs(dx*velocityScale)>=threshold)vy=dx*gain*kick;
        else if(!sphereMobile)vy=0;
      }
    }
    pushWind(vx,vy);
    if(profile&&!profile.inertiaEnabled)vx=vy=vz=0;
  });
  const release=event=>{
    if(points.delete(event.pointerId))syncPinch();
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(!points.size){canvas.style.cursor='grab';if(!sphereMobile&&performance.now()-lastMove>100)vx=vy=vz=0;scheduleReturn();}
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',event=>{const wasHeld=points.delete(event.pointerId);if(wasHeld)syncPinch();if(!points.size){canvas.style.cursor='grab';if(wasHeld)scheduleReturn();}});
  canvas.addEventListener('dblclick',()=>{pivot.rotation.set(0,0,0);vx=vy=vz=0;previewSpin=null;cancelReturn();});
  window.addEventListener('blur',()=>{points.clear();syncPinch();if(!profile||!unrestricted)vx=vy=vz=0;canvas.style.cursor='grab';scheduleReturn();});
  const dampWind=delta=>{
    if(profile){
      const damping=Math.pow(SPHERE_MOTION.windDampingBase+profile.inertiaStrength*SPHERE_MOTION.windDampingStrength,delta*60);
      windX*=damping;windY*=damping;
      if(Math.abs(windX)<SPHERE_MOTION.windStopThreshold)windX=0;
      if(Math.abs(windY)<SPHERE_MOTION.windStopThreshold)windY=0;
    }
  };
  const update=delta=>{
    dampWind(delta);
    if(returnWait>=0&&!points.size){
      returnWait+=delta;
      if(returnWait>=returnDelay){
        returnWait=-1;vx=vy=vz=0;previewSpin=null;
        const from=[pivot.rotation.x,pivot.rotation.y,pivot.rotation.z];
        // Take the shortest path back to the front, including multi-turn drags.
        returnMotion={from,to:from.map(angle=>angle-Math.atan2(Math.sin(angle),Math.cos(angle))),elapsed:0};
      }
    }
    if(returnMotion&&!points.size){
      returnMotion.elapsed+=delta;
      const progress=matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1,returnMotion.elapsed/returnDuration),eased=1-(1-progress)**3;
      const angles=returnMotion.from.map((angle,index)=>angle+(returnMotion.to[index]-angle)*eased);
      pivot.rotation.set(...angles);
      if(progress===1){pivot.rotation.set(0,0,0);returnMotion=null;}
      return;
    }
    if(previewSpin&&!points.size){
      previewSpin.elapsed+=delta;
      const progress=Math.min(previewSpin.elapsed/previewSpin.duration,1),eased=1-(1-progress)**3;
      pivot.rotation.y=previewSpin.from+(previewSpin.to-previewSpin.from)*eased;
      if(progress>=1)previewSpin=null;
    }else if(!points.size){
      const steps=sphereMobile&&delta>0?1:delta*60,base=profile?SPHERE_MOTION.velocityDampingBase+profile.inertiaStrength*SPHERE_MOTION.velocityDampingStrength:.915;
      const damping=Math.pow(base,steps),travel=(1-damping)/(1-base);
      const cruise=cruiseSpeed(),tx=cruiseAxis.x*cruise,ty=cruiseAxis.y*cruise,tz=cruiseAxis.z*cruise;
      if(profile&&unrestricted){
        rotateFree(tx*steps+(vx-tx)*travel,ty*steps+(vy-ty)*travel,tz*steps+(vz-tz)*travel);
        vx=tx+(vx-tx)*damping;vy=ty+(vy-ty)*damping;vz=tz+(vz-tz)*damping;
      }else if(unrestricted)rotateFree(vx*travel,vy*travel,vz*travel);
      else{const requested=vx*travel,applied=tilt(requested);if(profile&&Math.abs(applied-requested)>1e-6)vx=0;pivot.rotation.y+=vy*travel;pivot.rotation.z+=vz*travel;}
      if(!profile||!unrestricted){vx*=damping;vy*=damping;vz*=damping;}
      if(profile&&!cruise){
        if(Math.abs(vx)<SPHERE_MOTION.stopThreshold)vx=0;
        if(Math.abs(vy)<SPHERE_MOTION.stopThreshold)vy=0;
        if(Math.abs(vz)<SPHERE_MOTION.stopThreshold)vz=0;
      }
    }
  };
  update.spinBy=turns=>{
    cancelReturn();
    const radians=Math.PI*2*THREE.MathUtils.clamp(Number(turns)||.3,-1,1);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){pivot.rotation.y+=radians;return;}
    previewSpin={from:pivot.rotation.y,to:pivot.rotation.y+radians,elapsed:0,duration:1.15};
  };
  update.reset=({preserveWind=false}={})=>{points.clear();syncPinch();vx=vy=vz=0;if(!preserveWind)windX=windY=0;previewSpin=null;cancelReturn();canvas.style.cursor='grab';};
  update.rotateBy=(x,y,z)=>{rotateFree(x,y,z);rememberAxis(x,y,z);pushWind(x,y);};
  update.seedCruise=()=>{
    const speed=cruiseSpeed();
    if(!speed||points.size)return;
    vx=cruiseAxis.x*speed;vy=cruiseAxis.y*speed;vz=cruiseAxis.z*speed;
  };
  update.seedYaw=velocity=>{
    if(!Number.isFinite(velocity)||profile?.inertiaEnabled===false)return;
    vy=velocity;
    pushWind(0,vy);
  };
  update.returnToFront=scheduleReturn;
  update.setSettings=(next,{unrestricted:nextUnrestricted=unrestricted,sphereMobile:nextSphereMobile=sphereMobile}={})=>{
    if(nextUnrestricted!==unrestricted||nextSphereMobile!==sphereMobile){
      update.reset();
      unrestricted=nextUnrestricted;
      sphereMobile=nextSphereMobile;
    }
    profile=next||null;cancelReturn();
    if(profile&&!profile.inertiaEnabled)vx=vy=vz=0;
    if(!profile?.particleWindEnabled)windX=windY=0;
  };
  update.state=()=>({dragging:points.size>0,velocity:[vx,vy,vz]});
  update.wind=()=>({x:profile?.particleWindEnabled?windX*SPHERE_MOTION.windOutput:0,y:profile?.particleWindEnabled?windY*SPHERE_MOTION.windOutput:0});
  update.dampWind=dampWind;
  return update;
}
