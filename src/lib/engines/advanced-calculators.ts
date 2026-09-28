import type { CalculatorDef, Field } from "./formulas";

const n = (v: unknown, label = "value") => {
  const raw = typeof v === "number" ? String(v) : String(v ?? "").replace(/,/g, "").trim();
  if (raw === "") throw new Error(`Enter a valid ${label}.`);
  const x = typeof v === "number" ? v : Number(raw);
  if (!Number.isFinite(x)) throw new Error(`Enter a valid ${label}.`);
  return x;
};
const pos = (v: unknown, label = "value") => {
  const x = n(v, label);
  if (x <= 0) throw new Error(`${label} must be greater than 0.`);
  return x;
};
const integer = (v: unknown, label = "value") => {
  const x = n(v, label);
  if (!Number.isInteger(x)) throw new Error(`${label} must be a whole number.`);
  return x;
};
const list = (v: unknown) => {
  const xs = String(v ?? "").split(/[\s,;]+/).filter(Boolean).map((x) => Number(x.replace(/,/g, "")));
  if (!xs.length || xs.some((x) => !Number.isFinite(x))) throw new Error("Enter numbers separated by commas or spaces.");
  return xs;
};
const parseWeightedMasses = (v: unknown) => {
  const tokens = String(v ?? "").split(/[,;\n]|(?<!\*)\s+(?!\*)/).map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) throw new Error("Enter molar masses separated by commas or spaces.");
  const numeric = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
  const pattern = new RegExp(`^(?:(${numeric})\\s*\\*\\s*)?(${numeric})$`);
  return tokens.map((token) => {
    const match = token.match(pattern);
    if (!match) throw new Error("Use positive masses with optional coefficients, such as 2*1.008.");
    const count = match[1] === undefined ? 1 : Number(match[1]);
    const mass = Number(match[2]);
    if (!Number.isFinite(count) || !Number.isFinite(mass) || count <= 0 || mass <= 0) {
      throw new Error("Molar-mass coefficients and masses must be greater than 0.");
    }
    return count * mass;
  });
};
const out = (label: string, value: number | string, primary = false, hint?: string) => ({ label, value: typeof value === "number" ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(value) : value, primary, hint });
const f = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: "number", ...extra });
const text = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: "text", ...extra });
const ta = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: "textarea", ...extra });
const sel = (name: string, label: string, options: { value: string; label: string }[], defaultValue?: string): Field => ({ name, label, type: "select", options, defaultValue: defaultValue ?? options[0]?.value });
const two = (a: string, b: string, labels = [a, b]): Field[] => [f(a, labels[0]), f(b, labels[1])];
const gcd = (a: number, b: number): number => { a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b)); while (b) [a, b] = [b, a % b]; return a || 1; };
const comb = (nn: number, rr: number) => { const n0 = integer(nn, "n"), r0 = integer(rr, "r"); if (n0 < 0 || r0 < 0 || r0 > n0) throw new Error("Need integers with 0 ≤ r ≤ n."); const r = Math.min(r0, n0-r0); let c = 1; for (let i=1;i<=r;i++) c *= (n0-r+i)/i; return Math.round(c); };
const perm = (nn: number, rr: number) => { const n0 = integer(nn, "n"), r0 = integer(rr, "r"); if (n0 < 0 || r0 < 0 || r0 > n0) throw new Error("Need integers with 0 ≤ r ≤ n."); let p=1; for(let i=0;i<r0;i++) p*=n0-i; return p; };
const mean = (xs: number[]) => xs.reduce((a,b)=>a+b,0)/xs.length;

function calculateIrr(cashFlows: number[]): number {
  const nonZeroFlows = cashFlows.filter((flow) => flow !== 0);
  if (!nonZeroFlows.some((flow) => flow < 0) || !nonZeroFlows.some((flow) => flow > 0)) {
    throw new Error("Cash flows must include at least one negative and one positive value.");
  }
  let signChanges = 0;
  for (let index = 1; index < nonZeroFlows.length; index++) {
    if (Math.sign(nonZeroFlows[index]!) !== Math.sign(nonZeroFlows[index - 1]!)) signChanges++;
  }
  if (signChanges > 1) {
    throw new Error("Cash flows with multiple sign changes may have multiple IRRs; use a conventional cash-flow series.");
  }

  const scaledNpv = (rate: number): number => {
    const logDiscount = -Math.log1p(rate);
    let maxLog = Number.NEGATIVE_INFINITY;
    for (let period = 0; period < cashFlows.length; period++) {
      const flow = cashFlows[period]!;
      if (flow !== 0) maxLog = Math.max(maxLog, Math.log(Math.abs(flow)) + period * logDiscount);
    }
    let sum = 0;
    let compensation = 0;
    for (let period = 0; period < cashFlows.length; period++) {
      const flow = cashFlows[period]!;
      if (flow === 0) continue;
      const logTerm = Math.log(Math.abs(flow)) + period * logDiscount - maxLog;
      const term = Math.sign(flow) * Math.exp(logTerm);
      const adjusted = term - compensation;
      const next = sum + adjusted;
      compensation = (next - sum) - adjusted;
      sum = next;
    }
    return sum;
  };

  let low = -0.5;
  let high = 0.5;
  let lowValue = scaledNpv(low);
  let highValue = scaledNpv(high);
  let bracketed = false;
  for (let expansion = 0; expansion < 64; expansion++) {
    if (lowValue === 0) return low;
    if (highValue === 0) return high;
    if ((lowValue < 0) !== (highValue < 0)) {
      bracketed = true;
      break;
    }
    low = Math.max(-0.999999999999, (low - 1) / 2);
    high = high * 2 + 0.5;
    lowValue = scaledNpv(low);
    highValue = scaledNpv(high);
  }
  if (!bracketed) throw new Error("Could not find an IRR above -100% for these cash flows.");

  let rate = low;
  for (let iteration = 0; iteration < 200; iteration++) {
    rate = low + (high - low) / 2;
    const value = scaledNpv(rate);
    if (value === 0 || high - low <= 1e-13 * Math.max(1, Math.abs(rate))) break;
    if ((lowValue < 0) !== (value < 0)) {
      high = rate;
      highValue = value;
    } else {
      low = rate;
      lowValue = value;
    }
  }
  return rate;
}

export const advancedCalculators: Record<string, CalculatorDef> = {};
function add(id: string, fields: Field[], compute: CalculatorDef["compute"], formula?: string) { advancedCalculators[id] = { fields, compute, formula }; }

