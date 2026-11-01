/** Continuous observer-eye travel; underground bands are illustrative, not mapped geology. */
export const OBSERVER_BOUNDS_METRES = { minHeight: -20000, maxRadius: 100000 } as const;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const validRange=(range:number)=>{if(!Number.isFinite(range)||range<=0)throw new Error("Invalid observer scale.");return clamp(range,0.25,100000);};
export function observerRangeMetres(position:readonly [number,number,number],target:readonly [number,number,number]):number{
 if([...position,...target].some(v=>!Number.isFinite(v)||Math.abs(v)>1e8))throw new Error("Invalid observer camera coordinates.");
 return Math.max(0.25,Math.hypot(position[0]-target[0],position[1]-target[1],position[2]-target[2]));
}
export function observerAdaptiveStepMetres(rangeMetres:number):number{
 return clamp(0.8*Math.sqrt(validRange(rangeMetres)/8),0.08,2000);
}
export function observerTravelMetres(delta:number,mode:"wheel"|"pinch"|"button",rangeMetres=8):number{
 if(!Number.isFinite(delta))throw new Error("Invalid observer navigation input.");
 if(delta===0)return 0;
 const range=validRange(rangeMetres),scale=Math.sqrt(range/8);
 const raw=mode==="wheel"?-delta*0.012*scale:mode==="pinch"?delta*0.022*scale:delta*0.8*scale;
 const limit=Math.max(5,range*0.25);
 return clamp(raw,-limit,limit);
}
export function observerClippingPlanes(rangeMetres:number):Readonly<{minZ:number;maxZ:number}>{
 const range=validRange(rangeMetres);
 return {minZ:clamp(range*1e-4,0.005,0.25),maxZ:clamp(range*128,1000,5e7)};
}
export function illustrativeLayerForDepth(depthMetres:number):string{
 if(!Number.isFinite(depthMetres)||depthMetres<0||depthMetres>OBSERVER_BOUNDS_METRES.maxRadius)throw new Error("Invalid depth.");
 if(depthMetres===0)return "Surface / illustrative atmosphere";
 if(depthMetres<5)return "Illustrative shallow soil";
 if(depthMetres<100)return "Illustrative sediment";
 if(depthMetres<1000)return "Illustrative upper rock";
 if(depthMetres<10000)return "Illustrative deep-rock cutaway";
 return "Illustrative deep-interior volume";
}
