export type MarketingAction = "planner" | "generator" | "calculator" | "brief-generator" | "checklist" | "template" | "headline-helper" | "cta-generator";

export const MARKETING_ACTIONS: MarketingAction[] = ["brief-generator", "headline-helper", "cta-generator", "calculator", "planner", "generator", "checklist", "template"];
const TOPICS = ["Campaign", "Content", "Email", "Landing Page", "Product", "Brand", "Social", "SEO", "Influencer", "Affiliate", "Lead", "Sales", "Ad", "Newsletter", "Event"];

export function parseMarketingToolId(toolId: string) {
  const action = MARKETING_ACTIONS.find((x) => toolId.endsWith(`-${x}`));
  if (!action) throw new Error(`Unsupported marketing tool action: ${toolId}`);
  const prefix = toolId.slice(0, -(action.length + 1)).split("-").map((x) => x[0]?.toUpperCase() + x.slice(1)).join(" ");
  if (!TOPICS.some((x) => x.toLowerCase() === prefix.toLowerCase())) throw new Error(`Unsupported marketing topic: ${prefix}`);
  return { topic: TOPICS.find((x) => x.toLowerCase() === prefix.toLowerCase())!, action };
}

export type MarketingInput = { audience: string; goal: string; offer: string; channel: string; notes: string; budget: number; clicks: number; leads: number; sales: number; revenue: number };

function nonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
  return value;
}

export function buildMarketingOutput(topic: string, action: MarketingAction, input: MarketingInput) {
  const audience = input.audience.trim() || "[Target audience]";
  const goal = input.goal.trim() || "Increase qualified awareness and conversions";
  const offer = input.offer.trim() || "[Offer / product / message]";
  const channel = input.channel.trim() || "[Primary channel]";
  const notes = input.notes.trim() || "[Additional context]";

  if (action === "calculator") {
    const b = nonNegative("Budget", input.budget), clicks = nonNegative("Clicks", input.clicks), leads = nonNegative("Leads", input.leads), sales = nonNegative("Sales", input.sales), revenue = nonNegative("Revenue", input.revenue);
    if (sales > leads) throw new Error("Sales cannot exceed leads.");
    if (leads > clicks) throw new Error("Leads cannot exceed clicks.");
    const cpc = clicks ? b / clicks : 0, cpl = leads ? b / leads : 0, cpa = sales ? b / sales : 0, roas = b ? revenue / b : 0;
    const leadRate = clicks ? (leads / clicks) * 100 : 0, saleRate = leads ? (sales / leads) * 100 : 0;
    return `${topic.toUpperCase()} MARKETING CALCULATOR\n\nBudget: ${b.toFixed(2)}\nClicks: ${clicks}\nLeads: ${leads}\nSales: ${sales}\nRevenue: ${revenue.toFixed(2)}\n\nCPC: ${cpc.toFixed(2)}\nCPL: ${cpl.toFixed(2)}\nCPA: ${cpa.toFixed(2)}\nClick → lead rate: ${leadRate.toFixed(2)}%\nLead → sale rate: ${saleRate.toFixed(2)}%\nROAS: ${roas.toFixed(2)}x\nNet before other costs: ${(revenue - b).toFixed(2)}`;
  }
  if (action === "checklist") return `${topic.toUpperCase()} CHECKLIST\n\n☐ Define objective: ${goal}\n☐ Define audience: ${audience}\n☐ Confirm offer/message: ${offer}\n☐ Select channel: ${channel}\n☐ Prepare copy and creative\n☐ Add tracking / measurement\n☐ Test links, forms and calls-to-action\n☐ Set launch date and owner\n☐ Monitor agreed metrics\n☐ Record results and next actions\n\nNotes: ${notes}`;
  if (action === "template") return `${topic.toUpperCase()} TEMPLATE\n\nObjective: ${goal}\nAudience: ${audience}\nOffer: ${offer}\nChannel: ${channel}\n\nCore message:\n[Write the main message here]\n\nProof / supporting points:\n[Add evidence, benefits or examples]\n\nCall to action:\n[What should the audience do next?]\n\nMeasurement:\n[Metric + target + reporting date]`;
  if (action === "headline-helper") return `${topic.toUpperCase()} HEADLINE OPTIONS\n\n1. ${offer}: A practical way for ${audience} to ${goal.toLowerCase()}\n2. A simpler way to ${goal.toLowerCase()}\n3. ${offer} for ${audience}: What to know before you start\n4. How ${audience} can ${goal.toLowerCase()}\n5. ${offer} — built around ${goal.toLowerCase()}`;
  if (action === "cta-generator") return `${topic.toUpperCase()} CTA OPTIONS\n\n• Get started\n• Learn more\n• See how it works\n• Try ${offer}\n• Get the details\n• Request information\n• Book a conversation\n• View the offer\n\nChoose the CTA that matches the actual next step; do not promise an action the product cannot perform.`;
  if (action === "brief-generator") return `${topic.toUpperCase()} MARKETING BRIEF\n\nObjective\n${goal}\n\nAudience\n${audience}\n\nOffer / product\n${offer}\n\nChannel\n${channel}\n\nKey message\n[One clear promise supported by real evidence]\n\nDeliverables\n• Primary message/copy\n• Supporting creative\n• CTA\n• Tracking/measurement\n\nConstraints / notes\n${notes}\n\nSuccess metric\n[Define one primary measurable outcome]`;
  if (action === "planner") return `${topic.toUpperCase()} PLAN\n\nGoal: ${goal}\nAudience: ${audience}\nOffer: ${offer}\nChannel: ${channel}\n\n1. Research audience and problem\n2. Define message and proof\n3. Prepare creative/copy\n4. Configure tracking\n5. Test the customer path\n6. Launch in a controlled batch\n7. Review results against the chosen metric\n8. Document what to keep, change or stop\n\nNotes: ${notes}`;
  return `${topic.toUpperCase()} GENERATOR\n\nCampaign goal: ${goal}\nAudience: ${audience}\nOffer: ${offer}\nChannel: ${channel}\n\nSuggested content structure:\nHook → Problem → Useful value → Evidence → Offer → Clear next step\n\nWorking copy:\n${offer} is designed for ${audience}. Start with the specific problem, explain the useful benefit clearly, support claims with real evidence, and finish with a single next step.\n\nNotes: ${notes}`;
}
