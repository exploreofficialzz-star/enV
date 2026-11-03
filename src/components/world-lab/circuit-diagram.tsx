import type {WorldLabCircuitNetwork} from "@/lib/world-lab/project";
import {dcBranchCurrentFlow,type DcNetworkResult} from "@/lib/world-lab/network";

type Props=Readonly<{network:WorldLabCircuitNetwork;result:DcNetworkResult|null}>;

/**
 * Accessible schematic for the real two-node network. Circuit topology is
 * defined by the portable node IDs, NOT visual crossing geometry.
 * Multi-node networks use a readable connection list to avoid falsely
 * depicting electrical connections.
 */
export function WorldLabCircuitDiagram({network,result}:Props) {
  const currentResult=result?.networkId===network.id?result:null;
  if(network.nodes.length!==2){
    return <figure className="mt-3 rounded-lg border border-border p-2">
      <figcaption className="text-xs font-medium">Circuit connections (node-by-node)</figcaption>
      <ul className="mt-1 list-disc pl-5 text-xs">
        {network.components.map(c=>{
          const signed=currentResult?.branchCurrentsA[c.id];
          const flow=signed===undefined?null:dcBranchCurrentFlow(c,signed);
          const from=flow?.fromNodeId?network.nodes.find(n=>n.id===flow.fromNodeId)?.label:undefined;
          const to=flow?.toNodeId?network.nodes.find(n=>n.id===flow.toNodeId)?.label:undefined;
          const evidence=flow===null?"Current not calculated":flow.direction==="zero"
            ?"0 A · no net branch current"
            :flow.magnitudeA.toPrecision(4)+" A · "+(from??flow.fromNodeId)+" → "+(to??flow.toNodeId);
          return <li key={c.id}>
            {c.kind==="hypothetical-device"?c.name:c.kind==="dc-source"?"Voltage source":"Resistor"}
            {" · "}{c.positiveNodeId}{" to "}{c.negativeNodeId}{" · "}{evidence}
          </li>;
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Connections are defined by shared node IDs; this is not measured wiring geometry.</p>
    </figure>;
  }
  const h=90+network.components.length*86;
  const top=50, bottom=h-25;
  const left=90,right=550,center=320;
  const nodes=network.nodes;
  return <figure className="mt-3 rounded-lg border border-border p-2">
    <figcaption className="text-xs font-medium">Live circuit wiring and calculated current</figcaption>
    <div className="mt-1 overflow-x-auto" role="group" aria-label="Connected source and load schematic">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 640 "+h}
        width="100%" style={{minWidth:350,maxHeight:800}} role="img"
        aria-label="Two-node electrical schematic with real shared-node rails and parallel branches">
        <title>Connected source and passive electrical component schematic</title>
        <desc>Every horizontal component joins the same two vertical node rails. Measured spatial geometry is not implied. Arrows show signed conventional branch-current direction from the DC solver, not an electromagnetic field.</desc>
        <defs><marker id="worldlab-dc-current-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor"/>
        </marker></defs>
        <g fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7">
          <path d={"M"+left+" "+top+"V"+bottom}/>
          <path d={"M"+right+" "+top+"V"+bottom}/>
          {network.components.map((part,i)=>{
            const y=105+i*86;
            return <path key={part.id} d={"M"+left+" "+y+"H"+(center-45)+" M"+(center+45)+" "+y+"H"+right}/>;
          })}
        </g>
        {currentResult&&<g fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9">
          {network.components.map((part,i)=>{
            const signed=currentResult.branchCurrentsA[part.id];
            if(signed===undefined)return null;
            const flow=dcBranchCurrentFlow(part,signed);
            if(flow.direction==="zero")return null;
            const fromIsLeft=flow.fromNodeId===nodes[0].id;
            const y=105+i*86;
            const x1=fromIsLeft?left+10:right-10;
            const x2=fromIsLeft?center-47:center+47;
            return <line key={part.id} x1={x1} y1={y} x2={x2} y2={y}
              strokeWidth={Math.max(1.5,Math.min(4,1.5+Math.log10(1+flow.magnitudeA)))}
              markerEnd="url(#worldlab-dc-current-arrow)">
              <title>{flow.magnitudeA.toPrecision(5)} A from {flow.fromNodeId} to {flow.toNodeId}</title>
            </line>;
          })}
        </g>}
        <g fontSize="15" fill="currentColor">
          <text x={left} y="27" textAnchor="middle">{nodes[0].label.slice(0,19)}</text>
          <text x={right} y="27" textAnchor="middle">{nodes[1].label.slice(0,19)}</text>
          {network.components.map((part,i)=>{
            const y=105+i*86;
            const label=part.kind==="dc-source"?part.voltageV+" V source":
              part.kind==="resistor"?part.resistanceOhm+" Ω resistor":
                part.name.slice(0,21)+(part.assumedResistanceOhm===undefined?" · unknown": " · assumed "+part.assumedResistanceOhm+" Ω");
            return <g key={part.id}>
              {part.kind==="dc-source"
                ?<circle cx={center} cy={y} r="31" stroke="currentColor" strokeWidth="2" fill="none"/>
                :<rect x={center-45} y={y-23} width="90" height="46" rx="5"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeDasharray={part.kind==="hypothetical-device"?"5 4":undefined}/>}
              {part.kind==="dc-source"&&<>
                <text x={center-16} y={y+5} textAnchor="middle">+</text>
                <text x={center+16} y={y+5} textAnchor="middle">−</text>
              </>}
              <text x={center} y={y-36} textAnchor="middle" fontSize="13">{label}</text>
              <text x={center} y={y+48} textAnchor="middle" fontSize="12">
                {currentResult?.branchCurrentsA[part.id]===undefined
                  ?"Current not calculated"
                  :(()=>{const flow=dcBranchCurrentFlow(part,currentResult.branchCurrentsA[part.id]);
                    if(flow.direction==="zero")return "0 A · no net current";
                    const from=network.nodes.find(n=>n.id===flow.fromNodeId)?.label??flow.fromNodeId;
                    const to=network.nodes.find(n=>n.id===flow.toNodeId)?.label??flow.toNodeId;
                    return flow.magnitudeA.toPrecision(4)+" A · "+from+" → "+to;
                  })()}
              </text>
            </g>;
          })}
        </g>
      </svg>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
      Drawn wires represent matching circuit node IDs, not measured geometry. Dashed parts are hypothetical and require explicit model assumptions.
      Arrows show the actual conventional branch-current direction from the signed DC solution and reverse when source polarity reverses. Zero current produces no arrow. They are schematic topology indicators, not electric or magnetic field measurements.
    </p>
  </figure>;
}
