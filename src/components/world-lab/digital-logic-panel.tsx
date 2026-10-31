import {useMemo,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {planWorldLabDigitalVerification} from "@/lib/world-lab/execution-policy";
import {appendDigitalGate,setDigitalInput,setDigitalTruthBit,
  solveDigitalLogic,setDigitalOutputSource,starterDigitalNetwork,verifyDigitalTruthTable,
  appendDigitalInput} from "@/lib/world-lab/digital-logic";
type Props={
  project:WorldLabProject|null;
  mutateProject:(fn:(p:WorldLabProject)=>WorldLabProject)=>void;
  cloudConfigured:boolean;
  cloudBusy:boolean;
  remoteJobStatus:string|null;
  onCloudVerify:(networkId:string)=>void;
};
const button="rounded-md border border-border px-3 py-2 text-xs";
export function WorldLabDigitalLogicPanel({
  project,mutateProject,cloudConfigured,cloudBusy,remoteJobStatus,onCloudVerify,
}:Props){
  const [name,setName]=useState("New invented gate");
  const [assumption,setAssumption]=useState("User-defined combinational behavior");
  const [sourceA,setSourceA]=useState("input_a");
  const [sourceB,setSourceB]=useState("input_b");
  const [error,setError]=useState("");
  const [showCases,setShowCases]=useState(false);
  const net=project?.digitalNetworks?.[0];
  const execution=project&&net?
    planWorldLabDigitalVerification(project,net.id,cloudConfigured):null;
  const result=useMemo(()=>{
    if(!project||!net)return null;
    try{return solveDigitalLogic(project,net.id);}
    catch{return null;}
  },[project,net]);
  const sweep=useMemo(()=>{
    if(!showCases||!project||!net)return null;
    try{return verifyDigitalTruthTable(project,net.id);}catch{return null;}
  },[showCases,project,net]);
  function addGate(){
    if(!net)return;
    try{
      mutateProject(p=>appendDigitalGate(p,net.id,crypto.randomUUID(),
        name,assumption,[sourceA,sourceB]));
      setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"Invalid wiring.");}
  }
  return <section className="mb-3 rounded-xl border border-border p-3"
    aria-label="Invent digital logic">
    <h3 className="text-sm font-semibold">Invent digital logic</h3>
    <p className="text-xs text-muted-foreground">
      Build your own digital components by defining what each input combination
      produces. This is Boolean logic, not measured chip electronics.
    </p>
    {!net && <button type="button" className={button+" mt-2"} onClick={()=>
      mutateProject(p=>({...p,digitalNetworks:[...(p.digitalNetworks??[]),
        starterDigitalNetwork(crypto.randomUUID())]}))}>
      Start an invented logic circuit
    </button>}
    {net && <div className="mt-2 space-y-3 text-xs">
      <div className="flex flex-wrap gap-3">
        {net.inputs.map(input=><label key={input.id} className="flex items-center gap-2">
          <input type="checkbox" checked={input.value} onChange={e=>
            mutateProject(p=>setDigitalInput(p,net.id,input.id,e.target.checked))}/>
          {input.label}: {input.value?"1":"0"}
        </label>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{net.inputs.length} / 12 switches</span>
        <button type="button" className={button} disabled={net.inputs.length>=12}
          onClick={()=>{
            try{
              mutateProject(p=>appendDigitalInput(p,net.id,crypto.randomUUID(),
                "Switch "+(net.inputs.length+1)));
              setError("");
            }catch(cause){setError(cause instanceof Error?cause.message:
              "Cannot add this digital switch.");}
          }}>
          Add another switch
        </button>
      </div>
      {net.gates.map(gate=><details key={gate.id}
        className="rounded border border-border p-2" open={gate.id==="invented_gate"}>
        <summary className="cursor-pointer font-medium">
          {gate.name} · {result?.gates[gate.id]??"?"}
        </summary>
        <p className="text-muted-foreground">{gate.assumption}</p>
        <p className="mt-2 text-muted-foreground">
          Each binary row lists input bits in wired order, then your assumed output.
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {gate.truthTable.map((bit,i)=><label key={i} className="flex items-center gap-2">
            {i.toString(2).padStart(gate.inputNodeIds.length,"0")} →
            <select className="rounded border border-border p-1"
              aria-label={"Output for "+gate.name+" input row "+i}
              value={bit} onChange={e=>mutateProject(p=>
                setDigitalTruthBit(p,net.id,gate.id,i,Number(e.target.value) as 0|1))}>
              <option value={0}>0</option><option value={1}>1</option>
            </select>
          </label>)}
        </div>
      </details>)}
      <div className="rounded border border-border p-2" aria-live="polite">
        {net.outputs.map(out=><div key={out.id} className="mb-2 flex flex-wrap items-center gap-2">
          <label htmlFor={"digital-output-"+out.id}>{out.label} reads</label>
          <select id={"digital-output-"+out.id} className="rounded border border-border p-1"
            aria-label={"Wire "+out.label+" to digital node"}
            value={out.sourceNodeId}
            onChange={e=>mutateProject(p=>setDigitalOutputSource(
              p,net.id,out.id,e.target.value))}>
            {[...net.inputs,...net.gates].map(n=>
              <option key={n.id} value={n.id}>{"label" in n?n.label:n.name}</option>)}
          </select>
          <strong aria-live="polite">{result?.outputs[out.id]??"Not calculated"}</strong>
        </div>)}
      </div>
      <details className="rounded border border-border p-2">
        <summary className="cursor-pointer">Create another invented gate</summary>
        <label className="mt-2 block">Device name
          <input className="w-full rounded border border-border p-2" value={name}
            maxLength={120} onChange={e=>setName(e.target.value)}/>
        </label>
        <label className="mt-2 block">Assumed behavior
          <input className="w-full rounded border border-border p-2"
            value={assumption} maxLength={500}
            onChange={e=>setAssumption(e.target.value)}/>
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([sourceA,sourceB] as const).map((selected,i)=>
            <label key={i}>Input {i+1}
              <select className="w-full rounded border border-border p-2"
                value={selected} onChange={e=>
                  (i===0?setSourceA:setSourceB)(e.target.value)}>
                {[...net.inputs,...net.gates].map(n=>
                  <option key={n.id} value={n.id}>{"label" in n?n.label:n.name}</option>)}
              </select>
            </label>)}
        </div>
        <button type="button" className={button+" mt-2"} onClick={addGate}
          disabled={net.gates.length>=32||sourceA===sourceB}>
          Connect invented gate
        </button>
      </details>
      <p className="text-muted-foreground">{execution?.reason}</p>
      {execution?.target==="device" &&
        <button type="button" className={button} onClick={()=>setShowCases(x=>!x)}>
          {showCases?"Hide complete logic test":"Test every switch combination locally"}
        </button>}
      {execution?.target==="account-worker" &&
        <button type="button" className={button} disabled={cloudBusy}
          onClick={()=>onCloudVerify(net.id)}>
          {cloudBusy?"Submitting…":"Send for full cloud check ("+execution.calculatedCases+" cases)"}
        </button>}
      {execution?.target==="account-worker"&&remoteJobStatus&&
        <p role="status">Account science job: {remoteJobStatus}</p>}
      {showCases&&sweep&&<div className="rounded border border-border p-2"
        aria-label="Exhaustive digital truth-table evidence">
        <p>Verified {sweep.cases.length} mathematical input combinations
          against the assumed truth tables; not real hardware.</p>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left">
            <thead><tr><th>Switch bits</th><th>Output bits</th></tr></thead>
            <tbody>{sweep.cases.slice(0,16).map((entry,i)=><tr key={i}>
              <td>{Object.values(entry.inputBits).join("")}</td>
              <td>{Object.values(entry.outputBits).join("")}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {sweep.cases.length>16&&<p>First 16 shown; export all cases.</p>}
        <button type="button" className={button+" mt-2"} onClick={()=>{
          const blob=new Blob([JSON.stringify(sweep,null,2)],{type:"application/json"});
          const url=URL.createObjectURL(blob);
          const link=document.createElement("a");link.href=url;
          link.download="world-lab-invented-logic-evidence.json";link.click();
          URL.revokeObjectURL(url);
        }}>Export complete truth-table evidence</button>
      </div>}
      {error&&<p role="alert" className="text-red-600">{error}</p>}
      <p className="text-muted-foreground">{result?.validity}</p>
    </div>}
  </section>;
}
