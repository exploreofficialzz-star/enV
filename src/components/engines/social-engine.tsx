import { useMemo, useState } from 'react';
import { FieldGrid } from '@/components/engines/fields';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/tools/error-banner';
import { CopyButton } from '@/components/tools/copy-button';
import { downloadText } from '@/lib/utils';
import { buildSocialOutput, parseSocialToolId } from './social-engine-utils';

export function SocialEngine({ toolId }: { toolId: string }) {
 const parsed=useMemo(()=>parseSocialToolId(toolId),[toolId]);
 const [values,setValues]=useState<Record<string,string>>({topic:'',audience:'',tone:'',count:'10',name:'Alex',role:'Creator',focus:'useful content',seed:'creator',likes:'100',comments:'10',shares:'5',saves:'5',followers:'1000',handle:'@demo',bio:'A fictional social profile for design and prototyping.'});
 const [error,setError]=useState(''); const [out,setOut]=useState('');
 const set=(n:string,v:string)=>{setValues(x=>({...x,[n]:v}));setError('')};
 const action=parsed.action;
 const fields = parsed.family==='size' ? [] : parsed.family==='caption' ? [{name:'topic',label:'Topic',type:'text' as const},{name:'audience',label:'Audience',type:'text' as const},{name:'tone',label:'Tone',type:'text' as const}] : parsed.family==='hashtag' ? [{name:'topic',label:'Topic',type:'text' as const},{name:'count',label:'Number of hashtags',type:'number' as const,min:3,max:30}] : parsed.family==='bio' ? [{name:'name',label:'Name',type:'text' as const},{name:'role',label:'Role',type:'text' as const},{name:'focus',label:'Focus',type:'text' as const}] : parsed.family==='username' ? [{name:'seed',label:'Name / keyword',type:'text' as const},{name:'count',label:'Number of ideas',type:'number' as const,min:5,max:30}] : parsed.family==='engagement' ? [{name:'likes',label:'Likes',type:'number' as const},{name:'comments',label:'Comments',type:'number' as const},{name:'shares',label:'Shares',type:'number' as const},{name:'saves',label:'Saves',type:'number' as const},{name:'followers',label:'Followers',type:'number' as const}] : [{name:'name',label:'Display name',type:'text' as const},{name:'handle',label:'Handle',type:'text' as const},{name:'bio',label:'Bio',type:'textarea' as const}];
 const run=()=>{try{setOut(buildSocialOutput(toolId,values));setError('')}catch(e){setError(e instanceof Error?e.message:'Unable to generate output.')}};
 const reset=()=>{setValues({topic:'',audience:'',tone:'',count:'10',name:'Alex',role:'Creator',focus:'useful content',seed:'creator',likes:'100',comments:'10',shares:'5',saves:'5',followers:'1000',handle:'@demo',bio:'A fictional social profile for design and prototyping.'});setOut('');setError('')};
 return <div className="space-y-5"><p className="text-sm text-subtle">{parsed.data.label} utility · client-side generation. Size guides are working design targets; platform specifications can change.</p>{fields.length>0&&<FieldGrid fields={fields} values={values} onChange={set}/>}<div className="flex flex-wrap gap-2"><Button type="button" onClick={run}>Generate</Button>{out&&<CopyButton text={out}/>} {out&&<Button type="button" variant="outline" onClick={()=>downloadText(out,`env-${toolId}.txt`)}>Download</Button>}<Button type="button" variant="outline" onClick={reset}>Reset</Button></div>{error&&<ErrorBanner message={error}/>} {out&&<pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-4 text-sm">{out}</pre>}</div>;
}
