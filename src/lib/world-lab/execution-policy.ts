import {parseWorldLabProject,type WorldLabProject} from "./project.ts";

/** Capability selection does not upload any project or start any process. */
export type WorldLabExecutionPlan=Readonly<{
  target:"device"|"account-worker"|"unavailable";
  requiresUserConsent:boolean;
  calculatedCases:number;
  reason:string;
}>;
export function planWorldLabDigitalVerification(project:WorldLabProject,
  networkId:string,cloudConfigured:boolean):WorldLabExecutionPlan{
  const safe=parseWorldLabProject(project);
  const net=safe.digitalNetworks?.find(n=>n.id===networkId);
  if(!net)throw new Error("Choose an existing invented logic circuit.");
  const calculatedCases=2**net.inputs.length;
  if(net.inputs.length<=8)return Object.freeze({
    target:"device" as const,requiresUserConsent:false,calculatedCases,
    reason:"Up to eight switches are checked completely on this device without uploading the invention.",
  });
  if(cloudConfigured)return Object.freeze({
    target:"account-worker" as const,requiresUserConsent:true,calculatedCases,
    reason:"The larger nine-to-twelve-switch exhaustive check requires the authenticated backend. Sending the project is optional and requires explicit approval.",
  });
  return Object.freeze({
    target:"unavailable" as const,requiresUserConsent:false,calculatedCases,
    reason:"This device's exhaustive check stops at eight switches, and the account science worker is not enabled. Your invention remains editable and exportable offline.",
  });
}