// ---------- Math ----------
add("basic-calculator", [text("expression", "Expression", { placeholder: "(12 + 8) × 3 - 5 / 2" })], (v) => {
  const raw = String(v.expression ?? "").replace(/×/g,"*").replace(/÷/g,"/").replace(/−/g,"-").trim();
  if (!raw) throw new Error("Enter an expression.");
  if (!/^[0-9+\-*/%^().\s]+$/.test(raw)) throw new Error("Use numbers, parentheses, +, −, ×, ÷, %, and ^ only.");
  const tokens = raw.match(/\d*\.?\d+|[()+\-*/%^]/g) ?? [];
  if (tokens.join("") !== raw.replace(/\s+/g,"")) throw new Error("Invalid expression.");
  const prec: Record<string,number>={"+":1,"-":1,"*":2,"/":2,"%":2,"^":3}; const right=new Set(["^"]); const output:string[]=[]; const ops:string[]=[];
  let expectUnary=true;
  for (const t of tokens) {
    if (/^\d/.test(t)) { output.push(t); expectUnary=false; continue; }
    if (t === "(" ) { ops.push(t); expectUnary=true; continue; }
    if (t === ")") { while(ops.length && ops.at(-1)!=="(") output.push(ops.pop()!); if(ops.pop()!=="(") throw new Error("Mismatched parentheses."); expectUnary=false; continue; }
    if (expectUnary && (t==="-"||t==="+")) { output.push("0"); }
    while(ops.length && ops.at(-1)!=="(" && (prec[ops.at(-1)!] > prec[t] || (prec[ops.at(-1)!]===prec[t]&&!right.has(t)))) output.push(ops.pop()!);
    ops.push(t); expectUnary=true;
  }
  while(ops.length){const op=ops.pop()!;if(op==="(")throw new Error("Mismatched parentheses.");output.push(op);}
  const stack:number[]=[]; for(const t of output){if(/^\d/.test(t)) stack.push(Number(t)); else {const b=stack.pop(),a=stack.pop();if(a==null||b==null)throw new Error("Invalid expression.");const r=t==="+"?a+b:t==="-"?a-b:t==="*"?a*b:t==="/"?a/b:t==="%"?a%b:a**b;if(!Number.isFinite(r))throw new Error("Result is not finite.");stack.push(r);}}
  if(stack.length!==1)throw new Error("Invalid expression."); return [out("Result",stack[0]!,true)];
}, "Safe local expression calculator; no code execution.");
add("math-prime-factorization-calculator", [f("number","Number")], v => { const x=integer(v.number,"number"); if(x<2)throw new Error("Enter an integer ≥ 2."); let n0=x;const fs:number[]=[];for(let p=2;p*p<=n0;p+=(p===2?1:2)){while(n0%p===0){fs.push(p);n0/=p;}}if(n0>1)fs.push(n0);return [out("Prime factors",fs.join(" × "),true),out("Factor count",fs.length)]; });
add("math-gcd-calculator", [f("a","A"),f("b","B")], v=>[out("GCD",gcd(n(v.a),n(v.b)),true)]);
add("math-lcm-calculator", [f("a","A"),f("b","B")], v=>{const a=integer(v.a,"A"),b=integer(v.b,"B");return [out("LCM",Math.abs(a/gcd(a,b)*b),true)];});
add("math-modulo-calculator", [f("a","Dividend"),f("b","Divisor")], v=>{const b=n(v.b,"divisor");if(b===0)throw new Error("Divisor cannot be 0.");return [out("Remainder",n(v.a,"dividend")%b,true)];});
add("math-exponent-calculator", [f("base","Base"),f("exponent","Exponent")], v=>[out("Result",n(v.base)**n(v.exponent),true)]);
add("math-root-calculator", [f("value","Value"),f("degree","Root degree",{defaultValue:2})], v=>{const x=n(v.value),d=pos(v.degree,"degree");if(x<0&&d%2===0)throw new Error("Even roots of negative numbers are not real.");const r=x<0?-((-x)**(1/d)):x**(1/d);return [out("Root",r,true)]});
add("math-logarithm-calculator", [f("value","Value"),f("base","Base",{defaultValue:10})], v=>{const x=pos(v.value,"value"),b=pos(v.base,"base");if(b===1)throw new Error("Base cannot be 1.");return [out("Log",Math.log(x)/Math.log(b),true)]});
add("math-natural-log-calculator", [f("value","Value")], v=>[out("ln(value)",Math.log(pos(v.value,"value")),true)]);
add("math-scientific-notation-calculator", [f("value","Value")], v=>{const x=n(v.value);if(x===0)return [out("Scientific notation","0 × 10⁰",true)];const e=Math.floor(Math.log10(Math.abs(x)));return [out("Scientific notation",`${x/(10**e)} × 10^${e}`,true),out("Exponent",e)];});
add("math-significant-figures-calculator", [f("value","Value"),f("figures","Significant figures",{defaultValue:3})], v=>{const x=n(v.value),s=integer(v.figures,"significant figures");if(s<1||s>15)throw new Error("Use 1–15 significant figures.");if(x===0)return [out("Rounded",0,true)];const places=s-1-Math.floor(Math.log10(Math.abs(x)));const r=Number(x.toFixed(Math.max(0,places)));return [out("Rounded",r,true),out("Scientific",r.toExponential(s-1))];});
add("math-rounding-calculator", [f("value","Value"),f("decimalPlaces","Decimal places",{defaultValue:2})], v=>{const x=n(v.value),d=integer(v.decimalPlaces,"decimal places");return [out("Rounded",Number(x.toFixed(Math.max(0,Math.min(20,d)))),true)];});
add("math-absolute-value-calculator", [f("value","Value")], v=>[out("Absolute value",Math.abs(n(v.value)),true)]);
add("math-sequence-calculator", [ta("numbers","Sequence",{placeholder:"2, 4, 6, 8"})], v=>{const xs=list(v.numbers);return [out("Count",xs.length),out("Next value (pattern)",xs.length>1?xs.at(-1)!+(xs.at(-1)!-xs.at(-2)!):xs[0]!,true)]});
add("math-arithmetic-sequence-calculator", [f("first","First term"),f("difference","Common difference"),f("term","Term number",{defaultValue:10})], v=>{const a=n(v.first),d=n(v.difference),k=integer(v.term,"term number");if(k<1)throw new Error("Term number must be ≥ 1.");return [out("Term",a+(k-1)*d,true),out("Sum through term",k*(2*a+(k-1)*d)/2)];});
add("math-geometric-sequence-calculator", [f("first","First term"),f("ratio","Common ratio"),f("term","Term number",{defaultValue:10})], v=>{const a=n(v.first),r=n(v.ratio),k=integer(v.term,"term number");if(k<1)throw new Error("Term number must be ≥ 1.");const sum=r===1?a*k:a*(r**k-1)/(r-1);return [out("Term",a*r**(k-1),true),out("Sum through term",sum)];});
add("math-fibonacci-calculator", [f("term","Term number",{defaultValue:10})], v=>{const k=integer(v.term,"term number");if(k<0||k>78)throw new Error("Use an integer from 0 to 78 for exact JavaScript-safe results.");let a=0,b=1;for(let i=0;i<k;i++) [a,b]=[b,a+b];return [out("Fibonacci term",a,true)];});
add("math-probability-calculator", [f("favorable","Favorable outcomes"),f("total","Total outcomes")], v=>{const p=n(v.favorable)/pos(v.total,"total");if(p<0||p>1)throw new Error("Favorable outcomes cannot exceed total outcomes.");return [out("Probability",p,true),out("Percent",p*100,false,"%")];});
add("math-permutation-calculator", [f("n","n"),f("r","r")], v=>[out("P(n,r)",perm(n(v.n),n(v.r)),true)]);
add("math-combination-calculator", [f("n","n"),f("r","r")], v=>[out("C(n,r)",comb(n(v.n),n(v.r)),true)]);
add("math-expected-value-calculator", [ta("values","Values"),ta("probabilities","Probabilities",{placeholder:"0.25, 0.5, 0.25"})], v=>{const xs=list(v.values),ps=list(v.probabilities);if(xs.length!==ps.length)throw new Error("Values and probabilities must have the same count.");const total=ps.reduce((a,b)=>a+b,0);if(Math.abs(total-1)>1e-8)throw new Error("Probabilities must add up to 1 (or 100%).");return [out("Expected value",xs.reduce((s,x,i)=>s+x*ps[i]!,0),true)];});
add("math-z-score-calculator", [f("value","Value"),f("mean","Mean"),f("stddev","Standard deviation")], v=>[out("Z-score",(n(v.value)-n(v.mean))/pos(v.stddev,"standard deviation"),true)]);
add("math-percentile-calculator", [ta("numbers","Numbers"),f("percentile","Percentile",{defaultValue:50})], v=>{const xs=list(v.numbers).sort((a,b)=>a-b),p=n(v.percentile);if(p<0||p>100)throw new Error("Percentile must be 0–100.");const rank=(p/100)*(xs.length-1),lo=Math.floor(rank),hi=Math.ceil(rank),r=xs[lo]!+(xs[hi]!-xs[lo]!)*(rank-lo);return [out("Percentile",r,true)];});
add("math-quartile-calculator", [ta("numbers","Numbers"),sel("quartile","Quartile",[{value:"1",label:"Q1"},{value:"2",label:"Q2 (median)"},{value:"3",label:"Q3"}])], v=>{const xs=list(v.numbers).sort((a,b)=>a-b);const p=Number(v.quartile)*25;const rank=(p/100)*(xs.length-1),lo=Math.floor(rank),hi=Math.ceil(rank);return [out(`Q${v.quartile}`,xs[lo]!+(xs[hi]!-xs[lo]!)*(rank-lo),true)];});
add("math-interquartile-range-calculator", [ta("numbers","Numbers")], v=>{const xs=list(v.numbers).sort((a,b)=>a-b);const q=(p:number)=>{const r=p*(xs.length-1),l=Math.floor(r),h=Math.ceil(r);return xs[l]!+(xs[h]!-xs[l]!)*(r-l)};const q1=q(.25),q3=q(.75);return [out("IQR",q3-q1,true),out("Q1",q1),out("Q3",q3)];});
add("math-covariance-calculator", [ta("x","X values"),ta("y","Y values"),sel("kind","Kind",[{value:"population",label:"Population"},{value:"sample",label:"Sample"}])], v=>{const x=list(v.x),y=list(v.y);if(x.length!==y.length||x.length<2)throw new Error("X and Y need the same count (at least 2).");const mx=mean(x),my=mean(y),c=x.reduce((s,a,i)=>s+(a-mx)*(y[i]!-my),0)/(v.kind==="sample"?x.length-1:x.length);return [out("Covariance",c,true)];});
add("math-correlation-calculator", [ta("x","X values"),ta("y","Y values")], v=>{const x=list(v.x),y=list(v.y);if(x.length!==y.length||x.length<2)throw new Error("X and Y need the same count (at least 2).");const mx=mean(x),my=mean(y),num=x.reduce((s,a,i)=>s+(a-mx)*(y[i]!-my),0),den=Math.sqrt(x.reduce((s,a)=>s+(a-mx)**2,0)*y.reduce((s,a)=>s+(a-my)**2,0));if(den===0)throw new Error("Correlation is undefined when a dataset has no variation.");return [out("Pearson r",num/den,true)];});
add("math-regression-calculator", [ta("x","X values"),ta("y","Y values")], v=>{const x=list(v.x),y=list(v.y);if(x.length!==y.length||x.length<2)throw new Error("X and Y need the same count (at least 2).");const mx=mean(x),my=mean(y),den=x.reduce((s,a)=>s+(a-mx)**2,0);if(den===0)throw new Error("Regression needs variation in X.");const slope=x.reduce((s,a,i)=>s+(a-mx)*(y[i]!-my),0)/den,inter=my-slope*mx;return [out("Slope",slope,true),out("Intercept",inter),out("Equation",`y = ${slope}x + ${inter}`)];});
add("math-slope-calculator", [f("x1","x₁"),f("y1","y₁"),f("x2","x₂"),f("y2","y₂")], v=>{const d=n(v.x2)-n(v.x1);if(d===0)throw new Error("x₁ and x₂ cannot be equal.");return [out("Slope",(n(v.y2)-n(v.y1))/d,true)];});
add("math-distance-formula-calculator", [f("x1","x₁"),f("y1","y₁"),f("x2","x₂"),f("y2","y₂")], v=>[out("Distance",Math.hypot(n(v.x2)-n(v.x1),n(v.y2)-n(v.y1)),true)]);
add("math-midpoint-calculator", [f("x1","x₁"),f("y1","y₁"),f("x2","x₂"),f("y2","y₂")], v=>[out("Midpoint",`(${(n(v.x1)+n(v.x2))/2}, ${(n(v.y1)+n(v.y2))/2})`,true)]);
add("math-point-slope-calculator", [f("x1","Known x"),f("y1","Known y"),f("slope","Slope")], v=>[out("Equation",`y - ${n(v.y1)} = ${n(v.slope)}(x - ${n(v.x1)})`,true)]);
add("math-pythagorean-calculator", [f("a","Leg a"),f("b","Leg b")], v=>[out("Hypotenuse",Math.hypot(pos(v.a),pos(v.b)),true)]);
add("math-triangle-angle-calculator", [f("a","Side a"),f("b","Side b"),f("c","Side c")], v=>{const a=pos(v.a),b=pos(v.b),c=pos(v.c);if(a+b<=c||a+c<=b||b+c<=a)throw new Error("These sides do not form a triangle.");const A=Math.acos((b*b+c*c-a*a)/(2*b*c))*180/Math.PI,B=Math.acos((a*a+c*c-b*b)/(2*a*c))*180/Math.PI;return [out("Angle A",A,true,"°"),out("Angle B",B,false,"°"),out("Angle C",180-A-B,false,"°")];});
add("math-triangle-side-calculator", [f("a","Side a"),f("b","Side b"),f("angleC","Included angle C",{suffix:"°"})], v=>[out("Side c",Math.sqrt(pos(v.a)**2+pos(v.b)**2-2*pos(v.a)*pos(v.b)*Math.cos(n(v.angleC)*Math.PI/180)),true)]);
add("math-circle-arc-calculator", [f("radius","Radius"),f("angle","Central angle",{suffix:"°"})], v=>{const r=pos(v.radius),a=n(v.angle);if(a<0||a>360)throw new Error("Angle must be 0–360°.");return [out("Arc length",r*a*Math.PI/180,true),out("Sector area",0.5*r*r*a*Math.PI/180)];});
add("math-sector-area-calculator", [f("radius","Radius"),f("angle","Angle",{suffix:"°"})], v=>[out("Sector area",0.5*pos(v.radius)**2*n(v.angle)*Math.PI/180,true)]);
add("math-polygon-area-calculator", [f("sides","Number of sides",{defaultValue:6}),f("side","Side length")], v=>{const n0=integer(v.sides,"sides"),s=pos(v.side,"side");if(n0<3)throw new Error("A polygon needs at least 3 sides.");return [out("Area",(n0*s*s)/(4*Math.tan(Math.PI/n0)),true)];});
add("math-ellipse-area-calculator", [f("a","Semi-axis a"),f("b","Semi-axis b")], v=>[out("Area",Math.PI*pos(v.a)*pos(v.b),true)]);
add("math-trapezoid-area-calculator", [f("a","Base a"),f("b","Base b"),f("height","Height")], v=>[out("Area",((n(v.a)+n(v.b))/2)*pos(v.height),true)]);
add("math-parallelogram-area-calculator", [f("base","Base"),f("height","Height")], v=>[out("Area",pos(v.base)*pos(v.height),true)]);
add("math-rhombus-area-calculator", [f("d1","Diagonal 1"),f("d2","Diagonal 2")], v=>[out("Area",0.5*pos(v.d1)*pos(v.d2),true)]);
add("math-prism-volume-calculator", [f("baseArea","Base area"),f("height","Height")], v=>[out("Volume",pos(v.baseArea)*pos(v.height),true)]);
add("math-pyramid-volume-calculator", [f("baseArea","Base area"),f("height","Height")], v=>[out("Volume",pos(v.baseArea)*pos(v.height)/3,true)]);
add("math-torus-volume-calculator", [f("majorRadius","Major radius"),f("minorRadius","Minor radius")], v=>[out("Volume",2*Math.PI**2*pos(v.majorRadius)*pos(v.minorRadius)**2,true)]);
add("math-frustum-calculator", [f("r1","Top radius"),f("r2","Bottom radius"),f("height","Height")], v=>[out("Volume",Math.PI*pos(v.height)*(n(v.r1)**2+n(v.r1)*n(v.r2)+n(v.r2)**2)/3,true)]);
add("math-surface-area-calculator", [f("length","Length"),f("width","Width"),f("height","Height")], v=>{const l=pos(v.length),w=pos(v.width),h=pos(v.height);return [out("Surface area",2*(l*w+l*h+w*h),true)];});
add("math-scale-factor-calculator", [f("original","Original length"),f("new","New length")], v=>[out("Scale factor",n(v.new)/pos(v.original,"original"),true)]);
add("math-similarity-calculator", [f("a1","First side"),f("a2","Corresponding side"),f("b1","Another first side")], v=>[out("Corresponding b₂",n(v.b1)*n(v.a2)/pos(v.a1),true)]);
add("math-coordinate-geometry-calculator", [f("x1","x₁"),f("y1","y₁"),f("x2","x₂"),f("y2","y₂")], v=>{const x1=n(v.x1),y1=n(v.y1),x2=n(v.x2),y2=n(v.y2);return [out("Distance",Math.hypot(x2-x1,y2-y1),true),out("Slope",x2===x1?"Undefined":(y2-y1)/(x2-x1)),out("Midpoint",`(${(x1+x2)/2}, ${(y1+y2)/2})`)];});

