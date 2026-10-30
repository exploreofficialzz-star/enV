import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCommunityBlock, validateCommunityComment, validateCommunityModeration,
  validateCommunityReaction, validateCommunityReport, validateCommunityView,
} from "../../src/lib/community/protocol.mjs";

const visitorId="d9c91f73-0b4c-4f44-94ab-c48a1c60335a";
const idempotencyKey="9fc5f4d0-35db-4523-b3e2-9c69b0e4f26d";
const commentId="f2bb8a8a-a97d-46a1-969d-f2be68ff1ab6";
const comment={toolId:"qr-code-reader",visitorId,idempotencyKey,body:"The scan is fast and works well on my phone."};
test("comments default to anonymous and support chosen public names",()=>{
  const anonymous=validateCommunityComment(comment);
  assert.equal(anonymous.identityMode,"anonymous");
  assert.equal(anonymous.displayName,null);
  const publicComment=validateCommunityComment({...comment,identityMode:"public",displayName:"chAs"});
  assert.equal(publicComment.identityMode,"public");
  assert.equal(publicComment.displayName,"chAs");
});
test("rejects unsupported identity modes and missing public labels",()=>{
  assert.throws(()=>validateCommunityComment({...comment,identityMode:"private"}),/identityMode/);
  assert.throws(()=>validateCommunityComment({...comment,identityMode:"public"}),/displayName/);
  assert.throws(()=>validateCommunityComment({...comment,identityMode:"public",displayName:"<script>"}),/unsupported characters/);
});
test("bounds comment text and requires valid tool and visitor identifiers",()=>{
  assert.throws(()=>validateCommunityComment({...comment,body:""}),/body/);
  assert.throws(()=>validateCommunityComment({...comment,body:"x".repeat(2001)}),/body/);
  assert.throws(()=>validateCommunityComment({...comment,toolId:"bad?tool"}),/catalogue identifier/);
  assert.throws(()=>validateCommunityComment({...comment,visitorId:"not-a-uuid"}),/UUID/);
});
test("supports only one like or dislike choice",()=>{
  assert.equal(validateCommunityReaction({...comment,reaction:"like"}).reaction,"like");
  assert.equal(validateCommunityReaction({...comment,reaction:"dislike"}).reaction,"dislike");
  assert.throws(()=>validateCommunityReaction({...comment,reaction:"love"}),/like or dislike/);
});
test("view and report payloads require valid identifiers and reasons",()=>{
  assert.equal(validateCommunityView({toolId:"qr-code-reader",visitorId}).visitorId,visitorId);
  assert.equal(validateCommunityReport({commentId,visitorId,reason:"spam"}).reason,"spam");
  assert.throws(()=>validateCommunityReport({commentId,visitorId,reason:"dislike"}),/reason/);
});
test("block requests and moderation decisions use bounded enum values",()=>{
  assert.equal(validateCommunityBlock({commentId,visitorId}).commentId,commentId);
  assert.deepEqual(validateCommunityModeration({reportId:commentId,status:"actioned",commentAction:"hide"}),{
    reportId:commentId,status:"actioned",commentAction:"hide",
  });
  assert.throws(()=>validateCommunityModeration({reportId:commentId,status:"done",commentAction:"hide"}),/status/);
});
