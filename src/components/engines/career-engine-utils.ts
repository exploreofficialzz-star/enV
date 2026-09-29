export type CareerWorkflow = "generator" | "planner" | "checker" | "calculator" | "builder" | "template";

const FAMILIES = new Set([
  "resume", "cv", "cover-letter", "interview", "salary", "job", "linkedin", "portfolio", "career", "skills", "application", "reference", "achievement",
]);
const WORKFLOWS = new Set<CareerWorkflow>(["generator", "planner", "checker", "calculator", "builder", "template"]);

export function parseCareerToolId(toolId: string): { family: string; workflow: CareerWorkflow } {
  const match = toolId.match(/^(resume|cv|cover-letter|interview|salary|job|linkedin|portfolio|career|skills|application|reference|achievement)-(generator|planner|checker|calculator|builder|template)$/);
  if (!match || !FAMILIES.has(match[1]) || !WORKFLOWS.has(match[2] as CareerWorkflow)) {
    throw new Error(`Unsupported career tool: ${toolId}`);
  }
  return { family: match[1], workflow: match[2] as CareerWorkflow };
}

export interface CareerInput {
  name: string;
  role: string;
  company: string;
  summary: string;
  skills: string;
  salary: number;
  years: number;
  applications: number;
  interviews: number;
  offers: number;
}

const title = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function list(value: string): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function buildCareerOutput(family: string, workflow: CareerWorkflow, input: CareerInput): string {
  if (!FAMILIES.has(family) || !WORKFLOWS.has(workflow)) throw new Error("Unsupported career operation.");
  const numeric = [input.salary, input.years, input.applications, input.interviews, input.offers];
  if (!numeric.every(Number.isFinite) || numeric.some((n) => n < 0)) throw new Error("Enter valid non-negative numbers.");
  if (input.interviews > input.applications) throw new Error("Interviews cannot exceed applications.");
  if (input.offers > input.interviews) throw new Error("Offers cannot exceed interviews.");

  const label = title(family);
  const skills = list(input.skills);
  const name = input.name.trim() || "Candidate Name";
  const role = input.role.trim() || `${label} Role`;
  const company = input.company.trim() || "Target Company";

  if (workflow === "generator") {
    if (family === "resume" || family === "cv") {
      return `${label}\n\n${name}\n${role}\n\nSummary\n${input.summary.trim() || "Results-focused professional with relevant experience and transferable skills."}\n\nSkills\n${(skills.length ? skills : ["Communication", "Problem solving", "Collaboration"]).map((s) => `• ${s}`).join("\n")}\n\nExperience\n${company} — ${role}\nDescribe measurable impact, responsibilities, and outcomes.`;
    }
    if (family === "cover-letter") return `Cover Letter\n\nDear Hiring Manager,\n\nI am applying for the ${role} opportunity at ${company}. ${input.summary.trim() || "My background and skills align with the role's requirements."}\n\nRelevant strengths:\n${(skills.length ? skills : ["Communication", "Problem solving"]).map((s) => `• ${s}`).join("\n")}\n\nSincerely,\n${name}`;
    if (family === "linkedin") return `LinkedIn Profile Draft\n\nHeadline\n${role} | ${skills.slice(0, 3).join(" | ") || "Problem Solver | Collaborator"}\n\nAbout\n${input.summary.trim() || `${name} is a ${role.toLowerCase()} focused on practical results, collaboration, and continuous growth.`}\n\nFeatured Skills\n${(skills.length ? skills : ["Communication", "Problem solving"]).join(", ")}`;
    return `${label} Generator\n\nName: ${name}\nTarget role: ${role}\nCompany/context: ${company}\nSummary: ${input.summary.trim() || "Add a concise professional summary."}\nSkills: ${(skills.length ? skills : ["Communication", "Problem solving"]).join(", ")}`;
  }

  if (workflow === "planner") {
    const steps = family === "interview"
      ? ["Review the role description", "Prepare concise examples using STAR", "Research the company", "Prepare questions", "Practice answers and logistics"]
      : family === "job" || family === "application"
        ? ["Define target roles", "Tailor resume and cover letter", "Track applications", "Prepare for interviews", "Follow up and review outcomes"]
        : ["Define the target outcome", "Collect current career information", "Identify gaps", "Choose measurable next steps", "Set a review date"];
    return `${label} Plan\n\n${steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
  }

  if (workflow === "checker") {
    const checks = [
      ["Name provided", Boolean(input.name.trim())],
      ["Target role provided", Boolean(input.role.trim())],
      ["Summary provided", input.summary.trim().length >= 30],
      ["Skills provided", skills.length >= 2],
      ["Experience/company context", Boolean(input.company.trim())],
    ];
    return `${label} Check\n\n${checks.map(([name, ok]) => `${ok ? "✓" : "✗"} ${name}`).join("\n")}\n\nScore: ${checks.filter(([, ok]) => ok).length}/${checks.length}`;
  }

  if (workflow === "calculator") {
    if (family === "salary") {
      const monthly = input.salary / 12;
      const annualAfterRaise = input.salary * 1.05;
      return `Salary Calculator\n\nAnnual salary: ${money(input.salary)}\nMonthly gross: ${money(monthly)}\n5% raise scenario: ${money(annualAfterRaise)}\n5% raise amount: ${money(annualAfterRaise - input.salary)}`;
    }
    const applicationRate = input.applications > 0 ? (input.interviews / input.applications) * 100 : 0;
    const offerRate = input.interviews > 0 ? (input.offers / input.interviews) * 100 : 0;
    return `${label} Calculator\n\nApplications: ${input.applications}\nInterviews: ${input.interviews}\nOffers: ${input.offers}\nInterview rate: ${applicationRate.toFixed(2)}%\nOffer-from-interview rate: ${offerRate.toFixed(2)}%`;
  }

  if (workflow === "builder") {
    return `${label} Builder\n\n${name}\nTarget: ${role} at ${company}\n\nProfessional summary:\n${input.summary.trim() || "Add your professional summary here."}\n\nSkills:\n${(skills.length ? skills : ["Add skill 1", "Add skill 2"]).map((s) => `• ${s}`).join("\n")}\n\nAchievements:\n• Add a measurable result\n• Add a project or responsibility\n• Add relevant evidence`;
  }

  return `${label} Template\n\nName: ${name}\nTarget role: ${role}\nCompany: ${company}\nSummary:\n\nSkills: ${skills.join(", ")}\nExperience:\n\nAchievements:\n\nNext action:`;
}