// ---------- Finance ----------
add("finance-apy-calculator", [f("rate","Nominal annual rate",{suffix:"%"}),f("compounds","Compounds / year",{defaultValue:12})], v=>{const r=n(v.rate)/100,m=pos(v.compounds);return [out("APY",((1+r/m)**m-1)*100,true,"%")];});
add("finance-apr-calculator", [f("interest","Interest / year"),f("principal","Principal")], v=>[out("APR",n(v.interest)/pos(v.principal)*100,true,"%")]);
add("finance-amortization-calculator", [f("principal","Principal"),f("rate","Annual rate",{suffix:"%"}),f("years","Years"),f("payments","Payments / year",{defaultValue:12})], v=>{const P=pos(v.principal),m=pos(v.payments),N=pos(v.years)*m,r=n(v.rate)/100/m,p=r?P*r*(1+r)**N/((1+r)**N-1):P/N;return [out("Payment",p,true),out("Total paid",p*N),out("Total interest",p*N-P)];});
add("finance-payment-calculator", [f("principal","Principal"),f("rate","Annual rate",{suffix:"%"}),f("years","Years")], v=>{const P=pos(v.principal),r=n(v.rate)/1200,N=pos(v.years)*12,p=r?P*r*(1+r)**N/((1+r)**N-1):P/N;return [out("Monthly payment",p,true)];});
add("finance-future-value-calculator", [f("present","Present value"),f("rate","Annual rate",{suffix:"%"}),f("years","Years"),f("contribution","Annual contribution",{defaultValue:0})], v=>{const P=n(v.present),r=n(v.rate)/100,t=pos(v.years);const fv=P*(1+r)**t+n(v.contribution)*(((1+r)**t-1)/(r||1));return [out("Future value",r===0?P+n(v.contribution)*t:fv,true)];});
add("finance-present-value-calculator", [f("future","Future value"),f("rate","Annual rate",{suffix:"%"}),f("years","Years")], v=>[out("Present value",n(v.future)/(1+n(v.rate)/100)**pos(v.years),true)]);
add("finance-npv-calculator", [f("initial","Initial investment"),ta("cashflows","Future cash flows",{placeholder:"1000, 1200, 1500"}),f("rate","Discount rate",{suffix:"%"})], v=>{const r=n(v.rate)/100,c=list(v.cashflows),npv=-n(v.initial)+c.reduce((s,x,i)=>s+x/(1+r)**(i+1),0);return [out("NPV",npv,true)];});
add(
  "finance-irr-calculator",
  [ta("cashflows", "Cash flows", { placeholder: "-1000, 300, 400, 500" })],
  (v) => [out("IRR", calculateIrr(list(v.cashflows)) * 100, true, "% · estimate")],
);
add("finance-cagr-calculator", [f("start","Start value"),f("end","End value"),f("years","Years")], v=>[out("CAGR",((pos(v.end)/pos(v.start))**(1/pos(v.years))-1)*100,true,"%")]);
add("finance-inflation-calculator", [f("amount","Current amount"),f("inflation","Annual inflation",{suffix:"%"}),f("years","Years")], v=>{const a=pos(v.amount),r=n(v.inflation)/100,t=pos(v.years);return [out("Future cost",a*(1+r)**t,true),out("Purchasing power",a/(1+r)**t)];});
add("finance-debt-payoff-calculator", [f("balance","Balance"),f("rate","Annual rate",{suffix:"%"}),f("payment","Monthly payment")], v=>{const B=pos(v.balance),r=n(v.rate)/1200,p=pos(v.payment);if(r>0&&p<=B*r)throw new Error("Payment must exceed the first month's interest.");const months=r===0?B/p:-Math.log(1-B*r/p)/Math.log(1+r);return [out("Payoff time",months,true,"months"),out("Years",months/12)];});
add("finance-debt-to-income-calculator", [f("monthlyDebt","Monthly debt payments"),f("monthlyIncome","Gross monthly income")], v=>[out("DTI",n(v.monthlyDebt)/pos(v.monthlyIncome)*100,true,"%")]);
add("finance-savings-goal-calculator", [f("goal","Goal amount"),f("current","Current savings",{defaultValue:0}),f("months","Months"),f("rate","Annual rate",{suffix:"%",defaultValue:0})], v=>{const G=pos(v.goal),C=n(v.current),m=pos(v.months),r=n(v.rate)/1200;const p=r?Math.max(0,(G-C*(1+r)**m)*r/((1+r)**m-1)):(G-C)/m;return [out("Monthly saving",p,true)];});
add("finance-emergency-fund-calculator", [f("monthlyExpenses","Monthly essential expenses"),f("months","Months of cover",{defaultValue:6})], v=>[out("Emergency fund target",pos(v.monthlyExpenses)*pos(v.months),true)]);
add("finance-retirement-calculator", [f("current","Current savings",{defaultValue:0}),f("monthly","Monthly contribution"),f("return","Annual return",{suffix:"%",defaultValue:7}),f("years","Years")], v=>{const C=n(v.current),p=n(v.monthly),r=n(v.return)/1200,N=pos(v.years)*12;const fv=C*(1+r)**N+p*((1+r)**N-1)/(r||1);return [out("Projected balance",r===0?C+p*N:fv,true,"estimate")];});
add("finance-401k-calculator", [f("salary","Annual salary"),f("contribution","Employee contribution",{suffix:"%"}),f("match","Employer match",{suffix:"%"})], v=>[out("Annual employee contribution",n(v.salary)*n(v.contribution)/100,true),out("Employer contribution",n(v.salary)*n(v.match)/100)]);
add("finance-pension-calculator", [f("salary","Final annual salary"),f("years","Years of service"),f("rate","Pension rate",{suffix:"%",defaultValue:1.5})], v=>[out("Estimated annual pension",n(v.salary)*n(v.years)*n(v.rate)/100,true,"estimate")]);
add("finance-investment-return-calculator", [f("initial","Initial investment"),f("final","Final value"),f("years","Years")], v=>{const i=pos(v.initial),fv=n(v.final),t=pos(v.years);return [out("Total return",fv-i,true),out("Return %",(fv/i-1)*100,false,"%"),out("Annualized return",((fv/i)**(1/t)-1)*100,false,"%")];});
add("finance-dividend-calculator", [f("shares","Shares"),f("dividendPerShare","Dividend / share"),f("price","Share price",{defaultValue:0})], v=>{const income=pos(v.shares)*n(v.dividendPerShare);return [out("Annual dividend",income,true),out("Yield",n(v.price)>0?income/(pos(v.shares)*n(v.price))*100:0,false,"%")];});
add("finance-stock-return-calculator", [f("buy","Buy price"),f("sell","Sell price"),f("shares","Shares",{defaultValue:1}),f("dividends","Total dividends",{defaultValue:0})], v=>{const gain=(n(v.sell)-n(v.buy))*pos(v.shares)+n(v.dividends);return [out("Total gain",gain,true),out("Return %",gain/(pos(v.buy)*pos(v.shares))*100,false,"%")];});
add("finance-bond-yield-calculator", [f("face","Face value"),f("price","Purchase price"),f("coupon","Annual coupon")], v=>[out("Current yield",n(v.coupon)/pos(v.price)*100,true,"%")]);
add("finance-discount-rate-calculator", [f("future","Future value"),f("present","Present value"),f("years","Years")], v=>[out("Annual discount rate",(1-(n(v.present)/pos(v.future))**(1/pos(v.years)))*100,true,"%")]);
add("finance-commission-calculator", [f("sales","Sales"),f("rate","Commission",{suffix:"%"})], v=>[out("Commission",n(v.sales)*n(v.rate)/100,true),out("After commission",n(v.sales)*(1-n(v.rate)/100))]);
add("finance-overtime-pay-calculator", [f("hourly","Hourly rate"),f("regularHours","Regular hours"),f("overtimeHours","Overtime hours"),f("multiplier","Overtime multiplier",{defaultValue:1.5})], v=>[out("Total pay",n(v.hourly)*n(v.regularHours)+n(v.hourly)*n(v.overtimeHours)*n(v.multiplier),true)]);
add("finance-take-home-pay-calculator", [f("gross","Gross pay"),f("tax","Tax",{suffix:"%"}),f("deductions","Other deductions",{defaultValue:0})], v=>{const gross=n(v.gross),tax=gross*n(v.tax)/100,d=n(v.deductions);return [out("Take-home",gross-tax-d,true),out("Tax",tax)];});
add("finance-salary-to-hourly-calculator", [f("salary","Annual salary"),f("hoursWeek","Hours / week",{defaultValue:40}),f("weeks","Weeks / year",{defaultValue:52})], v=>[out("Hourly rate",n(v.salary)/(pos(v.hoursWeek)*pos(v.weeks)),true)]);
add("finance-hourly-to-salary-calculator", [f("hourly","Hourly rate"),f("hoursWeek","Hours / week",{defaultValue:40}),f("weeks","Weeks / year",{defaultValue:52})], v=>[out("Annual salary",n(v.hourly)*pos(v.hoursWeek)*pos(v.weeks),true)]);
add("finance-cash-flow-calculator", [f("inflow","Cash inflow"),f("outflow","Cash outflow")], v=>[out("Net cash flow",n(v.inflow)-n(v.outflow),true)]);
add("finance-gross-profit-calculator", [f("revenue","Revenue"),f("cogs","COGS")], v=>{const p=n(v.revenue)-n(v.cogs);return [out("Gross profit",p,true),out("Gross margin",p/n(v.revenue)*100,false,"%")];});
add("finance-net-profit-calculator", [f("revenue","Revenue"),f("expenses","Expenses"),f("tax","Tax",{suffix:"%",defaultValue:0})], v=>{const pre=n(v.revenue)-n(v.expenses),tax=Math.max(0,pre)*n(v.tax)/100;return [out("Net profit",pre-tax,true),out("Net margin",(pre-tax)/n(v.revenue)*100,false,"%")];});
add("finance-operating-margin-calculator", [f("operatingIncome","Operating income"),f("revenue","Revenue")], v=>[out("Operating margin",n(v.operatingIncome)/pos(v.revenue)*100,true,"%")]);
add("finance-contribution-margin-calculator", [f("sales","Sales"),f("variableCosts","Variable costs")], v=>{const c=n(v.sales)-n(v.variableCosts);return [out("Contribution margin",c,true),out("Margin %",c/n(v.sales)*100,false,"%")];});
add("finance-inventory-turnover-calculator", [f("cogs","COGS"),f("inventory","Average inventory")], v=>[out("Inventory turnover",n(v.cogs)/pos(v.inventory),true,"times")]);
add("finance-customer-acquisition-cost-calculator", [f("marketing","Marketing spend"),f("newCustomers","New customers")], v=>[out("CAC",n(v.marketing)/pos(v.newCustomers),true)]);
add("finance-customer-lifetime-value-calculator", [f("avgOrder","Average order value"),f("purchaseRate","Purchases / year"),f("years","Customer years"),f("margin","Gross margin",{suffix:"%",defaultValue:100})], v=>[out("LTV",n(v.avgOrder)*n(v.purchaseRate)*pos(v.years)*n(v.margin)/100,true,"estimate")]);
add("finance-burn-rate-calculator", [f("startingCash","Starting cash"),f("endingCash","Ending cash"),f("months","Months")], v=>[out("Monthly burn",(n(v.startingCash)-n(v.endingCash))/pos(v.months),true)]);
add("finance-runway-calculator", [f("cash","Cash available"),f("monthlyBurn","Monthly burn")], v=>[out("Runway",n(v.cash)/pos(v.monthlyBurn),true,"months")]);
add("finance-recurring-revenue-calculator", [f("customers","Customers"),f("price","Recurring price")], v=>[out("Recurring revenue",n(v.customers)*n(v.price),true)]);
add("finance-mrr-calculator", [f("customers","Paying customers"),f("arpu","ARPU / month")], v=>[out("MRR",n(v.customers)*n(v.arpu),true)]);
add("finance-arr-calculator", [f("mrr","MRR")], v=>[out("ARR",n(v.mrr)*12,true)]);
add("finance-churn-calculator", [f("lost","Customers lost"),f("starting","Customers at start")], v=>[out("Churn rate",n(v.lost)/pos(v.starting)*100,true,"%")]);

