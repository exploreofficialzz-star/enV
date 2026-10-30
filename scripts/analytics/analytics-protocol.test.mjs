import test from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_POLICY_VERSION, classifyReferrer, classifyUserAgent, validateConsentPayload, validateEventsPayload } from "../../src/lib/analytics/protocol.mjs";
const subjectId="d9c91f73-0b4c-4f44-94ab-c48a1c60335a",eventId="9fc5f4d0-35db-4523-b3e2-9c69b0e4f26d";
test("consent requires an explicit current policy decision",()=>{
 assert.deepEqual(validateConsentPayload({subjectId,platform:"web",granted:true,policyVersion:ANALYTICS_POLICY_VERSION}),{subjectId,platform:"web",granted:true,policyVersion:ANALYTICS_POLICY_VERSION});
 assert.throws(()=>validateConsentPayload({subjectId,platform:"web",granted:true,policyVersion:"old-policy"}),/policy version/);
 assert.throws(()=>validateConsentPayload({subjectId,platform:"web",granted:"yes",policyVersion:ANALYTICS_POLICY_VERSION}),/granted/);
});
test("event batches require a supported platform, current policy and bounded size",()=>{
 const value={subjectId,platform:"android",policyVersion:ANALYTICS_POLICY_VERSION,events:[{eventId,name:"tool_viewed",toolId:"qr-code-reader"}]};
 assert.equal(validateEventsPayload(value).events.length,1);
 assert.throws(()=>validateEventsPayload({...value,events:[]}),/between 1 and 25/);
 assert.throws(()=>validateEventsPayload({...value,platform:"desktop"}),/platform/);
 assert.throws(()=>validateEventsPayload({...value,events:Array(26).fill(value.events[0])}),/between 1 and 25/);
});
test("tool events require valid catalogue identifiers",()=>{
 assert.throws(()=>validateEventsPayload({subjectId,platform:"web",policyVersion:ANALYTICS_POLICY_VERSION,events:[{eventId,name:"tool_viewed"}]}),/require a catalogue toolId/);
 assert.throws(()=>validateEventsPayload({subjectId,platform:"web",policyVersion:ANALYTICS_POLICY_VERSION,events:[{eventId,name:"tool_viewed",toolId:"tool?email=user@example.com"}]}),/catalogue identifier/);
});
test("content-like and unapproved properties are dropped",()=>{
 const event=validateEventsPayload({subjectId,platform:"web",policyVersion:ANALYTICS_POLICY_VERSION,events:[{eventId,name:"tool_failed",toolId:"image-resizer",outcome:"failure",errorCode:"DECODE_FAILED",properties:{workflow:"batch-resize",attempt:2,searchQuery:"private query",prompt:"private prompt",fileName:"private.wav",email:"person@example.com"}}]}).events[0];
 assert.deepEqual(event.properties,{workflow:"batch-resize",attempt:2});assert.equal(event.errorCode,"DECODE_FAILED");
});
test("event payload rejects arbitrary error messages and oversized durations",()=>{
 const envelope={subjectId,platform:"ios",policyVersion:ANALYTICS_POLICY_VERSION};
 assert.throws(()=>validateEventsPayload({...envelope,events:[{eventId,name:"tool_failed",toolId:"json-formatter",errorCode:"Failed: user typed secret"}]}),/machine-readable/);
 assert.throws(()=>validateEventsPayload({...envelope,events:[{eventId,name:"tool_completed",toolId:"json-formatter",durationMs:3600001}]}),/durationMs/);
});
test("browser and search-source classification stores categories, not URLs or queries",()=>{
 assert.deepEqual(classifyUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"),{browserFamily:"chrome",osFamily:"android"});
 assert.equal(classifyReferrer("https://www.google.com/search?q=secret"),"google");
 assert.equal(classifyReferrer("https://user:pass@envtools.store/tools?q=secret"),"internal");
 assert.equal(classifyReferrer("https://example.org/path?private=value"),"referral");
 assert.equal(classifyReferrer(""),"direct");
});
test("non-tool events do not require a tool identifier",()=>{
 const result=validateEventsPayload({subjectId,platform:"web",policyVersion:ANALYTICS_POLICY_VERSION,events:[{eventId,name:"app_opened"}]});
 assert.equal(result.events[0].toolId,null);
});
