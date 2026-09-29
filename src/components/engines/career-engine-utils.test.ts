import test from "node:test";
import assert from "node:assert/strict";
import { buildCareerOutput, parseCareerToolId } from "./career-engine-utils.ts";

const input = { name:"Alex Doe", role:"Product Manager", company:"Example Co", summary:"Product professional focused on measurable outcomes and cross-functional delivery.", skills:"Roadmaps, Analytics, Communication", salary:60000, years:4, applications:20, interviews:5, offers:2 };

test("career parser supports every family/workflow", () => {
  for (const family of ["resume","cv","cover-letter","interview","salary","job","linkedin","portfolio","career","skills","application","reference","achievement"]) {
    for (const workflow of ["generator","planner","checker","calculator","builder","template"]) assert.equal(parseCareerToolId(`${family}-${workflow}`).family, family);
  }
});

test("career output is generated and meaningful", () => {
  assert.match(buildCareerOutput("resume", "generator", input), /Alex Doe/);
  assert.match(buildCareerOutput("salary", "calculator", input), /Monthly gross/);
  assert.match(buildCareerOutput("resume", "checker", input), /Score:/);
  assert.match(buildCareerOutput("interview", "planner", input), /STAR/);
});

test("career validation rejects impossible funnel numbers", () => {
  assert.throws(() => buildCareerOutput("job", "calculator", {...input, interviews:21}), /Interviews cannot exceed/);
  assert.throws(() => buildCareerOutput("job", "calculator", {...input, interviews:5, applications:20, offers:6}), /Offers cannot exceed/);
});