// ---------- Construction ----------
const material = (id:string, compute:CalculatorDef["compute"], fields:Field[]) => add(id,fields,compute);
material("construction-concrete-volume-calculator",v=>[out("Concrete volume",pos(v.length)*pos(v.width)*pos(v.depth),true,"cubic units")],[f("length","Length"),f("width","Width"),f("depth","Depth")]);
material("construction-concrete-weight-calculator",v=>[out("Weight",pos(v.volume)*n(v.density),true)],[f("volume","Volume"),f("density","Density",{defaultValue:2400})]);
material("construction-brick-calculator",v=>{const a=pos(v.wallLength)*pos(v.wallHeight),ba=(pos(v.brickLength)/100)*(pos(v.brickHeight)/100);return [out("Bricks",Math.ceil(a/ba*(1+n(v.waste)/100)),true)];},[f("wallLength","Wall length"),f("wallHeight","Wall height"),f("brickLength","Brick length cm",{defaultValue:21.5}),f("brickHeight","Brick height cm",{defaultValue:6.5}),f("waste","Waste",{suffix:"%",defaultValue:10})]);
material("construction-block-calculator",v=>[out("Blocks",Math.ceil(pos(v.wallLength)*pos(v.wallHeight)/(pos(v.blockLength)*pos(v.blockHeight))*(1+n(v.waste)/100)),true)],[f("wallLength","Wall length"),f("wallHeight","Wall height"),f("blockLength","Block length"),f("blockHeight","Block height"),f("waste","Waste",{suffix:"%",defaultValue:10})]);
material("construction-mortar-calculator",v=>[out("Mortar volume",pos(v.wallArea)*n(v.thickness),true)],[f("wallArea","Wall area"),f("thickness","Mortar thickness")]);
material("construction-tile-calculator",v=>[out("Tiles",Math.ceil(pos(v.area)/(pos(v.tileLength)*pos(v.tileWidth))*(1+n(v.waste)/100)),true)],[f("area","Area"),f("tileLength","Tile length"),f("tileWidth","Tile width"),f("waste","Waste",{suffix:"%",defaultValue:10})]);
material("construction-grout-calculator",v=>[out("Grout volume",pos(v.area)*n(v.jointWidth)*n(v.depth),true)],[f("area","Tiled area"),f("jointWidth","Joint width"),f("depth","Joint depth")]);
material("construction-paint-coverage-calculator",v=>[out("Paint needed",pos(v.area)*pos(v.coats)/pos(v.coverage),true,"same volume units as coverage")],[f("area","Area"),f("coats","Coats",{defaultValue:2}),f("coverage","Coverage / unit",{defaultValue:10})]);
material("construction-flooring-calculator",v=>[out("Material area",pos(v.length)*pos(v.width)*(1+n(v.waste)/100),true)],[f("length","Length"),f("width","Width"),f("waste","Waste",{suffix:"%",defaultValue:10})]);
material("construction-carpet-calculator",v=>[out("Carpet area",pos(v.length)*pos(v.width)*(1+n(v.waste)/100),true)],[f("length","Length"),f("width","Width"),f("waste","Waste",{suffix:"%",defaultValue:10})]);
material("construction-laminate-calculator",v=>[out("Boxes needed",Math.ceil(pos(v.length)*pos(v.width)*(1+n(v.waste)/100)/pos(v.coverage)),true)],[f("length","Length"),f("width","Width"),f("coverage","Coverage per box"),f("waste","Waste",{suffix:"%",defaultValue:10})]);
material("construction-roofing-calculator",v=>{const area=pos(v.length)*pos(v.width)/Math.cos(n(v.pitch)*Math.PI/180);return [out("Roof area",area,true),out("Squares",area/9.2903)];},[f("length","Plan length"),f("width","Plan width"),f("pitch","Pitch",{suffix:"°",defaultValue:30})]);
material("construction-roof-pitch-calculator",v=>{const rise=pos(v.rise),run=pos(v.run);return [out("Pitch",Math.atan(rise/run)*180/Math.PI,true,"°"),out("Slope",rise/run)];},[f("rise","Rise"),f("run","Run")]);
material("construction-shingle-calculator",v=>[out("Shingle squares",pos(v.area)/100,true)],[f("area","Roof area")]);
material("construction-gutter-calculator",v=>[out("Gutter length",pos(v.length)+pos(v.width)*2,true)],[f("length","Building length"),f("width","Building width")]);
material("construction-drywall-calculator",v=>[out("Sheets",Math.ceil(pos(v.area)/pos(v.sheetArea)),true)],[f("area","Wall/ceiling area"),f("sheetArea","Sheet area",{defaultValue:2.88})]);
material("construction-insulation-calculator",v=>[out("Insulation area",pos(v.length)*pos(v.width),true)],[f("length","Length"),f("width","Width")]);
material("construction-lumber-calculator",v=>[out("Board feet",pos(v.thickness)*pos(v.width)*pos(v.length)*pos(v.count)/12,true)],[f("thickness","Thickness in"),f("width","Width in"),f("length","Length in"),f("count","Count",{defaultValue:1})]);
material("construction-board-foot-calculator",v=>[out("Board feet",pos(v.thickness)*pos(v.width)*pos(v.length)/12,true)],[f("thickness","Thickness in"),f("width","Width in"),f("length","Length in")]);
material("construction-stair-calculator",v=>{const risers=integer(v.risers,"risers"),r=n(v.totalRise)/risers,t=n(v.tread);return [out("Riser height",r,true),out("Total run",(risers-1)*t)];},[f("totalRise","Total rise"),f("risers","Number of risers",{defaultValue:12}),f("tread","Tread depth")]);
material("construction-stair-stringer-calculator",v=>{const r=pos(v.rise),t=pos(v.tread),count=integer(v.count,"count");return [out("Stringer length",Math.hypot(r,t)*Math.max(1,count-1),true)];},[f("rise","Riser height"),f("tread","Tread depth"),f("count","Steps",{defaultValue:12})]);
material("construction-deck-calculator",v=>[out("Deck area",pos(v.length)*pos(v.width),true),out("Boards",Math.ceil(pos(v.length)*pos(v.width)/pos(v.boardCoverage)))],[f("length","Length"),f("width","Width"),f("boardCoverage","Coverage per board")]);
material("construction-fence-calculator",v=>[out("Posts",Math.ceil(pos(v.length)/pos(v.spacing))+1,true),out("Fence length",pos(v.length))],[f("length","Fence length"),f("spacing","Post spacing",{defaultValue:2.4})]);
material("construction-post-calculator",v=>[out("Post volume",pos(v.width)*pos(v.depth)*pos(v.height),true)],[f("width","Width"),f("depth","Depth"),f("height","Height")]);
material("construction-gravel-calculator",v=>[out("Volume",pos(v.length)*pos(v.width)*pos(v.depth),true),out("Weight",pos(v.length)*pos(v.width)*pos(v.depth)*n(v.density))],[f("length","Length"),f("width","Width"),f("depth","Depth"),f("density","Density",{defaultValue:1600})]);
material("construction-mulch-calculator",v=>[out("Mulch volume",pos(v.length)*pos(v.width)*pos(v.depth),true)],[f("length","Length"),f("width","Width"),f("depth","Depth")]);
material("construction-soil-calculator",v=>[out("Soil volume",pos(v.length)*pos(v.width)*pos(v.depth),true)],[f("length","Length"),f("width","Width"),f("depth","Depth")]);
material("construction-land-area-calculator",v=>[out("Area",pos(v.length)*pos(v.width),true)],[f("length","Length"),f("width","Width")]);
material("construction-excavation-calculator",v=>[out("Excavation volume",pos(v.length)*pos(v.width)*pos(v.depth),true)],[f("length","Length"),f("width","Width"),f("depth","Depth")]);

