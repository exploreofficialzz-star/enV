import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildCareerOutput, parseCareerToolId } from "./career-engine-utils";

export function CareerEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => { try { return { value: parseCareerToolId(toolId), error: null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported career tool." }; } }, [toolId]);
  const [name, setName] = useState("Candidate Name");
  const [role, setRole] = useState("Software Engineer");
  const [company, setCompany] = useState("Target Company");
  const [summary, setSummary] = useState("Results-focused professional with experience solving practical problems and collaborating across teams.");
  const [skills, setSkills] = useState("Communication, Problem solving, Collaboration");
  const [salary, setSalary] = useState("60000");
  const [years, setYears] = useState("3");
  const [applications, setApplications] = useState("20");
  const [interviews, setInterviews] = useState("5");
  const [offers, setOffers] = useState("1");
  const values = { name, role, company, summary, skills, salary: Number(salary), years: Number(years), applications: Number(applications), interviews: Number(interviews), offers: Number(offers) };
  const result = useMemo(() => { if (!parsed.value) return ""; try { return buildCareerOutput(parsed.value.family, parsed.value.workflow, values); } catch { return ""; } }, [parsed.value, name, role, company, summary, skills, salary, years, applications, interviews, offers]);
  const error = useMemo(() => { if (!parsed.value) return parsed.error; try { buildCareerOutput(parsed.value.family, parsed.value.workflow, values); return null; } catch (e) { return e instanceof Error ? e.message : "Invalid career inputs."; } }, [parsed.value, parsed.error, name, role, company, summary, skills, salary, years, applications, interviews, offers]);
  const reset = () => { setName("Candidate Name"); setRole("Software Engineer"); setCompany("Target Company"); setSummary("Results-focused professional with experience solving practical problems and collaborating across teams."); setSkills("Communication, Problem solving, Collaboration"); setSalary("60000"); setYears("3"); setApplications("20"); setInterviews("5"); setOffers("1"); };
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Run this career workflow locally. No job-board account or external service is required.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="career-name">Name</Label><Input id="career-name" value={name} onChange={e=>setName(e.target.value)} /></div>
      <div><Label htmlFor="career-role">Target role</Label><Input id="career-role" value={role} onChange={e=>setRole(e.target.value)} /></div>
      <div><Label htmlFor="career-company">Company / context</Label><Input id="career-company" value={company} onChange={e=>setCompany(e.target.value)} /></div>
      <div><Label htmlFor="career-skills">Skills (comma separated)</Label><Input id="career-skills" value={skills} onChange={e=>setSkills(e.target.value)} /></div>
      <div className="sm:col-span-2"><Label htmlFor="career-summary">Summary</Label><textarea id="career-summary" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={summary} onChange={e=>setSummary(e.target.value)} /></div>
      <div><Label htmlFor="career-salary">Annual salary</Label><Input id="career-salary" type="number" min="0" value={salary} onChange={e=>setSalary(e.target.value)} /></div>
      <div><Label htmlFor="career-years">Years of experience</Label><Input id="career-years" type="number" min="0" value={years} onChange={e=>setYears(e.target.value)} /></div>
      <div><Label htmlFor="career-applications">Applications</Label><Input id="career-applications" type="number" min="0" value={applications} onChange={e=>setApplications(e.target.value)} /></div>
      <div><Label htmlFor="career-interviews">Interviews</Label><Input id="career-interviews" type="number" min="0" value={interviews} onChange={e=>setInterviews(e.target.value)} /></div>
      <div><Label htmlFor="career-offers">Offers</Label><Input id="career-offers" type="number" min="0" value={offers} onChange={e=>setOffers(e.target.value)} /></div>
    </div><ErrorBanner message={error} /><div className="flex flex-wrap gap-2"><CopyButton text={result}/><Button type="button" variant="outline" size="sm" disabled={!result} onClick={()=>downloadText(result,`env-${toolId}.txt`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>{result?<pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre>:null}</div>;
}
