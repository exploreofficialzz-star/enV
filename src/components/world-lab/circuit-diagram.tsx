import type {WorldLabCircuitNetwork} from "@/lib/world-lab/project";
import type {DcNetworkResult} from "@/lib/world-lab/network";

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
        {network.components.map(c=><li key={c.id}>
          {c.kind==="hypothetical-device"?c.name:c.kind==="dc-source"?"Voltage source":"Resistor"}
          {" · "}{c.positiveNodeId}{" to "}{c.negativeNodeId}
          {currentResult?.branchCurrentsA[c.id]!==undefined
            ?" · "+currentResult.branchCurrentsA[c.id].toFixed(4)+" A":""}
        </li>)}
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
        <desc>Every horizontal component joins the same two vertical node rails. Measured spatial geometry is not implied. Current text comes from the DC solver when available.</desc>
        <g fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7">
          <path d={"M"+left+" "+top+"V"+bottom}/>
          <path d={"M"+right+" "+top+"V"+bottom}/>
          {network.components.map((part,i)=>{
            const y=105+i*86;
            return <path key={part.id} d={"M"+left+" "+y+"H"+(center-45)+" M"+(center+45)+" "+y+"H"+right}/>;
          })}
        </g>
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
                  :currentResult.branchCurrentsA[part.id].toFixed(4)+" A (positive-node to negative-node)"}
              </text>
            </g>;
          })}
        </g>
      </svg>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
      Drawn wires represent matching circuit node IDs, not measured geometry. Dashed parts are hypothetical and require explicit model assumptions.
      Source currents use the conventional positive-to-negative sign.
    </p>
  </figure>;
}