// ---------- Science ----------
const sci = (id:string,fields:Field[],compute:CalculatorDef["compute"]) => add(id,fields,compute);
sci("science-velocity-calculator",two("distance","time",["Distance","Time"]),v=>[out("Velocity",n(v.distance)/pos(v.time),true)]);
sci("science-acceleration-calculator",[f("v0","Initial velocity"),f("v1","Final velocity"),f("time","Time")],v=>[out("Acceleration",(n(v.v1)-n(v.v0))/pos(v.time),true)]);
sci("science-force-calculator",[f("mass","Mass"),f("acceleration","Acceleration")],v=>[out("Force",n(v.mass)*n(v.acceleration),true,"N")]);
sci("science-momentum-calculator",[f("mass","Mass"),f("velocity","Velocity")],v=>[out("Momentum",n(v.mass)*n(v.velocity),true,"kg·m/s")]);
sci("science-kinetic-energy-calculator",[f("mass","Mass"),f("velocity","Velocity")],v=>[out("Kinetic energy",.5*n(v.mass)*n(v.velocity)**2,true,"J")]);
sci("science-potential-energy-calculator",[f("mass","Mass"),f("height","Height"),f("g","g",{defaultValue:9.80665})],v=>[out("Potential energy",n(v.mass)*n(v.g)*n(v.height),true,"J")]);
sci("science-work-calculator",[f("force","Force"),f("distance","Distance"),f("angle","Angle",{defaultValue:0,suffix:"°"})],v=>[out("Work",n(v.force)*n(v.distance)*Math.cos(n(v.angle)*Math.PI/180),true,"J")]);
sci("science-power-calculator",[f("work","Work"),f("time","Time")],v=>[out("Power",n(v.work)/pos(v.time),true,"W")]);
sci("science-pressure-calculator",[f("force","Force"),f("area","Area")],v=>[out("Pressure",n(v.force)/pos(v.area),true,"Pa")]);
sci("science-density-calculator",[f("mass","Mass"),f("volume","Volume")],v=>[out("Density",n(v.mass)/pos(v.volume),true)]);
sci("science-buoyancy-calculator",[f("fluidDensity","Fluid density"),f("volume","Displaced volume"),f("g","g",{defaultValue:9.80665})],v=>[out("Buoyant force",n(v.fluidDensity)*n(v.volume)*n(v.g),true,"N")]);
sci("science-ohms-law-calculator",[f("voltage","Voltage"),f("current","Current"),f("resistance","Resistance")],v=>{const V=String(v.voltage).trim(),I=String(v.current).trim(),R=String(v.resistance).trim();if([V,I,R].filter(Boolean).length!==2)throw new Error("Enter exactly two values.");const vv=V?n(V):I&&R?n(I)*n(R):n(v.voltage),ii=I?n(I):V&&R?n(V)/n(R):n(v.current),rr=R?n(R):n(v.voltage)/n(v.current);return [out("Voltage",vv,true,"V"),out("Current",ii,false,"A"),out("Resistance",rr,false,"Ω")];});
sci("science-voltage-divider-calculator",[f("vin","Input voltage"),f("r1","R1"),f("r2","R2")],v=>[out("Output voltage",n(v.vin)*n(v.r2)/(n(v.r1)+n(v.r2)),true,"V")]);
sci("science-resistor-calculator",[f("voltage","Voltage"),f("current","Current")],v=>[out("Resistance",n(v.voltage)/pos(v.current),true,"Ω")]);
sci("science-capacitor-calculator",[f("charge","Charge"),f("voltage","Voltage")],v=>[out("Capacitance",n(v.charge)/pos(v.voltage),true,"F")]);
sci("science-inductor-calculator",[f("voltage","Voltage"),f("diDt","di/dt")],v=>[out("Inductance",n(v.voltage)/pos(v.diDt),true,"H")]);
sci("science-electrical-energy-calculator",[f("power","Power"),f("time","Time")],v=>[out("Energy",n(v.power)*n(v.time),true)]);
sci("science-wavelength-calculator",[f("frequency","Frequency"),f("speed","Wave speed",{defaultValue:299792458})],v=>[out("Wavelength",n(v.speed)/pos(v.frequency),true,"m")]);
sci("science-frequency-calculator",[f("wavelength","Wavelength"),f("speed","Wave speed",{defaultValue:299792458})],v=>[out("Frequency",n(v.speed)/pos(v.wavelength),true,"Hz")]);
sci("science-photon-energy-calculator",[f("frequency","Frequency"),f("h","Planck constant",{defaultValue:6.62607015e-34})],v=>[out("Photon energy",n(v.h)*n(v.frequency),true,"J")]);
sci("science-molarity-calculator",[f("moles","Moles"),f("liters","Solution volume (L)")],v=>[out("Molarity",n(v.moles)/pos(v.liters),true,"mol/L")]);
sci("science-moles-calculator",[f("mass","Mass"),f("molarMass","Molar mass")],v=>[out("Moles",n(v.mass)/pos(v.molarMass),true,"mol")]);
sci("science-molar-mass-calculator",[ta("masses","Atomic/molar masses",{placeholder:"12.01, 2*1.008, 16.00"})],v=>[out("Total molar mass",parseWeightedMasses(v.masses).reduce((a,b)=>a+b,0),true,"g/mol")]);
sci("science-dilution-calculator",[f("c1","Initial concentration"),f("v1","Initial volume"),f("c2","Final concentration")],v=>[out("Final volume",n(v.c1)*n(v.v1)/pos(v.c2),true)]);
sci("science-ph-calculator",[f("hydrogen","[H⁺] mol/L")],v=>[out("pH",-Math.log10(pos(v.hydrogen)),true)]);
sci("science-half-life-calculator",[f("initial","Initial amount"),f("halfLife","Half-life"),f("time","Elapsed time")],v=>[out("Remaining",n(v.initial)*.5**(n(v.time)/pos(v.halfLife)),true)]);
sci("science-heat-energy-calculator",[f("mass","Mass"),f("specificHeat","Specific heat"),f("deltaT","Temperature change")],v=>[out("Heat energy",n(v.mass)*n(v.specificHeat)*n(v.deltaT),true,"J")]);
sci("science-gas-law-calculator",[f("p1","P₁"),f("v1","V₁"),f("t1","T₁"),f("p2","P₂"),f("v2","V₂"),f("t2","T₂")],v=>{
  const names=["p1","v1","t1","p2","v2","t2"] as const;
  type GasVariable=typeof names[number];
  const labels:Record<GasVariable,string>={p1:"P₁",v1:"V₁",t1:"T₁",p2:"P₂",v2:"V₂",t2:"T₂"};
  const provided=names.filter(name=>String(v[name]??"").trim()!=="");
  if(provided.length!==5)throw new Error("Enter exactly five of the six variables.");
  const missing=names.find(name=>String(v[name]??"").trim()==="")!;
  const val=(name:GasVariable)=>pos(v[name],labels[name]);
  const formulas:Record<GasVariable,()=>number>={
    p1:()=>val("p2")*val("v2")*val("t1")/(val("v1")*val("t2")),
    v1:()=>val("p2")*val("v2")*val("t1")/(val("p1")*val("t2")),
    t1:()=>val("p1")*val("v1")*val("t2")/(val("p2")*val("v2")),
    p2:()=>val("p1")*val("v1")*val("t2")/(val("v2")*val("t1")),
    v2:()=>val("p1")*val("v1")*val("t2")/(val("p2")*val("t1")),
    t2:()=>val("p2")*val("v2")*val("t1")/(val("p1")*val("v1")),
  };
  const result=formulas[missing]();
  if(!Number.isFinite(result))throw new Error("The calculated result is outside the supported numeric range.");
  return [out(labels[missing],result,true)];
});
sci("science-ideal-gas-calculator",[f("pressure","Pressure"),f("volume","Volume"),f("moles","Moles"),f("temperature","Temperature K")],v=>[out("Gas constant check",n(v.pressure)*n(v.volume)/(n(v.moles)*pos(v.temperature)),true,"R units depend on your inputs")]);
 sci("science-temperature-conversion-calculator",[f("value","Temperature"),sel("from","From",[{value:"c",label:"Celsius"},{value:"f",label:"Fahrenheit"},{value:"k",label:"Kelvin"}])],v=>{const x=n(v.value);const c=v.from==="c"?x:v.from==="f"?(x-32)*5/9:x-273.15;return [out("Celsius",c,true,"°C"),out("Fahrenheit",c*9/5+32,false,"°F"),out("Kelvin",c+273.15,false,"K")];});

// aliases for expanded names whose existing definitions are equivalent.

export function getAdvancedCalculator(id: string): CalculatorDef | undefined { return advancedCalculators[id]; }
