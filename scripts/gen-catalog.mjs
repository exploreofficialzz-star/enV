/**
 * Generates src/data/catalog.ts from compact tool tuples.
 * Run: node scripts/gen-catalog.mjs
 */
import { writeFileSync, readFileSync } from "node:fs";
import mathExpansion from "../src/data/math-expansion.json" with { type: "json" };

/** @typedef {[string, string, string, string, string, string, string, number, number, string?]} Tuple */
// id, name, cat, desc, engineType, engineKey, keywords, featured(0/1), pop, extra
// extra: n=new, h=health, f=finance, e=earnings, m=mockup, p=planned, b=beta, s=estimate

const ICON = {
  calculators: "Calculator",
  converters: "ArrowLeftRight",
  developer: "Code2",
  text: "Type",
  image: "Image",
  design: "Palette",
  pdf: "FileText",
  files: "Folder",
  security: "Shield",
  fitness: "HeartPulse",
  datetime: "Calendar",
  creators: "Clapperboard",
  business: "Briefcase",
  random: "Dices",
  seo: "Search",
  qr: "QrCode",
  network: "Globe",
  ai: "Sparkles",
  education: "GraduationCap",
  productivity: "Timer",
  generators: "Wand2",
  testdata: "Database",
  social: "Share2",
  video: "Video",
  audio: "AudioLines",
  mockups: "MessageSquare",
  screenshots: "Smartphone",
  interactive: "Sparkles",
  celebrations: "PartyPopper",
  relationships: "Heart",
  events: "Calendar",
  gaming: "Gamepad2",
  photography: "Camera",
  travel: "Plane",
  food: "Utensils",
  career: "BriefcaseBusiness",
  ecommerce: "ShoppingCart",
  accessibility: "Accessibility",
  webdesign: "PanelsTopLeft",
  marketing: "Megaphone",
  streaming: "Radio",
  communication: "MessageCircle",
  personal: "UserRound",
};

/** @type {Tuple[]} */
const RAW = [];

function add(rows) {
  for (const r of rows) RAW.push(r);
}

add([
  ["percentage-calculator","Percentage Calculator","calculators","Find what percent one number is of another, plus increase and decrease.","calculator","percentage","percent % ratio markup",1,99,"n"],
  ["percentage-change-calculator","Percentage Change Calculator","calculators","Calculate the percent increase or decrease between two values.","calculator","percentage-change","percent change increase decrease",1,92],
  ["percentage-of-calculator","Percentage Of Calculator","calculators","Find X percent of a number, or the original amount from a percent.","calculator","percentage-of","percent of part whole",0,84],
  ["fraction-calculator","Fraction Calculator","calculators","Add, subtract, multiply, and divide fractions, with a decimal result.","calculator","fraction","fraction mix improper",0,80],
  ["ratio-calculator","Ratio Calculator","calculators","Simplify ratios and scale them to a target total.","calculator","ratio","ratio proportion scale",0,78],
  ["proportion-calculator","Proportion Calculator","calculators","Solve a/b = c/d for a missing value.","calculator","proportion","proportion cross multiply",0,74],
  ["average-calculator","Average Calculator","calculators","Mean of a list of numbers, with optional weighted average.","calculator","average","average mean list",1,88],
  ["mean-calculator","Mean Calculator","calculators","Arithmetic mean of any set of numbers.","calculator","mean","mean average",0,70],
  ["median-calculator","Median Calculator","calculators","Find the median of a numeric list.","calculator","median","median middle",0,68],
  ["mode-calculator","Mode Calculator","calculators","Find the most frequent number in a list.","calculator","mode","mode frequent",0,64],
  ["standard-deviation-calculator","Standard Deviation Calculator","calculators","Sample or population standard deviation and variance.","calculator","stddev","standard deviation variance stats",0,72],
  ["basic-calculator","Basic Calculator","calculators","Add, subtract, multiply, and divide with a running total.","custom","basic-calculator","calculator arithmetic plus minus",1,95],
  ["quadratic-calculator","Quadratic Equation Solver","calculators","Solve ax² + bx + c = 0 and show discriminant and roots.","calculator","quadratic","quadratic equation roots",1,86],
  ["exponent-calculator","Exponent Calculator","calculators","Raise a base to a power, including roots as fractional exponents.","calculator","exponent","exponent power ^",0,73],
  ["logarithm-calculator","Logarithm Calculator","calculators","Log of a number in any base, including natural log.","calculator","logarithm","log ln logarithm",0,70],
  ["factorial-calculator","Factorial Calculator","calculators","n! for non-negative integers.","calculator","factorial","factorial permutation",0,66],
  ["permutation-calculator","Permutation Calculator","calculators","P(n, r) — ordered selections from n items.","calculator","permutation","permutation npr",0,67],
  ["combination-calculator","Combination Calculator","calculators","C(n, r) — unordered selections from n items.","calculator","combination","combination ncr",0,69],
  ["probability-calculator","Probability Calculator","calculators","Simple probability from favorable and total outcomes.","calculator","probability","probability chance",0,71],
  ["area-calculator","Area Calculator","calculators","Area of rectangles, triangles, circles, and trapezoids.","calculator","area","area square meters",1,90],
  ["volume-calculator","Volume Calculator","calculators","Volume of boxes, cylinders, spheres, cones, and pyramids.","calculator","volume","volume cubic",0,85],
  ["surface-area-calculator","Surface Area Calculator","calculators","Surface area of common 3D solids.","calculator","surface-area","surface area 3d",0,76],
  ["perimeter-calculator","Perimeter Calculator","calculators","Perimeter of rectangles, squares, triangles, and circles.","calculator","perimeter","perimeter circumference",0,77],
  ["circle-calculator","Circle Calculator","calculators","Radius, diameter, circumference, and area from any one value.","calculator","circle","circle radius pi",1,87],
  ["triangle-calculator","Triangle Calculator","calculators","Area from base and height, or Heron's formula from three sides.","calculator","triangle","triangle heron",0,82],
  ["rectangle-calculator","Rectangle Calculator","calculators","Area, perimeter, and diagonal of a rectangle.","calculator","rectangle","rectangle area",0,75],
  ["sphere-calculator","Sphere Calculator","calculators","Volume and surface area of a sphere.","calculator","sphere","sphere volume",0,74],
  ["cylinder-calculator","Cylinder Calculator","calculators","Volume and surface area of a right cylinder.","calculator","cylinder","cylinder volume",0,73],
  ["cone-calculator","Cone Calculator","calculators","Volume and surface area of a cone.","calculator","cone","cone volume",0,70],
  ["cube-calculator","Cube Calculator","calculators","Volume, surface area, and face diagonal of a cube.","calculator","cube","cube volume",0,69],
  ["square-calculator","Square Calculator","calculators","Area, perimeter, and diagonal of a square.","calculator","square","square area",0,65],
  ["pyramid-calculator","Pyramid Calculator","calculators","Volume of a square-base pyramid.","calculator","pyramid","pyramid volume",0,62],
  ["ellipse-calculator","Ellipse Calculator","calculators","Area and approximate perimeter of an ellipse.","calculator","ellipse","ellipse oval",0,60],
  ["loan-calculator","Loan Calculator","calculators","Monthly payment, total interest, and payoff for an amortizing loan.","calculator","loan","loan payment amortize",1,94,"f"],
  ["mortgage-calculator","Mortgage Calculator","calculators","Estimate monthly mortgage payment from price, rate, term, and down payment.","calculator","mortgage","mortgage home loan",1,96,"f"],
  ["interest-calculator","Interest Calculator","calculators","Simple or compound interest on a principal.","calculator","interest","interest rate",0,83,"f"],
  ["compound-interest-calculator","Compound Interest Calculator","calculators","Future value with compounding frequency and optional contributions.","calculator","compound-interest","compound interest fv",1,93,"f"],
  ["simple-interest-calculator","Simple Interest Calculator","calculators","Interest = principal × rate × time.","calculator","simple-interest","simple interest",0,78,"f"],
  ["investment-calculator","Investment Calculator","calculators","Project an investment with regular deposits.","calculator","investment","investment future value",0,84,"f"],
  ["roi-calculator","ROI Calculator","calculators","Return on investment as a percentage and multiple.","calculator","roi","roi return investment",1,88,"f"],
  ["profit-calculator","Profit Calculator","calculators","Profit, margin, and markup from cost and selling price.","calculator","profit","profit margin",0,86,"f"],
  ["break-even-calculator","Break-Even Calculator","calculators","Units needed to cover fixed and variable costs.","calculator","break-even","break even units",0,80,"f"],
  ["markup-calculator","Markup Calculator","calculators","Selling price from cost and markup percent.","calculator","markup","markup price",0,79,"f"],
  ["margin-calculator","Margin Calculator","calculators","Gross margin from cost and price.","calculator","margin","gross margin",0,81,"f"],
  ["discount-calculator","Discount Calculator","calculators","Sale price and amount saved from a discount percent.","calculator","discount","discount sale off",1,90,"f"],
  ["tax-calculator","Sales Tax Calculator","calculators","Add or remove sales tax from a price.","calculator","tax","sales tax vat",1,89,"f"],
  ["vat-calculator","VAT Calculator","calculators","Add or extract VAT at a chosen rate.","calculator","vat","vat gst",0,82,"f"],
  ["tip-calculator","Tip Calculator","calculators","Split a bill with tip among any number of people.","calculator","tip","tip gratuity split bill",1,97],
  ["cagr-calculator","CAGR Calculator","calculators","Compound annual growth rate between two values.","calculator","cagr","cagr growth",0,77,"f"],
  ["inflation-calculator","Inflation Calculator","calculators","Estimate purchasing power change at an annual inflation rate.","calculator","inflation","inflation cpi",0,74,"f"],
  ["concrete-calculator","Concrete Calculator","calculators","Cubic volume of a slab, and bags needed.","calculator","concrete","concrete slab bags",0,80],
  ["brick-calculator","Brick Calculator","calculators","Bricks needed for a wall, including waste.","calculator","brick","brick wall masonry",0,76],
  ["tile-calculator","Tile Calculator","calculators","Tiles needed for a floor or wall with waste factor.","calculator","tile","tile flooring",0,78],
  ["paint-calculator","Paint Calculator","calculators","Litres or gallons of paint from wall area and coats.","calculator","paint","paint coverage litres",0,82],
  ["flooring-calculator","Flooring Calculator","calculators","Material needed for a room with waste.","calculator","flooring","flooring laminate",0,75],
  ["roofing-calculator","Roofing Calculator","calculators","Roof squares and material from plan dimensions and pitch.","calculator","roofing","roof squares shingles",0,70],
  ["lumber-calculator","Lumber Calculator","calculators","Board feet from thickness, width, length, and count.","calculator","lumber","board feet wood",0,68],
  ["ohms-law-calculator","Ohm's Law Calculator","calculators","Solve for voltage, current, resistance, or power.","calculator","ohms-law","ohm voltage current",1,85],
  ["voltage-calculator","Voltage Calculator","calculators","Voltage from current and resistance (V = IR).","calculator","voltage","voltage volt",0,72],
  ["current-calculator","Current Calculator","calculators","Current from voltage and resistance.","calculator","current","current ampere",0,70],
  ["resistance-calculator","Resistance Calculator","calculators","Resistance from voltage and current.","calculator","resistance","resistance ohm",0,69],
  ["power-calculator","Electrical Power Calculator","calculators","Watts from voltage and current, or from energy and time.","calculator","power-elec","watt power electrical",0,74],
  ["speed-calculator","Speed Calculator","calculators","Speed from distance and time, in metric or imperial units.","calculator","speed","speed velocity",1,84],
  ["distance-calculator","Distance Calculator","calculators","Distance from speed and time.","calculator","distance","distance travel",0,76],
  ["acceleration-calculator","Acceleration Calculator","calculators","Acceleration from change in velocity and time.","calculator","acceleration","acceleration physics",0,68],
  ["force-calculator","Force Calculator","calculators","Force = mass × acceleration (newtons).","calculator","force","force newton",0,70],
  ["pressure-calculator","Pressure Calculator","calculators","Pressure from force and area.","calculator","pressure","pressure pascal",0,67],
  ["density-calculator","Density Calculator","calculators","Density from mass and volume.","calculator","density","density mass volume",0,66],
  ["kinetic-energy-calculator","Kinetic Energy Calculator","calculators","½mv² for a moving object.","calculator","kinetic-energy","kinetic energy joule",0,65],
  ["potential-energy-calculator","Potential Energy Calculator","calculators","Gravitational potential energy mgh.","calculator","potential-energy","potential energy",0,63],
  ["work-calculator","Work Calculator","calculators","Work from force and distance.","calculator","work","work joule physics",0,60],
]);

add([
  ["physics-newtons-second-law","Newton’s Second Law Calculator","calculators","Calculate force from mass and acceleration.","calculator","physics-newtons-second-law","physics force mass acceleration newton",0,78],
  ["physics-weight-force","Weight Force Calculator","calculators","Calculate gravitational weight from mass and local gravity.","calculator","physics-weight-force","physics weight gravity mass",0,76],
  ["physics-momentum","Momentum Calculator","calculators","Calculate linear momentum from mass and velocity.","calculator","physics-momentum","physics momentum mass velocity",0,75],
  ["physics-impulse","Impulse Calculator","calculators","Calculate impulse from force and time interval.","calculator","physics-impulse","physics impulse force time",0,72],
  ["physics-centripetal-force","Centripetal Force Calculator","calculators","Calculate centripetal force for circular motion.","calculator","physics-centripetal-force","physics centripetal circular force",0,73],
  ["physics-centripetal-acceleration","Centripetal Acceleration Calculator","calculators","Calculate inward acceleration in circular motion.","calculator","physics-centripetal-acceleration","physics centripetal acceleration",0,70],
  ["physics-torque","Torque Calculator","calculators","Calculate torque from force, lever arm, and angle.","calculator","physics-torque","physics torque moment lever",0,77],
  ["physics-angular-momentum","Angular Momentum Calculator","calculators","Calculate angular momentum from inertia and angular velocity.","calculator","physics-angular-momentum","physics angular momentum",0,68],
  ["physics-rotational-kinetic-energy","Rotational Kinetic Energy Calculator","calculators","Calculate rotational kinetic energy.","calculator","physics-rotational-kinetic-energy","physics rotational energy",0,67],
  ["physics-work-angle","Work with Angle Calculator","calculators","Calculate mechanical work for a force applied at an angle.","calculator","physics-work-angle","physics work angle force",0,71],
  ["physics-power","Physics Power Calculator","calculators","Calculate power from work or energy over time.","calculator","physics-power","physics power work time",0,72],
  ["physics-efficiency","Physics Efficiency Calculator","calculators","Calculate efficiency from useful output and input energy.","calculator","physics-efficiency","physics efficiency energy",0,70],
  ["physics-spring-force","Spring Force Calculator","calculators","Calculate spring force using Hooke’s law.","calculator","physics-spring-force","physics spring hooke force",0,68],
  ["physics-spring-energy","Spring Potential Energy Calculator","calculators","Calculate elastic potential energy stored in a spring.","calculator","physics-spring-energy","physics spring energy",0,65],
  ["physics-gravitational-force","Universal Gravitation Calculator","calculators","Calculate gravitational attraction between two masses.","calculator","physics-gravitational-force","physics gravity gravitation",0,73],
  ["physics-escape-velocity","Escape Velocity Calculator","calculators","Calculate escape velocity from mass and radius.","calculator","physics-escape-velocity","physics escape velocity",0,69],
  ["physics-orbital-speed","Orbital Speed Calculator","calculators","Calculate circular orbital speed around a central body.","calculator","physics-orbital-speed","physics orbital speed",0,67],
  ["physics-density","Physics Density Calculator","calculators","Calculate density from mass and volume.","calculator","physics-density","physics density mass volume",0,70],
  ["physics-pressure","Physics Pressure Calculator","calculators","Calculate pressure from force and area.","calculator","physics-pressure","physics pressure force area",0,72],
  ["physics-hydrostatic-pressure","Hydrostatic Pressure Calculator","calculators","Calculate fluid pressure due to depth.","calculator","physics-hydrostatic-pressure","physics hydrostatic fluid pressure",0,68],
  ["physics-buoyant-force","Buoyant Force Calculator","calculators","Calculate buoyant force using Archimedes’ principle.","calculator","physics-buoyant-force","physics buoyancy archimedes",0,66],
  ["physics-kinematic-final-velocity","Kinematic Final Velocity Calculator","calculators","Calculate final velocity from initial velocity, acceleration, and time.","calculator","physics-kinematic-final-velocity","physics kinematics velocity",0,74],
  ["physics-kinematic-displacement","Kinematic Displacement Calculator","calculators","Calculate displacement under constant acceleration.","calculator","physics-kinematic-displacement","physics kinematics displacement",0,74],
  ["physics-kinematic-distance-velocity","Average-Velocity Displacement Calculator","calculators","Calculate displacement from initial and final velocity and time.","calculator","physics-kinematic-distance-velocity","physics kinematics average velocity",0,68],
  ["physics-free-fall-time","Free-Fall Time Calculator","calculators","Calculate ideal free-fall time from height.","calculator","physics-free-fall-time","physics free fall time",0,72],
  ["physics-free-fall-impact-speed","Free-Fall Impact Speed Calculator","calculators","Calculate ideal impact speed after falling from a height.","calculator","physics-free-fall-impact-speed","physics free fall impact speed",0,70],
  ["physics-wave-speed","Wave Speed Calculator","calculators","Calculate wave speed from frequency and wavelength.","calculator","physics-wave-speed","physics wave speed frequency wavelength",0,72],
  ["physics-frequency-period","Frequency from Period Calculator","calculators","Calculate frequency from wave period.","calculator","physics-frequency-period","physics frequency period",0,68],
  ["physics-photon-energy","Photon Energy Calculator","calculators","Calculate photon energy from frequency and Planck’s constant.","calculator","physics-photon-energy","physics photon energy planck",0,64],
  ["thermal-heat-energy","Heat Energy Calculator","calculators","Calculate heat energy from mass, specific heat, and temperature change.","calculator","thermal-heat-energy","thermal heat energy physics",0,70],
  ["thermal-latent-heat","Latent Heat Calculator","calculators","Calculate energy required for a phase change.","calculator","thermal-latent-heat","thermal latent heat phase",0,64],
  ["thermal-heat-transfer-rate","Heat Conduction Rate Calculator","calculators","Calculate one-dimensional conduction heat-transfer rate.","calculator","thermal-heat-transfer-rate","thermal conduction heat transfer",0,62],
  ["fluid-flow-rate","Volumetric Flow Rate Calculator","calculators","Calculate volumetric flow from area and velocity.","calculator","fluid-flow-rate","fluid flow rate pipe",0,69],
  ["fluid-dynamic-pressure","Dynamic Pressure Calculator","calculators","Calculate dynamic pressure from fluid density and velocity.","calculator","fluid-dynamic-pressure","fluid dynamic pressure",0,65],
  ["fluid-reynolds-number","Reynolds Number Calculator","calculators","Calculate Reynolds number for fluid-flow analysis.","calculator","fluid-reynolds-number","fluid reynolds number",0,67],
  ["materials-stress","Stress Calculator","calculators","Calculate normal stress from force and area.","calculator","materials-stress","materials stress engineering",0,71],
  ["materials-strain","Strain Calculator","calculators","Calculate engineering strain from change and original length.","calculator","materials-strain","materials strain engineering",0,69],
  ["materials-youngs-modulus","Young’s Modulus Calculator","calculators","Calculate Young’s modulus from stress and strain.","calculator","materials-youngs-modulus","materials young modulus engineering",0,67],
  ["materials-shear-stress","Shear Stress Calculator","calculators","Calculate average shear stress from force and area.","calculator","materials-shear-stress","materials shear stress engineering",0,66],
  ["materials-bulk-modulus","Bulk Modulus Calculator","calculators","Calculate bulk modulus from pressure change and volumetric strain.","calculator","materials-bulk-modulus","materials bulk modulus engineering",0,61],
  ["mechanical-power-torque-rpm","Mechanical Power from Torque & RPM","calculators","Calculate shaft power from torque and rotational speed.","calculator","mechanical-power-torque-rpm","mechanical power torque rpm",0,76],
  ["mechanical-rpm-from-speed","RPM from Vehicle Speed Calculator","calculators","Calculate wheel RPM from linear speed and wheel diameter.","calculator","mechanical-rpm-from-speed","mechanical rpm speed wheel",0,71],
  ["mechanical-belt-speed","Belt Speed Calculator","calculators","Calculate belt speed from pulley diameter and RPM.","calculator","mechanical-belt-speed","mechanical belt pulley speed",0,69],
  ["mechanical-gear-ratio","Gear Ratio Calculator","calculators","Calculate gear ratio from driver and driven tooth counts.","calculator","mechanical-gear-ratio","mechanical gear ratio teeth",0,78],
  ["mechanical-output-rpm","Gear Output RPM Calculator","calculators","Calculate output RPM for a simple gear pair.","calculator","mechanical-output-rpm","mechanical gear rpm",0,72],
  ["mechanical-shaft-torsional-stress","Shaft Torsional Stress Calculator","calculators","Calculate torsional shear stress for a circular shaft section.","calculator","mechanical-shaft-torsional-stress","mechanical shaft torsion stress",0,68],
  ["mechanical-bending-stress","Beam Bending Stress Calculator","calculators","Calculate bending stress using moment, fiber distance, and second moment.","calculator","mechanical-bending-stress","mechanical beam bending stress",0,73],
  ["mechanical-beam-deflection-cantilever","Cantilever Beam Deflection Calculator","calculators","Calculate end deflection for a simple cantilever with an end load.","calculator","mechanical-beam-deflection-cantilever","mechanical cantilever beam deflection",0,75],
  ["mechanical-safety-factor","Mechanical Safety Factor Calculator","calculators","Calculate factor of safety from strength and applied stress.","calculator","mechanical-safety-factor","mechanical safety factor engineering",0,78],
  ["mechanical-pressure-force","Pressure-to-Force Calculator","calculators","Calculate force produced by pressure over an area.","calculator","mechanical-pressure-force","mechanical pressure force",0,70],
  ["mechanical-hydraulic-force","Hydraulic Force Calculator","calculators","Calculate output force from hydraulic piston areas.","calculator","mechanical-hydraulic-force","mechanical hydraulic force piston",0,74],
  ["mechanical-hydraulic-pressure","Hydraulic Pressure Calculator","calculators","Calculate hydraulic pressure from force and piston area.","calculator","mechanical-hydraulic-pressure","mechanical hydraulic pressure",0,70],
  ["mechanical-pump-hydraulic-power","Hydraulic Pump Power Calculator","calculators","Estimate hydraulic pump input power from flow, head, and efficiency.","calculator","mechanical-pump-hydraulic-power","mechanical pump hydraulic power",0,72],
  ["mechanical-flywheel-energy","Flywheel Energy Calculator","calculators","Calculate rotational energy stored in a flywheel.","calculator","mechanical-flywheel-energy","mechanical flywheel energy",0,64],
  ["mechanical-spring-rate","Spring Rate Calculator","calculators","Calculate spring rate from force and deflection.","calculator","mechanical-spring-rate","mechanical spring rate",0,67],
  ["mechanical-power-to-horsepower","Power to Horsepower Calculator","calculators","Convert mechanical power in watts to mechanical horsepower.","calculator","mechanical-power-to-horsepower","mechanical horsepower power",0,68],
  ["mechanical-horsepower-to-power","Horsepower to Power Calculator","calculators","Convert mechanical horsepower to watts.","calculator","mechanical-horsepower-to-power","mechanical horsepower watts",0,67],
  ["electrical-ohms-law","Ohm’s Law Calculator — General","calculators","Solve for voltage, current, or resistance from any two known values.","calculator","electrical-ohms-law","electrical ohms law voltage current resistance",0,80],
  ["electrical-series-resistance","Series Resistance Calculator","calculators","Calculate equivalent resistance for resistors in series.","calculator","electrical-series-resistance","electrical resistance series",0,72],
  ["electrical-parallel-resistance","Parallel Resistance Calculator","calculators","Calculate equivalent resistance for resistors in parallel.","calculator","electrical-parallel-resistance","electrical resistance parallel",0,73],
  ["electrical-power-v-i","Electrical Power from Voltage & Current","calculators","Calculate electrical power from voltage and current.","calculator","electrical-power-v-i","electrical power voltage current",0,72],
  ["electrical-energy-kwh","Electrical Energy Calculator","calculators","Calculate electrical energy in kWh from power and operating time.","calculator","electrical-energy-kwh","electrical energy kwh",0,71],
  ["electrical-capacitor-energy","Capacitor Energy Calculator","calculators","Calculate energy stored in a capacitor.","calculator","electrical-capacitor-energy","electrical capacitor energy",0,65],
  ["electrical-capacitive-reactance","Capacitive Reactance Calculator","calculators","Calculate capacitive reactance from frequency and capacitance.","calculator","electrical-capacitive-reactance","electrical capacitor reactance",0,64],
  ["electrical-inductive-reactance","Inductive Reactance Calculator","calculators","Calculate inductive reactance from frequency and inductance.","calculator","electrical-inductive-reactance","electrical inductor reactance",0,64],
  ["electrical-frequency-period","Electrical Frequency from Period","calculators","Calculate frequency from signal period.","calculator","electrical-frequency-period","electrical frequency period",0,65],
  ["electrical-three-phase-power","Three-Phase Power Calculator","calculators","Calculate real three-phase power from line voltage, current, and power factor.","calculator","electrical-three-phase-power","electrical three phase power",0,72],
  ["electrical-voltage-divider","Voltage Divider Calculator","calculators","Calculate divider output voltage from two resistors.","calculator","electrical-voltage-divider","electrical voltage divider resistor",0,75],
  ["engineering-rectangle-second-moment","Rectangle Second Moment of Area","calculators","Calculate Ix and Iy for a rectangular section.","calculator","engineering-rectangle-second-moment","engineering second moment rectangle",0,67],
  ["engineering-solid-circle-inertia","Solid Circular Section Inertia","calculators","Calculate area, second moment, and polar moment for a solid circle.","calculator","engineering-solid-circle-inertia","engineering inertia circle section",0,64],
  ["engineering-hollow-circle-inertia","Hollow Circular Section Inertia","calculators","Calculate second and polar moments for a hollow circular section.","calculator","engineering-hollow-circle-inertia","engineering pipe inertia section",0,64],
  ["engineering-trapezoid-area","Trapezoid Area Calculator","calculators","Calculate area from two parallel sides and height.","calculator","engineering-trapezoid-area","engineering geometry trapezoid",0,66],
  ["engineering-circle-area","Engineering Circle Geometry Calculator","calculators","Calculate circle area and circumference.","calculator","engineering-circle-area","engineering circle geometry",0,66],
  ["engineering-pipe-flow-area","Pipe Flow Area Calculator","calculators","Calculate internal flow area from pipe diameter.","calculator","engineering-pipe-flow-area","engineering pipe flow area",0,62],
]);

add([
  ["math-quadratic-roots-general","Math Quadratic Roots General","calculators","Math Quadratic Roots General using a validated engineering or mathematics formula.","calculator","math-quadratic-roots-general","math quadratic roots general formula engineering math physics",0,65],
  ["math-arithmetic-sequence","Math Arithmetic Sequence","calculators","Math Arithmetic Sequence using a validated engineering or mathematics formula.","calculator","math-arithmetic-sequence","math arithmetic sequence formula engineering math physics",0,65],
  ["math-geometric-sequence","Math Geometric Sequence","calculators","Math Geometric Sequence using a validated engineering or mathematics formula.","calculator","math-geometric-sequence","math geometric sequence formula engineering math physics",0,65],
  ["calculus-derivative-power","Calculus Derivative Power","calculators","Calculus Derivative Power using a validated engineering or mathematics formula.","calculator","calculus-derivative-power","calculus derivative power formula engineering math physics",0,65],
  ["calculus-integral-power","Calculus Integral Power","calculators","Calculus Integral Power using a validated engineering or mathematics formula.","calculator","calculus-integral-power","calculus integral power formula engineering math physics",0,65],
  ["calculus-definite-power-integral","Calculus Definite Power Integral","calculators","Calculus Definite Power Integral using a validated engineering or mathematics formula.","calculator","calculus-definite-power-integral","calculus definite power integral formula engineering math physics",0,65],
  ["calculus-exponential-growth","Calculus Exponential Growth","calculators","Calculus Exponential Growth using a validated engineering or mathematics formula.","calculator","calculus-exponential-growth","calculus exponential growth formula engineering math physics",0,65],
  ["calculus-logistic-growth","Calculus Logistic Growth","calculators","Calculus Logistic Growth using a validated engineering or mathematics formula.","calculator","calculus-logistic-growth","calculus logistic growth formula engineering math physics",0,65],
  ["statistics-z-score","Statistics Z Score","calculators","Statistics Z Score using a validated engineering or mathematics formula.","calculator","statistics-z-score","statistics z score formula engineering math physics",0,65],
  ["statistics-coefficient-variation","Statistics Coefficient Variation","calculators","Statistics Coefficient Variation using a validated engineering or mathematics formula.","calculator","statistics-coefficient-variation","statistics coefficient variation formula engineering math physics",0,65],
  ["statistics-weighted-mean-two","Statistics Weighted Mean Two","calculators","Statistics Weighted Mean Two using a validated engineering or mathematics formula.","calculator","statistics-weighted-mean-two","statistics weighted mean two formula engineering math physics",0,65],
  ["statistics-binomial-probability","Statistics Binomial Probability","calculators","Statistics Binomial Probability using a validated engineering or mathematics formula.","calculator","statistics-binomial-probability","statistics binomial probability formula engineering math physics",0,65],
  ["statistics-normal-density","Statistics Normal Density","calculators","Statistics Normal Density using a validated engineering or mathematics formula.","calculator","statistics-normal-density","statistics normal density formula engineering math physics",0,65],
  ["physics-projectile-range","Physics Projectile Range","calculators","Physics Projectile Range using a validated engineering or mathematics formula.","calculator","physics-projectile-range","physics projectile range formula engineering math physics",0,65],
  ["physics-projectile-height","Physics Projectile Height","calculators","Physics Projectile Height using a validated engineering or mathematics formula.","calculator","physics-projectile-height","physics projectile height formula engineering math physics",0,65],
  ["physics-projectile-time","Physics Projectile Time","calculators","Physics Projectile Time using a validated engineering or mathematics formula.","calculator","physics-projectile-time","physics projectile time formula engineering math physics",0,65],
  ["physics-angular-acceleration","Physics Angular Acceleration","calculators","Physics Angular Acceleration using a validated engineering or mathematics formula.","calculator","physics-angular-acceleration","physics angular acceleration formula engineering math physics",0,65],
  ["physics-rotational-kinematics","Physics Rotational Kinematics","calculators","Physics Rotational Kinematics using a validated engineering or mathematics formula.","calculator","physics-rotational-kinematics","physics rotational kinematics formula engineering math physics",0,65],
  ["physics-kinetic-energy","Physics Kinetic Energy","calculators","Physics Kinetic Energy using a validated engineering or mathematics formula.","calculator","physics-kinetic-energy","physics kinetic energy formula engineering math physics",0,65],
  ["physics-potential-energy","Physics Potential Energy","calculators","Physics Potential Energy using a validated engineering or mathematics formula.","calculator","physics-potential-energy","physics potential energy formula engineering math physics",0,65],
  ["physics-mechanical-energy","Physics Mechanical Energy","calculators","Physics Mechanical Energy using a validated engineering or mathematics formula.","calculator","physics-mechanical-energy","physics mechanical energy formula engineering math physics",0,65],
  ["physics-coefficient-friction","Physics Coefficient Friction","calculators","Physics Coefficient Friction using a validated engineering or mathematics formula.","calculator","physics-coefficient-friction","physics coefficient friction formula engineering math physics",0,65],
  ["physics-sound-level","Physics Sound Level","calculators","Physics Sound Level using a validated engineering or mathematics formula.","calculator","physics-sound-level","physics sound level formula engineering math physics",0,65],
  ["physics-relativistic-energy","Physics Relativistic Energy","calculators","Physics Relativistic Energy using a validated engineering or mathematics formula.","calculator","physics-relativistic-energy","physics relativistic energy formula engineering math physics",0,65],
  ["physics-relativistic-gamma","Physics Relativistic Gamma","calculators","Physics Relativistic Gamma using a validated engineering or mathematics formula.","calculator","physics-relativistic-gamma","physics relativistic gamma formula engineering math physics",0,65],
  ["fluid-bernoulli-pressure","Fluid Bernoulli Pressure","calculators","Fluid Bernoulli Pressure using a validated engineering or mathematics formula.","calculator","fluid-bernoulli-pressure","fluid bernoulli pressure formula engineering math physics",0,65],
  ["fluid-hydraulic-diameter","Fluid Hydraulic Diameter","calculators","Fluid Hydraulic Diameter using a validated engineering or mathematics formula.","calculator","fluid-hydraulic-diameter","fluid hydraulic diameter formula engineering math physics",0,65],
  ["fluid-darcy-pressure-drop","Fluid Darcy Pressure Drop","calculators","Fluid Darcy Pressure Drop using a validated engineering or mathematics formula.","calculator","fluid-darcy-pressure-drop","fluid darcy pressure drop formula engineering math physics",0,65],
  ["thermal-newton-cooling-rate","Thermal Newton Cooling Rate","calculators","Thermal Newton Cooling Rate using a validated engineering or mathematics formula.","calculator","thermal-newton-cooling-rate","thermal newton cooling rate formula engineering math physics",0,65],
  ["thermal-radiation-power","Thermal Radiation Power","calculators","Thermal Radiation Power using a validated engineering or mathematics formula.","calculator","thermal-radiation-power","thermal radiation power formula engineering math physics",0,65],
  ["thermal-ideal-gas-pressure","Thermal Ideal Gas Pressure","calculators","Thermal Ideal Gas Pressure using a validated engineering or mathematics formula.","calculator","thermal-ideal-gas-pressure","thermal ideal gas pressure formula engineering math physics",0,65],
  ["thermal-ideal-gas-volume","Thermal Ideal Gas Volume","calculators","Thermal Ideal Gas Volume using a validated engineering or mathematics formula.","calculator","thermal-ideal-gas-volume","thermal ideal gas volume formula engineering math physics",0,65],
  ["thermal-carnot-efficiency","Thermal Carnot Efficiency","calculators","Thermal Carnot Efficiency using a validated engineering or mathematics formula.","calculator","thermal-carnot-efficiency","thermal carnot efficiency formula engineering math physics",0,65],
  ["thermal-cop-refrigerator","Thermal Cop Refrigerator","calculators","Thermal Cop Refrigerator using a validated engineering or mathematics formula.","calculator","thermal-cop-refrigerator","thermal cop refrigerator formula engineering math physics",0,65],
  ["mechanical-linear-momentum-change","Mechanical Linear Momentum Change","calculators","Mechanical Linear Momentum Change using a validated engineering or mathematics formula.","calculator","mechanical-linear-momentum-change","mechanical linear momentum change formula engineering math physics",0,65],
  ["mechanical-kinetic-friction-force","Mechanical Kinetic Friction Force","calculators","Mechanical Kinetic Friction Force using a validated engineering or mathematics formula.","calculator","mechanical-kinetic-friction-force","mechanical kinetic friction force formula engineering math physics",0,65],
  ["mechanical-pulley-mechanical-advantage","Mechanical Pulley Mechanical Advantage","calculators","Mechanical Pulley Mechanical Advantage using a validated engineering or mathematics formula.","calculator","mechanical-pulley-mechanical-advantage","mechanical pulley mechanical advantage formula engineering math physics",0,65],
  ["mechanical-work-energy-spring","Mechanical Work Energy Spring","calculators","Mechanical Work Energy Spring using a validated engineering or mathematics formula.","calculator","mechanical-work-energy-spring","mechanical work energy spring formula engineering math physics",0,65],
  ["mechanical-bearing-speed-limit","Mechanical Bearing Speed Limit","calculators","Mechanical Bearing Speed Limit using a validated engineering or mathematics formula.","calculator","mechanical-bearing-speed-limit","mechanical bearing speed limit formula engineering math physics",0,65],
  ["mechanical-belt-length-open-drive","Mechanical Belt Length Open Drive","calculators","Mechanical Belt Length Open Drive using a validated engineering or mathematics formula.","calculator","mechanical-belt-length-open-drive","mechanical belt length open drive formula engineering math physics",0,65],
  ["mechanical-pulley-speed-ratio","Mechanical Pulley Speed Ratio","calculators","Mechanical Pulley Speed Ratio using a validated engineering or mathematics formula.","calculator","mechanical-pulley-speed-ratio","mechanical pulley speed ratio formula engineering math physics",0,65],
  ["structures-simply-supported-point-load-reaction","Structures Simply Supported Point Load Reaction","calculators","Structures Simply Supported Point Load Reaction using a validated engineering or mathematics formula.","calculator","structures-simply-supported-point-load-reaction","structures simply supported point load reaction formula engineering math physics",0,65],
  ["structures-simply-supported-point-load-max-moment","Structures Simply Supported Point Load Max Moment","calculators","Structures Simply Supported Point Load Max Moment using a validated engineering or mathematics formula.","calculator","structures-simply-supported-point-load-max-moment","structures simply supported point load max moment formula engineering math physics",0,65],
  ["structures-beam-self-weight-load","Structures Beam Self Weight Load","calculators","Structures Beam Self Weight Load using a validated engineering or mathematics formula.","calculator","structures-beam-self-weight-load","structures beam self weight load formula engineering math physics",0,65],
  ["structures-column-slenderness-ratio","Structures Column Slenderness Ratio","calculators","Structures Column Slenderness Ratio using a validated engineering or mathematics formula.","calculator","structures-column-slenderness-ratio","structures column slenderness ratio formula engineering math physics",0,65],
  ["structures-euler-buckling-load","Structures Euler Buckling Load","calculators","Structures Euler Buckling Load using a validated engineering or mathematics formula.","calculator","structures-euler-buckling-load","structures euler buckling load formula engineering math physics",0,65],
  ["structures-thermal-expansion","Structures Thermal Expansion","calculators","Structures Thermal Expansion using a validated engineering or mathematics formula.","calculator","structures-thermal-expansion","structures thermal expansion formula engineering math physics",0,65],
  ["electrical-resistor-power-v-r","Electrical Resistor Power V R","calculators","Electrical Resistor Power V R using a validated engineering or mathematics formula.","calculator","electrical-resistor-power-v-r","electrical resistor power v r formula engineering math physics",0,65],
  ["electrical-resistor-power-i-r","Electrical Resistor Power I R","calculators","Electrical Resistor Power I R using a validated engineering or mathematics formula.","calculator","electrical-resistor-power-i-r","electrical resistor power i r formula engineering math physics",0,65],
  ["electrical-rc-time-constant","Electrical Rc Time Constant","calculators","Electrical Rc Time Constant using a validated engineering or mathematics formula.","calculator","electrical-rc-time-constant","electrical rc time constant formula engineering math physics",0,65],
  ["electrical-lr-time-constant","Electrical Lr Time Constant","calculators","Electrical Lr Time Constant using a validated engineering or mathematics formula.","calculator","electrical-lr-time-constant","electrical lr time constant formula engineering math physics",0,65],
  ["electrical-resonant-frequency-lc","Electrical Resonant Frequency Lc","calculators","Electrical Resonant Frequency Lc using a validated engineering or mathematics formula.","calculator","electrical-resonant-frequency-lc","electrical resonant frequency lc formula engineering math physics",0,65],
  ["electrical-led-series-resistor","Electrical Led Series Resistor","calculators","Electrical Led Series Resistor using a validated engineering or mathematics formula.","calculator","electrical-led-series-resistor","electrical led series resistor formula engineering math physics",0,65],
  ["electrical-battery-energy","Electrical Battery Energy","calculators","Electrical Battery Energy using a validated engineering or mathematics formula.","calculator","electrical-battery-energy","electrical battery energy formula engineering math physics",0,65],
  ["electrical-wire-voltage-drop","Electrical Wire Voltage Drop","calculators","Electrical Wire Voltage Drop using a validated engineering or mathematics formula.","calculator","electrical-wire-voltage-drop","electrical wire voltage drop formula engineering math physics",0,65],
  ["electrical-three-phase-current","Electrical Three Phase Current","calculators","Electrical Three Phase Current using a validated engineering or mathematics formula.","calculator","electrical-three-phase-current","electrical three phase current formula engineering math physics",0,65],
  ["engineering-rectangle-section-modulus","Engineering Rectangle Section Modulus","calculators","Engineering Rectangle Section Modulus using a validated engineering or mathematics formula.","calculator","engineering-rectangle-section-modulus","engineering rectangle section modulus formula engineering math physics",0,65],
  ["engineering-circle-section-modulus","Engineering Circle Section Modulus","calculators","Engineering Circle Section Modulus using a validated engineering or mathematics formula.","calculator","engineering-circle-section-modulus","engineering circle section modulus formula engineering math physics",0,65],
  ["engineering-hollow-circle-section-modulus","Engineering Hollow Circle Section Modulus","calculators","Engineering Hollow Circle Section Modulus using a validated engineering or mathematics formula.","calculator","engineering-hollow-circle-section-modulus","engineering hollow circle section modulus formula engineering math physics",0,65],
  ["engineering-centroid-two-areas","Engineering Centroid Two Areas","calculators","Engineering Centroid Two Areas using a validated engineering or mathematics formula.","calculator","engineering-centroid-two-areas","engineering centroid two areas formula engineering math physics",0,65],
  ["engineering-thermal-stress","Engineering Thermal Stress","calculators","Engineering Thermal Stress using a validated engineering or mathematics formula.","calculator","engineering-thermal-stress","engineering thermal stress formula engineering math physics",0,65],
  ["engineering-poisson-ratio","Engineering Poisson Ratio","calculators","Engineering Poisson Ratio using a validated engineering or mathematics formula.","calculator","engineering-poisson-ratio","engineering poisson ratio formula engineering math physics",0,65],
  ["engineering-shear-modulus-from-youngs","Engineering Shear Modulus From Youngs","calculators","Engineering Shear Modulus From Youngs using a validated engineering or mathematics formula.","calculator","engineering-shear-modulus-from-youngs","engineering shear modulus from youngs formula engineering math physics",0,65],
  ["engineering-bulk-modulus-from-youngs","Engineering Bulk Modulus From Youngs","calculators","Engineering Bulk Modulus From Youngs using a validated engineering or mathematics formula.","calculator","engineering-bulk-modulus-from-youngs","engineering bulk modulus from youngs formula engineering math physics",0,65],
]);

add([
  ["length-converter","Length Converter","converters","Convert metres, feet, inches, miles, kilometres, and more.","converter","length","length meter feet inch mile km",1,96],
  ["weight-converter","Weight Converter","converters","Convert kilograms, pounds, ounces, stones, and grams.","converter","weight","weight kg lb pound ounce",1,94],
  ["mass-converter","Mass Converter","converters","Convert mass units including tonnes, slugs, and milligrams.","converter","mass","mass tonne slug",0,72],
  ["temperature-converter","Temperature Converter","converters","Convert Celsius, Fahrenheit, and Kelvin.","converter","temperature","celsius fahrenheit kelvin temperature",1,97],
  ["area-converter","Area Converter","converters","Convert m², ft², acres, hectares, and more.","converter","area","area acre hectare square",0,82],
  ["volume-converter","Volume Converter","converters","Litres, gallons, cups, millilitres, cubic metres.","converter","volume","volume litre gallon cup",1,90],
  ["speed-converter","Speed Converter","converters","km/h, mph, m/s, knots, and mach.","converter","speed","speed mph kph knot",0,84],
  ["time-converter","Time Converter","converters","Seconds through millennia, including days and weeks.","converter","time","time second hour day",0,80],
  ["pressure-converter","Pressure Converter","converters","Pascal, bar, psi, atm, torr.","converter","pressure","pressure psi bar atm",0,76],
  ["energy-converter","Energy Converter","converters","Joules, calories, kWh, BTU, eV.","converter","energy","energy joule calorie kwh",0,74],
  ["power-converter","Power Converter","converters","Watts, horsepower, dBm.","converter","power","power watt horsepower",0,73],
  ["force-converter","Force Converter","converters","Newtons, pounds-force, dynes, kgf.","converter","force","force newton lbf",0,68],
  ["frequency-converter","Frequency Converter","converters","Hz, kHz, MHz, GHz, RPM.","converter","frequency","frequency hz rpm",0,70],
  ["storage-converter","Digital Storage Converter","converters","Bytes through pebibytes, SI and binary prefixes.","converter","storage","storage byte kb mb gb tb",1,91],
  ["data-transfer-converter","Data Transfer Converter","converters","bps, Mbps, MB/s and download-time helpers.","converter","data-transfer","bandwidth mbps download",0,77],
  ["angle-converter","Angle Converter","converters","Degrees, radians, gradians, turns.","converter","angle","angle degree radian",0,71],
  ["torque-converter","Torque Converter","converters","N·m, lbf·ft, kgf·m.","converter","torque","torque newton metre",0,62],
  ["fuel-converter","Fuel Economy Converter","converters","L/100km, mpg (US and UK), km/L.","converter","fuel","mpg fuel economy",0,75],
  ["cooking-converter","Cooking Converter","converters","Cups, tablespoons, grams, ounces for kitchen use.","converter","cooking","cooking cup tablespoon recipe",1,88],
  ["shoe-size-converter","Shoe Size Converter","converters","Approximate US, UK, EU, and JP shoe sizes.","converter","shoe","shoe size us uk eu",0,80],
  ["clothing-size-converter","Clothing Size Converter","converters","Approximate letter and numeric clothing sizes.","converter","clothing","clothing size s m l",0,73],
  ["paper-size-converter","Paper Size Converter","converters","ISO A-series, US Letter, Legal, and Tabloid dimensions.","converter","paper","a4 letter paper size",0,78],
  ["dpi-converter","DPI / PPI Converter","converters","Print size from pixels and DPI, or required pixels from print size.","converter","dpi","dpi ppi print pixels",0,74],
  ["number-base-converter","Number Base Converter","converters","Convert between binary, octal, decimal, and hexadecimal.","codec","base-convert","binary hex decimal octal base",1,89],
]);

add([
  ["json-formatter","JSON Formatter","developer","Pretty-print, validate, and minify JSON entirely in your browser.","custom","json-formatter","json format pretty validate minify",1,99,"n"],
  ["json-validator","JSON Validator","developer","Check JSON for syntax errors with a line-accurate message.","custom","json-formatter","json validate lint error",0,90],
  ["json-minifier","JSON Minifier","developer","Remove whitespace from JSON for smaller payloads.","custom","json-formatter","json minify compress",0,82],
  ["json-beautifier","JSON Beautifier","developer","Indent JSON with 2 or 4 spaces.","custom","json-formatter","json beautify pretty",0,84],
  ["jwt-decoder","JWT Decoder","developer","Decode a JSON Web Token header and payload without verifying a signature.","custom","jwt-decoder","jwt decode token bearer",1,94],
  ["jwt-expiration-checker","JWT Expiration Checker","developer","See whether a JWT is expired from its exp claim.","custom","jwt-decoder","jwt exp expired",0,78],
  ["base64-encoder","Base64 Encoder","developer","Encode text to Base64 locally in your browser.","codec","base64-encode","base64 encode",1,93],
  ["base64-decoder","Base64 Decoder","developer","Decode Base64 text to Unicode text locally in your browser.","codec","base64-decode","base64 decode",1,92],
  ["url-encoder","URL Encoder","developer","Percent-encode a string for use in URLs.","codec","url-encode","url encode percent",0,86],
  ["url-decoder","URL Decoder","developer","Decode a percent-encoded URL string.","codec","url-decode","url decode query",0,85],
  ["html-encoder","HTML Encoder","developer","Escape characters to HTML entities.","codec","html-encode","html entities escape",0,80],
  ["html-decoder","HTML Decoder","developer","Decode HTML entities back to text.","codec","html-decode","html entities unescape",0,79],
  ["unicode-converter","Unicode Converter","developer","Inspect code points, UTF-8 bytes, and escapes.","codec","unicode","unicode codepoint utf8",0,74],
  ["ascii-converter","ASCII Converter","developer","Convert text to ASCII codes and back.","codec","ascii","ascii code",0,72],
  ["binary-converter","Binary Converter","developer","Convert text or numbers to binary.","codec","binary","binary bits",0,77],
  ["hex-converter","Hex Converter","developer","Convert text or bytes to hexadecimal.","codec","hex","hex hexadecimal",0,81],
  ["uuid-generator","UUID Generator","developer","Generate UUID v4 identifiers locally.","custom","uuid-generator","uuid guid v4 generate",1,95],
  ["uuid-validator","UUID Validator","developer","Check whether a string is a valid UUID and which version.","custom","uuid-generator","uuid validate",0,73],
  ["md5-hash","MD5 Hash Generator","developer","MD5 digest of text (not for passwords).","codec","md5","md5 hash checksum",0,83],
  ["sha1-hash","SHA-1 Hash Generator","developer","SHA-1 digest using Web Crypto.","codec","sha1","sha1 hash",0,76],
  ["sha256-hash","SHA-256 Hash Generator","developer","SHA-256 digest using Web Crypto.","codec","sha256","sha256 hash checksum",1,90],
  ["sha512-hash","SHA-512 Hash Generator","developer","SHA-512 digest using Web Crypto.","codec","sha512","sha512 hash",0,78],
  ["hash-compare","Hash Compare","developer","Compare two hashes in constant-looking time.","codec","hash-compare","hash compare equal",0,68],
  ["file-hash-calculator","File Hash Calculator","developer","SHA-256 of a local file, computed in the browser.","custom","file-hash","file hash sha256 checksum",1,88],
  ["regex-tester","Regex Tester","developer","Test a JavaScript regular expression against sample text and list matches.","custom","regex-tester","regex test match javascript",1,96],
  ["regex-replace","Regex Replace","developer","Find and replace with a JavaScript regular expression.","custom","regex-tester","regex replace substitute",0,80],
  ["sql-formatter","SQL Formatter","developer","Light SQL pretty-printer for SELECT/INSERT-style statements.","text","sql-format","sql format pretty",0,82],
  ["html-formatter","HTML Formatter","developer","Indent HTML-like markup.","text","html-format","html format pretty",0,79],
  ["css-formatter","CSS Formatter","developer","Pretty-print CSS rules.","text","css-format","css format pretty",0,78],
  ["javascript-formatter","JavaScript Formatter","developer","Indent JavaScript-like source (not a full parser).","text","js-format","javascript format pretty",0,80],
  ["xml-formatter","XML Formatter","developer","Indent XML documents.","text","xml-format","xml format pretty",0,75],
  ["yaml-formatter","YAML Formatter","developer","Normalize YAML-like indentation.","text","yaml-format","yaml format",0,72],
  ["markdown-preview","Markdown Preview","developer","Preview GitHub-flavored-ish markdown locally.","custom","markdown-preview","markdown preview md gfm",1,91],
  ["markdown-to-html","Markdown to HTML","developer","Convert markdown to HTML in the browser.","custom","markdown-preview","markdown html convert",0,77],
  ["html-minifier","HTML Minifier","developer","Strip comments and extra whitespace from HTML.","text","html-minify","html minify",0,70],
  ["css-minifier","CSS Minifier","developer","Minify CSS by removing comments and whitespace.","text","css-minify","css minify",0,73],
  ["javascript-minifier","JavaScript Minifier","developer","Whitespace minifier for JS (not a full compiler).","text","js-minify","javascript minify",0,71],
  ["cron-generator","Cron Expression Normalizer","developer","Validate and normalize a 5-field cron expression.","custom","cron-generator","cron schedule quartz",1,87],
  ["cron-parser","Cron Parser","developer","Explain a cron expression in plain language.","custom","cron-generator","cron parse explain",0,80],
  ["unix-timestamp-converter","Unix Timestamp Converter","developer","Convert between Unix time and human-readable dates.","datetime","unix","unix epoch timestamp",1,92],
  ["http-status-lookup","HTTP Status Lookup","developer","Look up HTTP status codes and what they mean.","custom","http-status","http status 404 500",1,85],
  ["user-agent-parser","User-Agent Parser","developer","Parse a user-agent string into browser, OS, and device hints.","custom","user-agent","user-agent ua browser",0,76],
  ["url-parser","URL Parser","developer","Split a URL into protocol, host, path, query, and hash.","custom","url-parser","url parse query",0,84],
  ["query-string-parser","Query String Parser","developer","Parse and build URL query strings.","custom","url-parser","query string params",0,78],
  ["mime-lookup","MIME Type Lookup","developer","Look up MIME types by extension and the reverse.","mime","lookup","mime content-type extension",0,77],
  ["data-uri-generator","Data URI Generator","developer","Turn text into a data: URI locally in your browser.","custom","data-uri","data uri base64",0,74],
  ["lorem-ipsum-generator","Lorem Ipsum Generator","developer","Generate placeholder paragraphs, sentences, or words.","generator","lorem","lorem ipsum placeholder",1,90],
  ["dummy-json-generator","Dummy JSON Generator","developer","Generate sample JSON objects for API mocking.","generator","dummy-json","dummy json fake api",1,86],
  ["css-minifier-advanced","JSON to CSV","files","Convert a JSON array of objects to CSV.","text","json-to-csv","json csv convert",0,80],
]);

add([
  ["word-counter","Word Counter","text","Live word, character, sentence, and paragraph counts.","custom","word-counter","word count characters reading time",1,98,"n"],
  ["character-counter","Character Counter","text","Count characters with and without spaces.","custom","word-counter","character count limit twitter",1,90],
  ["sentence-counter","Sentence Counter","text","Count sentences in a passage.","custom","word-counter","sentence count",0,70],
  ["paragraph-counter","Paragraph Counter","text","Count paragraphs in a passage.","custom","word-counter","paragraph count",0,68],
  ["reading-time-calculator","Reading Time Calculator","text","Estimate reading time from word count.","custom","word-counter","reading time wpm",1,84],
  ["uppercase-converter","Uppercase Converter","text","Convert text to UPPERCASE.","text","uppercase","uppercase caps",0,80],
  ["lowercase-converter","Lowercase Converter","text","Convert text to lowercase.","text","lowercase","lowercase small",0,79],
  ["title-case-converter","Title Case Converter","text","Convert text to Title Case.","text","title-case","title case headline",0,83],
  ["sentence-case-converter","Sentence Case Converter","text","Convert text to Sentence case.","text","sentence-case","sentence case",0,74],
  ["camel-case-converter","Camel Case Converter","text","Convert phrases to camelCase.","text","camel-case","camelCase",0,76],
  ["snake-case-converter","Snake Case Converter","text","Convert phrases to snake_case.","text","snake-case","snake_case",0,75],
  ["kebab-case-converter","Kebab Case Converter","text","Convert phrases to kebab-case.","text","kebab-case","kebab-case slug",0,77],
  ["remove-duplicate-lines","Remove Duplicate Lines","text","Drop duplicate lines, optionally keeping order.","text","dedupe-lines","duplicate lines unique",0,81],
  ["sort-lines","Sort Lines","text","Sort lines A–Z or Z–A, optionally unique.","text","sort-lines","sort alphabetize",0,78],
  ["reverse-text","Reverse Text","text","Reverse characters or lines.","text","reverse","reverse backwards",0,70],
  ["remove-spaces","Remove Extra Spaces","text","Collapse repeated whitespace.","text","trim-spaces","spaces trim whitespace",0,73],
  ["remove-line-breaks","Remove Line Breaks","text","Join wrapped lines into a single paragraph.","text","unwrap","line breaks unwrap",0,72],
  ["find-and-replace","Find and Replace","text","Replace all occurrences of a phrase, optionally case-insensitive.","text","find-replace","find replace substitute",1,85],
  ["text-diff","Text Diff","text","Compare two texts and highlight added and removed lines.","custom","text-diff","diff compare changes",1,88],
  ["slug-generator","Slug Generator","text","Turn a title into a URL-safe slug.","text","slug","slug url permalink",1,87],
  ["list-generator","List Generator","text","Split, number, or bullet a list.","text","list","list bullets numbered",0,71],
  ["word-frequency","Word Frequency","text","Count how often each word appears.","text","word-freq","frequency words",0,74],
  ["extract-emails","Extract Emails","text","Pull email addresses out of a block of text.","text","extract-emails","extract email",0,76],
  ["extract-urls","Extract URLs","text","Pull http(s) URLs out of a block of text.","text","extract-urls","extract url links",0,75],
  ["wrap-text","Wrap Text","text","Hard-wrap text to a column width.","text","wrap","wrap columns",0,66],
]);

add([
  ["image-compressor","Image Compressor","image","Compress JPEG, PNG, or WebP in the browser to a target quality.","image","compress","compress image size jpg",1,99,"n"],
  ["image-resizer","Image Resizer","image","Resize an image to exact pixels or a percentage.","image","resize","resize image scale dimensions",1,97],
  ["image-cropper","Image Cropper","image","Crop an image to a custom rectangle or aspect ratio.","image","crop","crop image",1,90],
  ["image-rotator","Image Rotator","image","Rotate 90°, 180°, 270°, or a custom angle.","image","rotate","rotate image",0,82],
  ["image-flipper","Image Flipper","image","Flip an image horizontally or vertically.","image","flip","flip mirror image",0,76],
  ["jpg-converter","JPG Converter","image","Convert PNG, WebP, or other bitmaps to JPEG.","image","to-jpeg","jpg jpeg convert",1,88],
  ["png-converter","PNG Converter","image","Convert images to PNG.","image","to-png","png convert",0,85],
  ["webp-converter","WebP Converter","image","Convert images to WebP where the browser supports it.","image","to-webp","webp convert",0,84],
  ["ico-converter","ICO / Favicon Converter","image","Create a PNG favicon-sized image from an upload.","image","to-ico","ico favicon",0,73],
  ["image-blur","Image Blur","image","Gaussian-style blur using canvas.","image","blur","blur image",0,74],
  ["image-sharpen","Image Sharpen","image","Simple unsharp-mask sharpening.","image","sharpen","sharpen image",0,70],
  ["image-grayscale","Grayscale Image","image","Convert an image to grayscale.","image","grayscale","grayscale black white",0,72],
  ["image-invert","Invert Image","image","Invert image colors.","image","invert","invert negative",0,65],
  ["image-watermark","Watermark Tool","image","Overlay text on an image.","image","watermark","watermark copyright",1,83],
  ["rounded-image","Rounded Image Generator","image","Clip an image to rounded corners.","image","rounded","rounded corners",0,77],
  ["circle-cropper","Circle Cropper","image","Crop an image into a circle for avatars.","image","circle","circle avatar pfp",1,86],
  ["meme-generator","Meme Generator","image","Add top and bottom captions to an image.","image","meme","meme caption impact",1,91],
  ["image-palette","Image Color Palette","image","Sample dominant colors from an image.","image","palette","palette colors extract",0,80],
  ["image-color-picker","Image Color Picker","image","Click a pixel to copy its hex color.","image","pick-color","color picker image eyedropper",0,78],
  ["profile-picture-maker","Profile Picture Maker","image","Square and circle crops at common social sizes.","image","pfp","profile picture avatar",0,81],
  ["favicon-generator","Favicon Generator","image","Export 16, 32, 180, and 192 px PNG icons from an image.","image","favicon","favicon pwa icons",1,82],
  ["image-border","Image Border Tool","image","Add a solid border around an image.","image","border","border frame image",0,70],
  ["brightness-contrast","Brightness & Contrast","image","Adjust brightness and contrast on a local image.","image","levels","brightness contrast",0,74],
  ["social-image-resizer","Social Media Image Resizer","image","Resize for Instagram, X, YouTube, LinkedIn, and more.","image","social-resize","instagram youtube thumbnail size",1,89],
  ["exif-viewer","EXIF Viewer","image","Read basic JPEG EXIF fields locally.","image","exif-view","exif metadata gps",0,76],
  ["exif-remover","EXIF Remover","image","Re-encode an image to strip metadata.","image","exif-strip","exif remove metadata privacy",1,84],
]);

add([
  ["color-picker","Color Picker","design","Pick a color and copy HEX, RGB, HSL, and HSV.","color","picker","color picker hex rgb",1,95],
  ["hex-converter","HEX Color Converter","design","Convert HEX to RGB, HSL, and HSV.","color","hex","hex color",0,86],
  ["rgb-converter","RGB Color Converter","design","Convert RGB to HEX, HSL, and HSV.","color","rgb","rgb color",0,85],
  ["hsl-converter","HSL Color Converter","design","Convert HSL to HEX and RGB.","color","hsl","hsl color",0,80],
  ["hsv-converter","HSV Color Converter","design","Convert HSV to HEX and RGB.","color","hsv","hsv hsb color",0,74],
  ["cmyk-converter","CMYK Color Converter","design","Approximate CMYK from RGB (screen estimate).","color","cmyk","cmyk print",0,72],
  ["palette-generator","Color Palette Generator","design","Generate a harmonious palette from a base color.","color","palette","palette complementary analogous",1,90],
  ["gradient-generator","Gradient Generator","design","Design a CSS linear or radial gradient with a live preview.","cssgen","gradient","gradient css linear",1,92],
  ["css-shadow-generator","CSS Shadow Generator","design","Box-shadow with live preview and copyable CSS.","cssgen","shadow","box-shadow css",1,88],
  ["css-border-generator","CSS Border Generator","design","Border radius and style playground.","cssgen","border","border-radius css",0,78],
  ["glassmorphism-generator","Glassmorphism Generator","design","Frosted-glass CSS with backdrop-filter.","cssgen","glass","glassmorphism frosted",0,80],
  ["neumorphism-generator","Neumorphism Generator","design","Soft UI shadows as copyable CSS.","cssgen","neomorph","neumorphism soft ui",0,73],
  ["css-button-generator","CSS Button Generator","design","Style a button and copy the CSS.","cssgen","button","css button",0,81],
  ["css-card-generator","CSS Card Generator","design","Card padding, radius, and shadow tokens.","cssgen","card","css card",0,74],
  ["blob-generator","Blob Generator","design","Organic SVG blob shapes.","cssgen","blob","blob svg organic",0,77],
  ["svg-wave-generator","SVG Wave Generator","design","Hero-section SVG waves.","cssgen","wave","svg wave divider",0,76],
  ["contrast-checker","Contrast Checker","design","WCAG contrast ratio between two colors.","color","contrast","wcag contrast a11y",1,89],
  ["wcag-checker","WCAG Checker","design","AA / AAA checks for text on a background.","color","contrast","wcag aa aaa",0,82],
  ["color-blindness-simulator","Color Blindness Simulator","design","Approximate how a palette appears with common deficiencies.","color","colorblind","deuteranopia protanopia",0,70],
  ["text-shadow-generator","Text Shadow Generator","design","CSS text-shadow playground.","cssgen","text-shadow","text-shadow css",0,71],
  ["noise-generator","CSS Noise Overlay","design","Subtle noise overlay snippet for backgrounds.","cssgen","noise","noise grain overlay",0,66],
]);

add([
  ["pdf-merger","PDF Merger","pdf","Merge multiple PDFs into one, entirely in the browser.","pdf","merge","pdf merge combine",1,93],
  ["pdf-splitter","PDF Splitter","pdf","Extract a page range into a new PDF.","pdf","split","pdf split extract pages",1,86],
  ["pdf-rotator","PDF Rotator","pdf","Rotate all pages of a PDF.","pdf","rotate","pdf rotate",0,74],
  ["images-to-pdf","Images to PDF","pdf","Turn JPG or PNG files into a single PDF.","pdf","images-to-pdf","jpg to pdf images",1,90],
  ["pdf-page-extractor","PDF Page Extractor","pdf","Save selected pages as a new PDF.","pdf","extract","pdf extract pages",0,78],
  ["pdf-metadata-viewer","PDF Metadata Viewer","pdf","Read title, author, and page count from a PDF.","pdf","meta","pdf metadata info",0,70],
]);

add([
  ["file-size-converter","File Size Converter","files","Convert B, KB, MB, GB, TB (SI and binary).","converter","storage","file size bytes",0,80],
  ["mime-type-lookup","MIME Type Lookup","files","Find a MIME type from a file extension or inspect a local file signature.","mime","lookup","mime extension file type signature",0,72],
  ["json-to-csv","JSON to CSV Converter","files","Flatten a JSON array to CSV.","text","json-to-csv","json csv",1,84],
  ["csv-to-json","CSV to JSON Converter","files","Parse CSV into JSON objects.","text","csv-to-json","csv json",1,85],
  ["json-to-yaml","JSON to YAML","files","Convert JSON to YAML-like text.","text","json-to-yaml","json yaml",0,76],
  ["yaml-to-json","YAML to JSON","files","Convert simple YAML to JSON.","text","yaml-to-json","yaml json",0,74],
  ["json-to-xml","JSON to XML","files","Wrap JSON as XML elements.","text","json-to-xml","json xml",0,70],
  ["xml-to-json","XML to JSON","files","Convert simple XML to JSON.","text","xml-to-json","xml json",0,71],
]);

add([
  ["password-generator","Password Generator","security","Generate strong random passwords with length and character options.","custom","password-generator","password generate strong random",1,99,"n"],
  ["passphrase-generator","Passphrase Generator","security","Diceware-style word passphrases.","generator","passphrase","passphrase diceware words",1,88],
  ["password-strength-checker","Password Strength Checker","security","Estimate entropy and common-pattern issues. Nothing is sent anywhere.","custom","password-strength","password strength entropy",1,90],
  ["random-string-generator","Random String Generator","security","Random alphanumeric strings of any length.","generator","random-string","random string token",0,80],
  ["random-hex-generator","Random Hex Generator","security","Random hexadecimal strings.","generator","random-hex","random hex bytes",0,74],
  ["secure-token-generator","Secure Token Generator","security","URL-safe tokens from crypto.getRandomValues.","generator","secure-token","token api secret",1,84],
  ["hash-generator","Hash Generator","security","MD5, SHA-1, SHA-256, and SHA-512 of text.","codec","multi-hash","hash sha256 md5",0,82],
]);

add([
  ["bmi-calculator","BMI Calculator","fitness","Body mass index from height and weight, with adult categories.","calculator","bmi","bmi body mass index weight",1,96,"h"],
  ["calorie-calculator","Calorie Calculator","fitness","Daily calorie target for lose / maintain / gain.","calculator","calorie","calorie deficit surplus",1,91,"h"],
  ["macro-calculator","Macro Calculator","fitness","Protein, carbs, and fat grams from calories and ratios.","calculator","macro","macros protein carbs fat",1,88,"h"],
  ["protein-calculator","Protein Calculator","fitness","Daily protein from body weight and goal.","calculator","protein","protein grams",0,84,"h"],
  ["body-fat-calculator","Body Fat Calculator","fitness","US Navy circumference method estimate.","calculator","body-fat","body fat navy",0,80,"h"],
  ["ideal-weight-calculator","Ideal Weight Calculator","fitness","Devine, Robinson, and Miller formulas.","calculator","ideal-weight","ideal weight",0,78,"h"],
  ["water-intake-calculator","Water Intake Calculator","fitness","A simple daily water estimate from weight and activity.","calculator","water","water hydration litre",0,82,"h"],
  ["running-pace-calculator","Running Pace Calculator","fitness","Pace, time, or distance from the other two.","calculator","pace","running pace km mile",1,87],
  ["one-rep-max-calculator","One-Rep Max Calculator","fitness","Epley estimate of 1RM from weight and reps.","calculator","one-rep-max","1rm epley",0,83],
  ["heart-rate-zone-calculator","Heart Rate Zone Calculator","fitness","Training zones from age (Fox formula).","calculator","hr-zone","heart rate zone karvonen",0,79,"h"],
  ["calories-burned-calculator","Calories Burned Estimator","fitness","Rough calorie burn from MET, weight, and minutes.","calculator","calories-burned","calories burned met",0,77,"h"],
  ["lean-body-mass-calculator","Lean Body Mass Calculator","fitness","Boer estimate of lean body mass.","calculator","lbm","lean body mass",0,70,"h"],
]);

add([
  ["date-difference","Date Difference Calculator","datetime","Days, weeks, and months between two dates.","datetime","date-diff","date difference between",1,90],
  ["workday-calculator","Workday Calculator","datetime","Add business days, skipping weekends.","datetime","workday","workdays business days",0,82],
  ["business-day-calculator","Business Day Calculator","datetime","Count weekdays between two dates.","datetime","business-days","business days weekdays",0,80],
  ["countdown","Countdown","datetime","Count down to a date and time.","datetime","countdown","countdown timer event",1,88],
  ["stopwatch","Stopwatch","productivity","A simple stopwatch with laps.","custom","stopwatch","stopwatch lap",1,86],
  ["world-clock","World Clock","datetime","Current time in major cities.","datetime","world-clock","world clock timezone cities",1,87],
  ["timezone-converter","Timezone Converter","datetime","Convert a time between IANA time zones.","datetime","timezone","timezone convert utc",1,89],
  ["date-formatter","Date Formatter","datetime","Format a date with common patterns.","datetime","format","date format iso",0,74],
  ["weekday-calculator","Weekday Calculator","datetime","What day of the week a date falls on.","datetime","weekday","weekday friday",0,72],
  ["week-number-calculator","Week Number Calculator","datetime","ISO week number of a date.","datetime","week-number","iso week",0,70],
  ["leap-year-checker","Leap Year Checker","datetime","Check whether a year is a leap year.","datetime","leap","leap year",0,68],
  ["birthday-countdown","Birthday Countdown","datetime","Days until the next birthday.","datetime","birthday","birthday countdown",0,76],
  ["time-until-calculator","Time Until Calculator","datetime","Years, days, and hours until a target.","datetime","time-until","time until deadline",0,77],
]);

add([
  ["youtube-rpm-calculator","YouTube RPM Calculator","creators","Estimate revenue from views and RPM. Assumptions are editable.","calculator","yt-rpm","youtube rpm revenue",1,90,"e"],
  ["youtube-cpm-calculator","YouTube CPM Calculator","creators","Revenue from impressions and CPM.","calculator","yt-cpm","youtube cpm ads",0,84,"e"],
  ["youtube-shorts-calculator","YouTube Shorts Calculator","creators","Rough Shorts revenue from views and RPM.","calculator","yt-shorts","youtube shorts earnings",0,82,"e"],
  ["youtube-earnings-estimator","YouTube Earnings Estimator","creators","Range estimate from views, RPM low, and RPM high.","calculator","yt-earn","youtube money earnings",1,88,"e"],
  ["tiktok-earnings-estimator","TikTok Earnings Estimator","creators","Creativity-program style estimate from views and RPM.","calculator","tt-earn","tiktok earnings creativity",0,83,"e"],
  ["instagram-engagement-calculator","Instagram Engagement Calculator","creators","Engagement rate from likes, comments, and followers.","calculator","ig-eng","instagram engagement rate",1,86],
  ["twitch-revenue-calculator","Twitch Revenue Calculator","creators","Estimate from subs, bits, and ad minutes.","calculator","twitch","twitch subs bits",0,78,"e"],
  ["spotify-royalty-estimator","Spotify Royalty Estimator","creators","Streams × per-stream rate. Rate is an assumption you can edit.","calculator","spotify","spotify royalties streams",1,85,"e"],
  ["apple-music-royalty-estimator","Apple Music Royalty Estimator","creators","Streams × assumed per-stream rate.","calculator","apple-music","apple music royalties",0,74,"e"],
  ["podcast-revenue-calculator","Podcast Revenue Calculator","creators","Downloads × CPM × ad slots.","calculator","podcast","podcast cpm downloads",0,73,"e"],
  ["bpm-calculator","BPM Calculator","creators","Tap tempo or convert beat length to BPM.","custom","bpm","bpm tempo tap",1,87],
  ["audio-bitrate-calculator","Audio Bitrate Calculator","audio","File size from bitrate and duration, or bitrate from size.","calculator","audio-bitrate","audio bitrate file size",0,80],
  ["audio-file-size-calculator","Audio File Size Calculator","audio","Estimate WAV/MP3 size from duration and bitrate.","calculator","audio-size","audio file size wav",0,78],
  ["video-bitrate-calculator","Video Bitrate Calculator","video","Bitrate from file size and duration.","calculator","video-bitrate","video bitrate 4k",1,84],
  ["video-file-size-calculator","Video File Size Calculator","video","Estimate size from bitrate and duration.","calculator","video-size","video file size gb",0,82],
  ["hashtag-generator","Hashtag Generator","creators","Build a hashtag set from keywords.","generator","hashtags","hashtags instagram tiktok",1,84],
  ["youtube-title-helper","YouTube Title Helper","ai","Title options from a topic. Local templates, optional AI.","ai","yt-title","youtube title",0,80],
  ["youtube-description-helper","YouTube Description Helper","ai","Outline a description from a topic.","ai","yt-desc","youtube description",0,76],
  ["tiktok-caption-helper","TikTok Caption Helper","ai","Short caption variants from a topic.","ai","tt-caption","tiktok caption",0,75],
  ["cover-art-size-tool","Cover Art Size Tool","creators","Common cover-art pixel sizes with a resizer.","image","social-resize","cover art album spotify",0,70],
]);

add([
  ["invoice-generator","Invoice Generator","business","Create a printable invoice. Data stays in the browser.","document","invoice","invoice bill pdf print",1,95,"n"],
  ["receipt-generator","Receipt Generator","business","Simple itemised receipt for print or PDF.","document","receipt","receipt print",1,86],
  ["quotation-generator","Quotation Generator","business","Sales quotation with line items and tax.","document","quote","quotation estimate",0,84],
  ["estimate-generator","Estimate Generator","business","Project estimate with optional notes.","document","estimate","estimate quote",0,78],
  ["sku-generator","SKU Generator","business","Pattern-based SKUs.","generator","sku","sku product code",0,74],
  ["business-name-generator","Business Name Generator","business","Name ideas from keywords.","generator","biz-name","business name company",1,85],
  ["company-name-generator","Company Name Generator","business","Company-style name ideas.","generator","company-name","company name",0,76],
  ["brand-name-generator","Brand Name Generator","business","Short brandable names.","generator","brand-name","brand name",0,77],
  ["product-name-generator","Product Name Generator","business","Product name ideas from a seed word.","generator","product-name","product name",0,73],
  ["slogan-generator","Slogan Generator","business","Short taglines from a brand and benefit.","ai","slogan","slogan tagline",0,75],
  ["meeting-agenda-generator","Meeting Agenda Generator","business","A structured agenda you can copy.","document","agenda","meeting agenda",0,72],
  ["meeting-minutes-generator","Meeting Minutes Template","business","Minutes template with attendees and actions.","document","minutes","meeting minutes",0,70],
  ["email-signature-generator","Email Signature Generator","business","Simple HTML email signature.","document","signature","email signature",1,82],
  ["payslip-generator","Payslip Generator","business","Demo payslip for layout testing. Not a payroll system.","document","payslip","payslip salary demo",0,68,"m"],
]);

add([
  ["random-number-generator","Random Number Generator","random","Random integers or decimals in a range.","generator","random-number","random number rng",1,92],
  ["random-name-generator","Random Name Generator","random","Fictional given names and surnames.","generator","random-name","random name person",1,88],
  ["random-username-generator","Random Username Generator","random","Handle-style usernames.","generator","username","username handle gamer",1,86],
  ["random-country-generator","Random Country Generator","random","Pick a random country.","generator","country","random country",0,70],
  ["random-city-generator","Random City Generator","random","Pick a random city (sample list).","generator","city","random city",0,68],
  ["random-color-generator","Random Color Generator","random","Random HEX/RGB colors.","generator","rand-color","random color hex",0,76],
  ["random-word-generator","Random Word Generator","random","Random English-like words from a local list.","generator","word","random word",0,74],
  ["random-date-generator","Random Date Generator","random","Random dates in a range.","generator","rand-date","random date",0,71],
  ["yes-no-generator","Yes / No Generator","random","A fair yes or no.","generator","yesno","yes no decide",1,84],
  ["coin-flip","Coin Flip","random","Flip a virtual coin.","custom","coin-flip","coin flip heads tails",1,90],
  ["dice-roller","Dice Roller","random","Roll any number of dice with custom sides.","custom","dice-roller","dice d6 d20 rpg",1,91],
  ["wheel-spinner","Wheel Spinner","random","Spin a wheel of names or options.","custom","wheel","wheel spin decide",1,93],
  ["team-generator","Team Generator","random","Split a list of names into teams.","generator","teams","teams random group",0,80],
  ["secret-santa-generator","Secret Santa Generator","random","Derangement of names — nobody draws themselves.","generator","secret-santa","secret santa gift",0,78],
  ["fantasy-name-generator","Fantasy Name Generator","random","Elvish, dwarvish, and other fictional names.","generator","fantasy-name","fantasy name rpg",0,81],
  ["gamer-name-generator","Gamer Name Generator","random","Playful gamer tags.","generator","gamer-name","gamer tag",0,77],
  ["nickname-generator","Nickname Generator","random","Nicknames from a given name.","generator","nickname","nickname",0,72],
  ["pet-name-generator","Pet Name Generator","random","Names for dogs, cats, and other pets.","generator","pet-name","pet name dog cat",0,75],
  ["baby-name-generator","Baby Name Generator","random","Given-name ideas by style.","generator","baby-name","baby name",0,79],
  ["story-prompt-generator","Story Prompt Generator","random","Short fiction prompts.","generator","story-prompt","story prompt writing",0,76],
  ["writing-prompt-generator","Writing Prompt Generator","random","Writing prompts for practice.","generator","writing-prompt","writing prompt",0,74],
  ["plot-generator","Plot Generator","random","A simple story shape: character, want, obstacle.","generator","plot","plot story",0,72],
  ["random-decision","Random Decision Maker","random","Pick one option from a list.","generator","decision","decide random pick",1,85],
]);

add([
  ["meta-tag-generator","Meta Tag Generator","seo","Title, description, robots, and canonical tags.","seo","meta","meta tags title description",1,92],
  ["serp-preview","SERP Preview","seo","Google-style search snippet preview.","seo","serp","serp google preview",1,90],
  ["open-graph-generator","Open Graph Generator","seo","og:title, og:description, og:image tags.","seo","og","open graph facebook",1,87],
  ["twitter-card-generator","Twitter Card Generator","seo","twitter:card meta tags.","seo","twitter-card","twitter card x",0,80],
  ["schema-generator","JSON-LD Schema Generator","seo","WebSite / Article / FAQ JSON-LD snippets.","seo","schema","json-ld schema.org",1,84],
  ["sitemap-generator","Sitemap.xml Generator","seo","Build a sitemap from a list of URLs.","seo","sitemap","sitemap.xml",0,82],
  ["robots-txt-generator","Robots.txt Generator","seo","Create a robots.txt with allow/disallow rules.","seo","robots","robots.txt",1,83],
  ["canonical-generator","Canonical URL Generator","seo","Output a rel=canonical tag.","seo","canonical","canonical url",0,74],
  ["hreflang-generator","Hreflang Generator","seo","Alternate language link tags.","seo","hreflang","hreflang i18n",0,70],
  ["keyword-density-calculator","Keyword Density Calculator","seo","Keyword frequency and density in a passage.","text","keyword-density","keyword density seo",0,78],
  ["utm-generator","UTM Link Generator","seo","Build campaign URLs with utm_* parameters.","seo","utm","utm campaign source medium",1,88],
  ["redirect-generator","Redirect Snippet Generator","seo","301 snippets for nginx, Apache, Netlify, and meta refresh.","seo","redirect","301 redirect",0,73],
  ["web-manifest-generator","Web Manifest Generator","seo","A basic site.webmanifest.","seo","manifest","webmanifest pwa",0,72],
  ["robots-txt-tester","Robots.txt Tester","seo","Test whether a path is allowed or blocked by pasted robots.txt rules.","seo","robots-test","robots tester crawl allow disallow",1,89],
  ["sitemap-validator","XML Sitemap Validator","seo","Validate sitemap XML, count URLs, and flag malformed locations.","seo","sitemap-validator","sitemap validate xml urls",1,88],
  ["jsonld-validator","JSON-LD Validator","seo","Validate JSON-LD syntax and inspect Schema.org context and types.","seo","jsonld-validator","json ld validate schema",1,87],
  ["heading-structure-analyzer","Heading Structure Analyzer","seo","Analyze H1-H6 hierarchy from pasted HTML and flag structural issues.","seo","headings","h1 h2 heading analyzer seo",1,86],
  ["slug-generator","SEO Slug Generator","seo","Create clean URL slugs with Unicode-aware normalization and stopword cleanup.","seo","slug","url slug seo permalink",1,85],
  ["title-length-checker","SEO Title Length Checker","seo","Check title length with character guidance and truncation warnings.","seo","title-length","title tag length seo",0,82],
  ["meta-description-length-checker","Meta Description Length Checker","seo","Check description length and show practical snippet guidance.","seo","description-length","meta description length seo",0,82],
  ["meta-robots-generator","Meta Robots Tag Generator","seo","Build a meta robots directive from index, follow, snippet and preview controls.","seo","robots-meta","meta robots noindex nofollow",0,80],
  ["llms-txt-generator","llms.txt Generator","seo","Generate an editable llms.txt starter file for AI crawler guidance.","seo","llms-txt","llms txt ai crawlers",0,78],
]);

add([
  ["qr-generator","QR Code Generator","qr","Generate a QR code from text or a URL and download it as PNG.","qr","text","qr qrcode code url text",1,99,"n"],
  ["qr-code-styled","Styled QR Code Generator","qr","Generate a QR code with custom colors, size, margin and error correction.","qr","styled","qr styled color customize",1,94],
  ["qr-code-high-error-correction","High Error Correction QR","qr","Generate QR codes using high error correction for more resilient scans.","qr","high-error","qr error correction h",0,78],
  ["qr-code-low-error-correction","Low Error Correction QR","qr","Generate compact QR codes using low error correction.","qr","low-error","qr error correction l",0,72],
  ["wifi-qr-generator","Wi-Fi QR Generator","qr","Create a QR code that can configure a Wi-Fi network.","qr","wifi","wifi qr ssid network",1,92],
  ["whatsapp-qr-generator","WhatsApp QR Generator","qr","Create a QR code that opens a WhatsApp chat with an optional message.","qr","whatsapp","whatsapp qr chat",1,88],
  ["email-qr-generator","Email QR Generator","qr","Create a mailto QR code with recipient, subject and message.","qr","email","email qr mailto",0,78],
  ["phone-qr-generator","Phone QR Generator","qr","Create a QR code that opens a phone dialer.","qr","phone","phone qr tel call",0,76],
  ["sms-qr-generator","SMS QR Generator","qr","Create a QR code with a prefilled SMS message.","qr","sms","sms qr message",0,74],
  ["vcard-qr-generator","vCard QR Generator","qr","Create a QR contact card with name, phone, email and organization.","qr","vcard","vcard contact qr",1,86],
  ["location-qr-generator","Location QR Generator","qr","Create a geo QR code from latitude and longitude.","qr","geo","location maps geo qr",0,72],
  ["event-qr-generator","Event QR Generator","qr","Create a calendar event QR code using iCalendar fields.","qr","event","event calendar ical qr",0,70],
  ["calendar-qr-generator","Calendar QR Generator","qr","Create a calendar event QR with title, location and times.","qr","calendar","calendar event qr",0,69],
  ["mecard-qr-generator","MeCard QR Generator","qr","Create a compact MeCard contact QR code.","qr","mecard","mecard contact qr",0,67],
  ["url-qr-generator","URL QR Generator","qr","Turn any URL into a downloadable QR code.","qr","url","url link qr",1,90],
  ["text-qr-generator","Text QR Generator","qr","Encode plain text into a QR code.","qr","text","text qr encode",0,82],
  ["bitcoin-qr-generator","Bitcoin QR Generator","qr","Create a Bitcoin payment URI QR code.","qr","bitcoin","bitcoin btc payment qr",0,72],
  ["ethereum-qr-generator","Ethereum QR Generator","qr","Create an Ethereum address QR code.","qr","ethereum","ethereum eth wallet qr",0,68],
  ["crypto-wallet-qr-generator","Crypto Wallet QR Generator","qr","Encode a cryptocurrency wallet address into a QR code.","qr","crypto","crypto wallet address qr",0,67],
  ["discord-invite-qr-generator","Discord Invite QR Generator","qr","Create a QR code for a Discord invite URL.","qr","url","discord invite qr",0,64],
  ["telegram-link-qr-generator","Telegram Link QR Generator","qr","Create a QR code for a Telegram username or invite URL.","qr","url","telegram link qr",0,64],
  ["youtube-link-qr-generator","YouTube Link QR Generator","qr","Create a QR code for a YouTube URL.","qr","url","youtube video channel qr",0,63],
  ["instagram-link-qr-generator","Instagram Link QR Generator","qr","Create a QR code for an Instagram profile URL.","qr","url","instagram profile qr",0,63],
  ["facebook-link-qr-generator","Facebook Link QR Generator","qr","Create a QR code for a Facebook URL.","qr","url","facebook profile qr",0,61],
  ["linkedin-link-qr-generator","LinkedIn Link QR Generator","qr","Create a QR code for a LinkedIn URL.","qr","url","linkedin profile qr",0,60],
  ["x-link-qr-generator","X Link QR Generator","qr","Create a QR code for an X profile or post URL.","qr","url","x twitter profile qr",0,60],
  ["app-store-qr-generator","App Store QR Generator","qr","Create a QR code for an Apple App Store URL.","qr","url","app store ios qr",0,58],
  ["google-play-qr-generator","Google Play QR Generator","qr","Create a QR code for a Google Play URL.","qr","url","google play android qr",0,58],
  ["qr-batch-generator","Batch QR Generator","qr","Generate multiple QR codes from newline-separated values.","qr","batch","batch multiple qr",1,84],
  ["qr-data-url-generator","QR Data URI Generator","qr","Generate a QR image and expose its data URL for embedding.","qr","data-url","qr data uri embed",0,70],
  ["qr-svg-generator","QR SVG Generator","qr","Generate a scalable SVG QR code locally in the browser.","qr","svg","qr svg vector",1,80],
  ["qr-size-calculator","QR Size Calculator","qr","Estimate printed QR dimensions from module count and target module size.","qr","size","qr size print dimensions",0,66],
  ["qr-version-helper","QR Version Helper","qr","Estimate a QR version from payload length and error-correction level.","qr","version","qr version modules",0,64],
  ["qr-capacity-helper","QR Capacity Helper","qr","Show approximate QR character capacity by version and error correction.","qr","capacity","qr capacity characters",0,64],
  ["qr-payload-encoder","QR Payload Encoder","qr","Build common QR payload strings such as Wi-Fi, mailto, tel and geo.","qr","payload","qr payload encoder wifi mailto geo",0,70],
  ["qr-payload-inspector","QR Payload Inspector","qr","Inspect and classify a raw QR payload string without uploading it.","qr","inspect","qr payload inspect uri",0,68],
  ["ean13-barcode","EAN-13 Barcode Generator","qr","Generate an EAN-13 product barcode.","barcode","ean13","ean13 barcode product",1,82],
  ["ean8-barcode","EAN-8 Barcode Generator","qr","Generate an EAN-8 barcode for compact product identifiers.","barcode","ean8","ean8 barcode product",0,76],
  ["upc-barcode","UPC-A Barcode Generator","qr","Generate a UPC-A retail barcode.","barcode","upca","upc upca barcode",0,78],
  ["code128-barcode","Code 128 Barcode Generator","qr","Generate a Code 128 barcode from text or numbers.","barcode","code128","code128 barcode",1,80],
  ["code39-barcode","Code 39 Barcode Generator","qr","Generate a Code 39 barcode.","barcode","code39","code39 barcode",0,70],
  ["itf14-barcode","ITF-14 Barcode Generator","qr","Generate an ITF-14 logistics barcode.","barcode","itf14","itf14 logistics barcode",0,68],
  ["msi-barcode","MSI Barcode Generator","qr","Generate an MSI barcode from numeric data.","barcode","msi","msi barcode",0,62],
  ["pharmacode-barcode","Pharmacode Generator","qr","Generate a Pharmacode barcode for numeric values.","barcode","pharmacode","pharmacode barcode",0,60],
  ["codabar-barcode","Codabar Barcode Generator","qr","Generate a Codabar barcode.","barcode","codabar","codabar barcode",0,60],
  ["isbn-barcode","ISBN Barcode Generator","qr","Generate an ISBN-13/EAN-13 barcode from a book identifier.","barcode","isbn","isbn barcode book",0,74],
  ["gtin-validator","GTIN Validator","qr","Validate GTIN-8, GTIN-12, GTIN-13 and GTIN-14 check digits.","barcode","gtin-validator","gtin validate check digit",0,76],
  ["ean13-check-digit","EAN-13 Check Digit Calculator","qr","Calculate or verify the EAN-13 check digit.","barcode","ean13-check","ean13 check digit",0,70],
  ["upc-check-digit","UPC Check Digit Calculator","qr","Calculate or verify the UPC-A check digit.","barcode","upc-check","upc check digit",0,68],
  ["isbn-check-digit","ISBN-13 Check Digit Calculator","qr","Calculate or verify an ISBN-13 check digit.","barcode","isbn-check","isbn check digit",0,66],
  ["barcode-svg-generator","Barcode SVG Generator","qr","Generate a barcode as downloadable SVG markup.","barcode","svg","barcode svg vector",0,72],
  ["barcode-label-generator","Barcode Label Generator","qr","Generate a printable barcode label with a value and human-readable text.","barcode","label","barcode label print",0,70],
]);

add([
  ["ipv4-calculator","IPv4 Calculator","network","Network, broadcast, host range, mask, and host count from IPv4/CIDR.","network","ipv4","ipv4 ip subnet cidr",1,88],
  ["subnet-calculator","Subnet Calculator","network","Calculate IPv4 subnet boundaries and usable host ranges.","network","subnet","subnet mask cidr ipv4",1,86],
  ["cidr-calculator","CIDR Calculator","network","Analyze a CIDR prefix and its address capacity.","network","cidr","cidr prefix network mask",0,84],
  ["ipv4-binary","IPv4 Binary Converter","network","Convert an IPv4 address and mask to binary.","network","ipv4-binary","ipv4 binary bits",0,72],
  ["ipv4-decimal","IPv4 Decimal Converter","network","Convert an IPv4 address to its unsigned 32-bit integer.","network","ipv4-decimal","ipv4 decimal integer",0,70],
  ["ipv4-network-address","IPv4 Network Address Calculator","network","Find the network address for an IPv4/CIDR pair.","network","network-address","network address cidr",0,78],
  ["ipv4-broadcast-address","IPv4 Broadcast Address Calculator","network","Find the IPv4 broadcast address.","network","broadcast","broadcast address cidr",0,76],
  ["ipv4-host-range","IPv4 Host Range Calculator","network","Find the first and last usable IPv4 hosts.","network","host-range","host range subnet",0,76],
  ["ipv4-wildcard-mask","IPv4 Wildcard Mask Calculator","network","Calculate the inverse/wildcard mask for an IPv4 prefix.","network","wildcard","wildcard mask acl",0,74],
  ["ipv4-mask-from-prefix","IPv4 Mask from Prefix","network","Convert a CIDR prefix such as /24 into a dotted mask.","network","mask-prefix","subnet mask prefix",0,72],
  ["ipv4-prefix-from-mask","IPv4 Prefix from Mask","network","Convert a contiguous IPv4 subnet mask into CIDR notation.","network","prefix-mask","subnet mask cidr",0,72],
  ["ipv4-host-count","IPv4 Host Count Calculator","network","Calculate total and usable IPv4 addresses in a prefix.","network","host-count","hosts addresses subnet",0,74],
  ["ipv4-subnet-count","IPv4 Subnet Capacity Calculator","network","Show address capacity for an IPv4 prefix.","network","subnet-count","subnet capacity",0,68],
  ["ipv4-split-subnets","IPv4 Subnet Split Helper","network","Compare address capacity when choosing a smaller IPv4 prefix.","network","split-subnets","split subnet cidr",0,70],
  ["ipv6-expand","IPv6 Expansion Tool","network","Expand compressed IPv6 notation into eight groups.","network","ipv6-expand","ipv6 expand",1,82],
  ["ipv6-compress","IPv6 Compression Tool","network","Compress an IPv6 address using canonical zero-run compression.","network","ipv6-compress","ipv6 compress",0,82],
  ["ipv6-binary","IPv6 Binary Converter","network","Convert IPv6 into its 128-bit binary representation.","network","ipv6-binary","ipv6 binary",0,68],
  ["ipv6-address-type","IPv6 Address Type Checker","network","Identify common IPv6 address classes locally.","network","ipv6-type","ipv6 multicast loopback private",0,76],
  ["ipv6-subnet-calculator","IPv6 Subnet Calculator","network","Calculate an IPv6 network and address capacity from a prefix.","network","ipv6-subnet","ipv6 cidr subnet",0,78],
  ["url-parser","URL Parser","network","Break a URL into protocol, host, port, path, query, and origin.","network","url-parser","url parse uri",1,90],
  ["url-query-parser","URL Query Parser","network","List URL query parameters as key/value pairs.","network","url-query","query params url",0,82],
  ["url-query-builder","URL Query Builder","network","Add or replace a query parameter in a URL.","network","url-builder","query builder url",0,82],
  ["url-origin","URL Origin Extractor","network","Extract the origin from a URL.","network","url-origin","origin protocol host",0,68],
  ["url-path-analyzer","URL Path Analyzer","network","Inspect URL path segments and the final path component.","network","url-path","url path",0,66],
  ["url-encode","URL Component Encoder","network","Percent-encode URL component text.","network","url-encode","url encode percent",0,84],
  ["url-decode","URL Component Decoder","network","Decode percent-encoded URL component text.","network","url-decode","url decode percent",0,84],
  ["port-lookup","Port Lookup","network","Look up a common TCP/UDP port and its service.","network","port-lookup","port tcp udp",1,80],
  ["port-reference","Common Port Reference","network","Browse common service ports and their names.","network","port-reference","ports services",0,78],
  ["http-status-reference","HTTP Status Code Reference","network","Reference common HTTP response status codes.","network","http-status","http status codes",1,88],
  ["http-method-reference","HTTP Method Reference","network","Reference standard HTTP request methods and purposes.","network","http-method","http methods rest",0,84],
  ["header-format","HTTP Header Formatter","network","Normalize HTTP header lines for readable copy/paste.","network","header-format","http headers formatter",0,80],
  ["header-parser","HTTP Header Parser","network","Parse header lines into readable name/value pairs.","network","header-parser","http header parser",0,78],
  ["basic-auth-header","Basic Authorization Header Generator","network","Create a Basic Authorization header value from credentials.","network","basic-auth","authorization basic header",0,76],
  ["bearer-header","Bearer Authorization Header Generator","network","Create a Bearer Authorization header value from a token.","network","bearer","authorization bearer token",0,76],
  ["content-type-reference","Content-Type Reference","network","Reference common HTTP Content-Type values.","network","content-type","mime content type http",0,76],
  ["websocket-url-builder","WebSocket URL Builder","network","Build ws:// or wss:// endpoint URLs.","network","websocket-url","websocket ws wss",0,72],
  ["localhost-url-builder","Localhost URL Builder","network","Build localhost development URLs from host, port, and path.","network","localhost","localhost dev url",0,70],
  ["connection-info","Browser Connection Info","network","Show browser-exposed online status and connection estimates when available.","network","connection-info","network connection browser",0,74],
]);

add([
  ["title-generator","Title Generator","ai","Headline options from a topic.","ai","title","title headline",1,86],
  ["caption-generator","Caption Generator","ai","Social captions from a topic.","ai","caption","caption instagram",1,85],
  ["bio-generator","Bio Generator","ai","Short bios from a role and tone.","ai","bio","bio twitter instagram",1,84],
  ["product-description-generator","Product Description Generator","ai","Product copy from name and features.","ai","product-desc","product description",0,82],
  ["email-generator","Email Draft Generator","ai","A short email from purpose and points.","ai","email","email draft",0,80],
  ["prompt-generator","Prompt Generator","ai","LLM prompts from a task.","ai","prompt","prompt engineer",1,83],
  ["prompt-improver","Prompt Improver","ai","Rewrite a prompt to be more specific.","ai","prompt-improve","improve prompt",0,78],
  ["alt-text-generator","Alt Text Helper","ai","Alt-text drafts from an image description.","ai","alt","alt text a11y",0,76],
  ["meta-description-generator","Meta Description Generator","ai","Search descriptions from a page summary.","ai","meta-desc","meta description seo",0,79],
  ["resume-bullet-generator","Resume Bullet Generator","ai","Achievement-style bullets from a duty.","ai","resume","resume bullet cv",0,81],
]);

add([
  ["blog-outline-generator","Blog Outline Generator","ai","Build a structured article outline from a topic and audience.","ai","blog-outline","blog outline article",0,78],
  ["ad-copy-generator","Ad Copy Generator","ai","Create short template-based ad copy variations.","ai","ad-copy","advertising ad copy",0,77],
  ["call-to-action-generator","Call To Action Generator","ai","Create concise CTA variations for a product or post.","ai","cta","cta call to action",0,76],
  ["social-hook-generator","Social Hook Generator","ai","Create opening hooks for short-form content.","ai","hook","social hook opening",0,79],
  ["product-title-generator","Product Title Generator","ai","Create product title variations from a product and benefit.","ai","product-title","product title ecommerce",0,75],
  ["feature-benefit-generator","Feature To Benefit Converter","ai","Turn product features into customer-facing benefits.","ai","feature-benefit","features benefits copy",0,74],
  ["faq-generator","FAQ Generator","ai","Turn a topic and key points into useful FAQ questions and answers.","ai","faq","faq questions answers",0,73],
  ["ai-meeting-agenda-generator","AI Meeting Agenda Generator","ai","Create a focused meeting agenda from a goal and topics.","ai","agenda","meeting agenda",0,72],
  ["meeting-action-items","Meeting Action Item Formatter","ai","Turn rough action notes into a structured action list.","ai","actions","meeting action items",0,71],
  ["rewrite-helper","Rewrite Helper","ai","Rewrite supplied text into a chosen tone using local templates.","ai","rewrite","rewrite tone",0,80],
  ["shorten-helper","Shorten Text Helper","ai","Create a concise version of supplied text without an AI API.","ai","shorten","shorten concise summarize",0,78],
  ["expand-helper","Expand Text Helper","ai","Turn short notes into a fuller structured draft.","ai","expand","expand writing",0,70],
  ["pros-cons-generator","Pros And Cons Generator","ai","Turn a decision topic into a neutral pros-and-cons worksheet.","ai","pros-cons","pros cons decision",0,69],
  ["idea-generator","Idea Generator","ai","Generate structured idea prompts from a topic and audience.","ai","ideas","ideas brainstorm",1,82],
  ["content-brief-generator","Content Brief Generator","ai","Build a reusable content brief from a topic, audience, and goal.","ai","content-brief","content brief seo",0,77],
]);

add([
  ["gpa-calculator","GPA Calculator","education","GPA from a list of courses, credits, and grades.","calculator","gpa","gpa grade point",1,90],
  ["cgpa-calculator","CGPA Calculator","education","Cumulative GPA from semester GPAs.","calculator","cgpa","cgpa cumulative",0,82],
  ["grade-calculator","Grade Calculator","education","Weighted grade from components.","calculator","grade","grade weighted",1,86],
  ["final-grade-calculator","Final Grade Calculator","education","Score needed on the final to hit a target.","calculator","final-grade","final exam needed",1,88],
  ["weighted-grade-calculator","Weighted Grade Calculator","education","Overall percent from weighted parts.","calculator","weighted-grade","weighted grade",0,80],
  ["exam-score-calculator","Exam Score Calculator","education","Percent from correct / total questions.","calculator","exam-score","exam score percent",0,76],
  ["study-time-calculator","Study Time Calculator","education","Spread hours across days until an exam.","calculator","study-time","study plan hours",0,74],
  ["flashcard-generator","Flashcard Generator","education","Turn term:definition lines into printable cards.","document","flashcards","flashcards study",0,78],
]);

add([
  ["pomodoro-timer","Pomodoro Timer","productivity","25/5 focus timer with rounds.","custom","pomodoro","pomodoro focus timer",1,93],
  ["focus-timer","Focus Timer","productivity","Custom focus and break lengths.","custom","pomodoro","focus timer",0,80],
  ["sleep-calculator","Sleep Calculator","productivity","Bedtimes and wake times in 90-minute cycles.","calculator","sleep","sleep cycles bedtime",1,85],
  ["deadline-calculator","Deadline Calculator","datetime","Working days until a deadline.","datetime","deadline","deadline due",0,77],
]);

add([
  ["uuid-dataset-generator","UUID Dataset Generator","testdata","Generate a list of UUIDs.","generator","uuid-list","uuid dataset",0,72],
  ["test-names-generator","Test Names Generator","testdata","Fictional people for staging data.","generator","test-names","fake names test",1,80],
  ["test-address-generator","Test Address Generator","testdata","Fictional addresses. Clearly labeled fake.","generator","test-address","fake address",0,76],
  ["test-email-generator","Test Email Generator","testdata","example.com emails for tests.","generator","test-email","fake email test",0,78],
  ["test-phone-generator","Test Phone Generator","testdata","Fictional phone numbers.","generator","test-phone","fake phone",0,74],
  ["dummy-csv-generator","Dummy CSV Generator","testdata","CSV of fictional users or products.","generator","dummy-csv","dummy csv",1,79],
  ["dummy-sql-generator","Dummy SQL Generator","testdata","INSERT statements with fictional rows.","generator","dummy-sql","dummy sql insert",0,75],
  ["dummy-users-generator","Dummy Users Generator","testdata","JSON array of fictional users.","generator","dummy-users","dummy users json",0,77],
  ["dummy-products-generator","Dummy Products Generator","testdata","JSON array of fictional products.","generator","dummy-products","dummy products",0,73],
]);

add([
  ["instagram-image-resizer","Instagram Image Resizer","social","1080×1080, 1080×1350, and 1080×566 presets.","image","social-resize","instagram size",1,86],
  ["tiktok-image-resizer","TikTok Image Resizer","social","1080×1920 vertical preset.","image","social-resize","tiktok size",0,80],
  ["youtube-thumbnail-resizer","YouTube Thumbnail Resizer","social","1280×720 thumbnail preset.","image","social-resize","youtube thumbnail 1280",1,88],
  ["x-image-resizer","X Image Resizer","social","1600×900 and 1080×1080 presets.","image","social-resize","twitter x image",0,78],
  ["linkedin-image-resizer","LinkedIn Image Resizer","social","LinkedIn cover and post sizes.","image","social-resize","linkedin cover",0,74],
  ["pinterest-image-resizer","Pinterest Image Resizer","social","1000×1500 pin size.","image","social-resize","pinterest pin",0,72],
  ["facebook-image-resizer","Facebook Image Resizer","social","Facebook post and cover sizes.","image","social-resize","facebook cover",0,73],
  ["username-generator","Username Generator","social","Available-style handles from a name.","generator","username","username",0,80],
]);

add([
  ["fps-to-frames","FPS to Frames Calculator","video","Frame count from duration and FPS.","calculator","fps","fps frames",0,74],
]);

add([
  ["sample-rate-info","Sample Rate Info","audio","Duration from samples and sample rate.","calculator","sample-rate","sample rate hz duration",0,68],
]);

const CHATS = [
  ["whatsapp","WhatsApp","whatsapp imessage chat"],
  ["imessage","iMessage","imessage iphone sms"],
  ["instagram-dm","Instagram DM","instagram dm chat"],
  ["messenger","Facebook Messenger","messenger facebook chat"],
  ["telegram","Telegram","telegram chat"],
  ["discord","Discord","discord chat"],
  ["snapchat","Snapchat","snapchat chat"],
  ["x-dm","X / Twitter DM","twitter x dm"],
  ["google-messages","Google Messages","rcs sms google"],
  ["sms","SMS","sms text message"],
  ["signal","Signal","signal chat"],
  ["slack","Slack","slack chat"],
  ["linkedin-dm","LinkedIn DM","linkedin message"],
  ["reddit","Reddit Chat","reddit chat"],
  ["tinder","Tinder-style Chat","tinder dating chat"],
  ["tiktok-chat","TikTok Chat","tiktok chat"],
  ["threads","Threads DM","threads chat"],
  ["ai-chat","AI Chat Mockup","ai chatgpt mockup"],
];
for (const [id, name, kw] of CHATS) {
  add([[`${id}-mockup`, `${name} Mockup`, "mockups", `Build a labeled DEMO / MOCKUP of a ${name} conversation for storytelling, education, or UI work.`, "mockup", id, kw + " mockup fake demo", id === "whatsapp" || id === "imessage" ? 1 : 0, id === "whatsapp" ? 94 : 78, "m"]]);
}

const POSTS = [
  ["instagram-post","Instagram Post","instagram post"],
  ["tiktok-post","TikTok Post","tiktok post"],
  ["x-post","X Post","twitter tweet x post"],
  ["facebook-post","Facebook Post","facebook post"],
  ["linkedin-post","LinkedIn Post","linkedin post"],
  ["reddit-post","Reddit Post","reddit post"],
  ["youtube-community","YouTube Community Post","youtube community"],
  ["threads-post","Threads Post","threads post"],
];
for (const [id, name, kw] of POSTS) {
  add([[`${id}-mockup`, `${name} Mockup`, "mockups", `A labeled fictional ${name} layout for mockups and thumbnails.`, "post", id, kw + " mockup demo", 0, 74, "m"]]);
}

const DEVICES = [
  ["iphone","iPhone","iphone frame"],
  ["android","Android Phone","android pixel frame"],
  ["ipad","iPad","ipad tablet frame"],
  ["macbook","MacBook","macbook laptop frame"],
  ["browser-chrome","Chrome Browser","chrome browser frame"],
  ["browser-safari","Safari Browser","safari browser frame"],
  ["browser-firefox","Firefox Browser","firefox browser frame"],
  ["watch","Smartwatch","apple watch frame"],
];
for (const [id, name, kw] of DEVICES) {
  add([[`${id}-frame`, `${name} Frame`, "screenshots", `Place a screenshot inside a ${name} frame. Processed locally.`, "device", id, kw + " mockup screenshot", id === "iphone" || id === "browser-chrome" ? 1 : 0, id === "iphone" ? 90 : 76]]);
}

add([
  ["screenshot-beautifier","Screenshot Beautifier","screenshots","Pad a screenshot with a background, radius, and shadow.","image","beautify","screenshot beautify mockup",1,88],
  ["lock-screen-mockup","Lock Screen Mockup","screenshots","A labeled fictional lock-screen layout.","device","lockscreen","lock screen mockup",0,70,"m"],
  ["notification-mockup","Notification Mockup","mockups","A labeled fictional notification.","mockup","notification","notification mockup",0,72,"m"],
]);


// -----------------------------------------------------------------------------
// MASSIVE INVENTORY EXPANSION
// These entries intentionally start as planned/COMING SOON. They are genuine
// utility concepts with stable IDs/URLs, ready to receive real engines later.
// The expansion is generated from curated dimensions rather than meaningless
// duplicate names.
// -----------------------------------------------------------------------------

function slugify(value) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function addFamily(category, prefix, items, engineType = "custom", enginePrefix = prefix) {
  for (const item of items) {
    const name = typeof item === "string" ? item : item.name;
    const key = typeof item === "string" ? slugify(item) : item.key;
    const description = typeof item === "string" ? `${name} utility for the enV toolkit.` : item.description;
    const keywords = typeof item === "string" ? `${prefix} ${name}` : `${prefix} ${item.keywords || name}`;
    add([[
      `${slugify(prefix)}-${key}`,
      name,
      category,
      description,
      engineType,
      `${enginePrefix}-${key}`,
      keywords.toLowerCase(),
      0,
      25,
      "p",
    ]]);
  }
}

function addCross(category, prefixes, operations, descriptionTemplate, engineType = "custom", planned = true) {
  for (const prefix of prefixes) {
    for (const operation of operations) {
      const name = `${prefix} ${operation}`;
      const id = slugify(name);
      add([[
        id,
        name,
        category,
        descriptionTemplate.replace(/\{platform\}/g, prefix).replace(/\{operation\}/g, operation),
        engineType,
        id,
        `${prefix} ${operation}`.toLowerCase(),
        0,
        20,
        planned ? "p" : "",
      ]]);
    }
  }
}

// Calculators — broad domain coverage.
addFamily("calculators", "Math", [
  "Prime Factorization Calculator", "GCD Calculator", "LCM Calculator", "Modulo Calculator", "Exponent Calculator", "Root Calculator", "Logarithm Calculator", "Natural Log Calculator", "Scientific Notation Calculator", "Significant Figures Calculator", "Rounding Calculator", "Absolute Value Calculator", "Sequence Calculator", "Arithmetic Sequence Calculator", "Geometric Sequence Calculator", "Fibonacci Calculator", "Probability Calculator", "Permutation Calculator", "Combination Calculator", "Expected Value Calculator", "Z-Score Calculator", "Percentile Calculator", "Quartile Calculator", "Interquartile Range Calculator", "Covariance Calculator", "Correlation Calculator", "Regression Calculator", "Slope Calculator", "Distance Formula Calculator", "Midpoint Calculator", "Point-Slope Calculator", "Pythagorean Calculator", "Triangle Angle Calculator", "Triangle Side Calculator", "Circle Arc Calculator", "Sector Area Calculator", "Polygon Area Calculator", "Ellipse Area Calculator", "Trapezoid Area Calculator", "Parallelogram Area Calculator", "Rhombus Area Calculator", "Prism Volume Calculator", "Pyramid Volume Calculator", "Torus Volume Calculator", "Frustum Calculator", "Surface Area Calculator", "Scale Factor Calculator", "Similarity Calculator", "Coordinate Geometry Calculator"
]);
addFamily("calculators", "Finance", [
  "APY Calculator", "APR Calculator", "Amortization Calculator", "Payment Calculator", "Future Value Calculator", "Present Value Calculator", "NPV Calculator", "IRR Calculator", "CAGR Calculator", "Inflation Calculator", "Debt Payoff Calculator", "Debt-to-Income Calculator", "Savings Goal Calculator", "Emergency Fund Calculator", "Retirement Calculator", "401k Calculator", "Pension Calculator", "Investment Return Calculator", "Dividend Calculator", "Stock Return Calculator", "Bond Yield Calculator", "Discount Rate Calculator", "Commission Calculator", "Overtime Pay Calculator", "Take-Home Pay Calculator", "Salary-to-Hourly Calculator", "Hourly-to-Salary Calculator", "Cash Flow Calculator", "Gross Profit Calculator", "Net Profit Calculator", "Operating Margin Calculator", "Contribution Margin Calculator", "Inventory Turnover Calculator", "Customer Acquisition Cost Calculator", "Customer Lifetime Value Calculator", "Burn Rate Calculator", "Runway Calculator", "Recurring Revenue Calculator", "MRR Calculator", "ARR Calculator", "Churn Calculator"
]);
addFamily("calculators", "Construction", [
  "Concrete Volume Calculator", "Concrete Weight Calculator", "Brick Calculator", "Block Calculator", "Mortar Calculator", "Tile Calculator", "Grout Calculator", "Paint Coverage Calculator", "Flooring Calculator", "Carpet Calculator", "Laminate Calculator", "Roofing Calculator", "Roof Pitch Calculator", "Shingle Calculator", "Gutter Calculator", "Drywall Calculator", "Insulation Calculator", "Lumber Calculator", "Board Foot Calculator", "Stair Calculator", "Stair Stringer Calculator", "Deck Calculator", "Fence Calculator", "Post Calculator", "Gravel Calculator", "Mulch Calculator", "Soil Calculator", "Land Area Calculator", "Excavation Calculator"
]);
addFamily("calculators", "Science", [
  "Velocity Calculator", "Acceleration Calculator", "Force Calculator", "Momentum Calculator", "Kinetic Energy Calculator", "Potential Energy Calculator", "Work Calculator", "Power Calculator", "Pressure Calculator", "Density Calculator", "Buoyancy Calculator", "Ohms Law Calculator", "Voltage Divider Calculator", "Resistor Calculator", "Capacitor Calculator", "Inductor Calculator", "Electrical Energy Calculator", "Wavelength Calculator", "Frequency Calculator", "Photon Energy Calculator", "Molarity Calculator", "Moles Calculator", "Molar Mass Calculator", "Dilution Calculator", "pH Calculator", "Half-Life Calculator", "Heat Energy Calculator", "Gas Law Calculator", "Ideal Gas Calculator", "Temperature Conversion Calculator"
]);

// Converters — practical format/domain combinations.
addCross("converters", ["Length", "Mass", "Area", "Volume", "Speed", "Pressure", "Energy", "Power", "Force", "Frequency", "Data Storage", "Data Transfer", "Temperature", "Time", "Angle", "Torque", "Density", "Flow Rate", "Fuel Economy", "Cooking", "Paper", "DPI", "Pixels"], ["Converter", "Table", "Quick Converter", "Comparison", "Reference"], "Convert {platform} values with a practical global reference.");
addFamily("converters", "File", ["JPG to PNG Converter", "PNG to JPG Converter", "PNG to WebP Converter", "WebP to PNG Converter", "JPG to WebP Converter", "WebP to JPG Converter", "SVG to PNG Converter", "PNG to SVG Helper", "CSV to JSON Converter", "JSON to CSV Converter", "CSV to TSV Converter", "TSV to CSV Converter", "XML to JSON Converter", "JSON to XML Converter", "YAML to JSON Converter", "JSON to YAML Converter", "TXT to CSV Converter", "CSV to TXT Converter", "Markdown to HTML Converter", "HTML to Markdown Converter"]);

// Developer tools.
addCross("developer", ["JSON", "XML", "YAML", "CSV", "SQL", "HTML", "CSS", "JavaScript", "TypeScript", "Markdown", "SVG", "JWT", "URL", "URI", "Base64", "Unicode", "ASCII", "Binary", "Hex", "UUID", "Hash", "Cron", "HTTP", "MIME", "OpenAPI", "GraphQL", "Git", "Docker", "Nginx", "Kubernetes"], ["Formatter", "Validator", "Beautifier", "Minifier", "Parser", "Converter", "Generator", "Diff", "Inspector", "Preview", "Tester", "Decoder", "Encoder", "Explainer"], "{platform} {operation} for developers and technical workflows.");
addFamily("developer", "Developer", ["Regex Generator", "Regex Explainer", "Regex Replace Builder", "SQL Query Builder", "SQL Schema Generator", "JSON Schema Generator", "OpenAPI Schema Generator", "OpenAPI Example Generator", "GraphQL Query Builder", "GraphQL Variables Builder", "Gitignore Generator", "EditorConfig Generator", "Docker Compose Generator", "Dockerfile Helper", "Nginx Config Generator", "CSP Header Generator", "CORS Header Helper", "HTTP Request Builder", "API Mock Response Generator", "Webhook Payload Generator", "Environment Variable Generator", "Semantic Version Calculator", "Changelog Generator", "License Generator", "README Generator", "Commit Message Helper", "Branch Name Generator", "Data URI Decoder", "URL Query Builder", "Cookie Parser", "HTTP Header Builder", "Content-Type Lookup", "Status Code Explainer", "IP Header Parser", "JWT Claim Builder", "JWT Payload Generator", "UUID Batch Generator"]);

// Image utilities.
addCross("image", ["Instagram", "TikTok", "YouTube", "Facebook", "X", "LinkedIn", "Pinterest", "Snapchat", "Threads", "Discord", "Reddit", "Twitch"], ["Image Resizer", "Image Compressor", "Profile Image Resizer", "Banner Resizer", "Post Image Resizer", "Story Image Resizer", "Thumbnail Resizer", "Cover Image Resizer", "Square Image Maker", "Portrait Image Maker", "Landscape Image Maker"], "Prepare {platform} assets with a focused image utility.", "image", false);
addFamily("image", "Image", ["Exact Size Image Compressor", "Image File Size Calculator", "Image Aspect Ratio Calculator", "Image Dimension Calculator", "Image PPI Calculator", "Image DPI Calculator", "Image Print Size Calculator", "Image Splitter", "Image Merger", "Image Contact Sheet", "Image Comparison", "Before After Image Maker", "Image Annotation Tool", "Image Redaction Tool", "Image Pixelation Tool", "Image Background Blur", "Image Border Generator", "Image Shadow Generator", "Image Rounded Corner Generator", "Image Circle Mask Generator", "Image Strip Generator", "Image Grid Generator", "Image Watermark Batch Tool", "Image Metadata Cleaner", "Image Metadata Inspector", "Image Dominant Color Finder", "Image Palette Extractor", "Image Color Sampler", "Image Histogram Viewer", "Image Transparency Checker", "Image Alpha Preview"], "image");

// Design and web design.
addCross("design", ["Color", "Gradient", "Shadow", "Border", "Button", "Card", "Badge", "Input", "Avatar", "Glass", "Neumorphism", "Pattern", "Blob", "Wave", "Noise"], ["Generator", "Builder", "Preview", "CSS Generator", "SVG Generator", "Token Generator", "Preset Maker"], "Create a {platform} design utility for modern interfaces.", "cssgen");
addCross("webdesign", ["Responsive Layout", "Typography Scale", "Spacing Scale", "Grid", "Flexbox", "CSS", "Tailwind", "HTML", "Form", "Navigation", "Hero Section", "Pricing Table", "Footer", "Modal", "Toast", "Tooltip", "Tabs", "Accordion", "Carousel", "Design Token"], ["Generator", "Builder", "Preview", "Checklist", "Snippet Generator"], "A {platform} helper for web design and interface work.");

add([
  ["audio-file-inspector","Audio File Inspector","audio","Inspect duration, sample rate, channels, frames, and local file size.","audio","inspector","audio file metadata inspector",1,93,"n"],
  ["audio-duration-tool","Audio Duration Tool","audio","Read the decoded duration of a local audio file.","audio","duration","audio duration length",0,86],
  ["audio-waveform-generator","Audio Waveform Generator","audio","Generate a downloadable waveform PNG from a local audio file.","audio","waveform","audio waveform visualizer",1,92],
  ["audio-to-wav","Audio to WAV Converter","audio","Decode a browser-supported audio file and export it as 16-bit PCM WAV.","audio","to-wav","audio wav converter",1,95],
  ["audio-trimmer","Audio Trimmer","audio","Trim a local audio file to a selected start and end time and export WAV.","audio","trim","audio trim cut",1,94],
  ["audio-reverser","Audio Reverser","audio","Reverse a local audio file and export the result as WAV.","audio","reverse","audio reverse",0,83],
  ["audio-normalizer","Audio Peak Normalizer","audio","Normalize a local audio file to its digital peak without clipping.","audio","normalize","audio normalize peak",1,88],
  ["audio-fade-in","Audio Fade In","audio","Apply a short fade-in to a local audio file and export WAV.","audio","fade-in","audio fade in",0,80],
  ["audio-fade-out","Audio Fade Out","audio","Apply a short fade-out to a local audio file and export WAV.","audio","fade-out","audio fade out",0,80],
  ["audio-to-mono","Audio to Mono Converter","audio","Downmix a local audio file to one mono channel and export WAV.","audio","mono","audio mono downmix",0,84],
  ["audio-to-stereo","Audio to Stereo Converter","audio","Convert a mono local audio file to two identical stereo channels and export WAV.","audio","stereo","audio stereo converter",0,82],
  ["audio-peak-meter","Audio Peak Meter","audio","Measure the maximum digital peak level of a local audio file.","audio","peak","audio peak meter dbfs",0,85],
  ["audio-rms-meter","Audio RMS Meter","audio","Measure the average RMS level of a local audio file.","audio","rms","audio rms meter loudness",0,85],
  ["audio-silence-detector","Audio Silence Detector","audio","Estimate silent time in a local audio file using a transparent amplitude threshold.","audio","silence","audio silence detector",0,86],
  ["audio-channel-balance","Audio Channel Balance Checker","audio","Compare left and right RMS levels in a local stereo file.","audio","channel-balance","audio stereo balance channels",0,82],
  ["audio-dc-offset-checker","Audio DC Offset Checker","audio","Measure the average sample offset of a local audio file.","audio","dc-offset","audio dc offset checker",0,80],
]);

// Media expansion: browser-local video utilities plus honest placeholders for
// source-platform downloads/transcription that require dedicated processing services.
add([
  ["video-file-inspector","Video File Inspector","video","Inspect duration, dimensions, aspect ratio, size, and MIME type from a local video.","video","inspect","video file metadata inspector",1,91,"n"],
  ["video-duration-tool","Video Duration Tool","video","Read the exact playable duration of a local video file.","video","duration","video duration length",0,84],
  ["video-dimensions-tool","Video Dimensions Tool","video","Read the intrinsic width and height of a local video.","video","dimensions","video width height resolution",0,84],
  ["video-aspect-ratio-tool","Video Aspect Ratio Tool","video","Calculate the reduced aspect ratio from a local video's dimensions.","video","aspect-ratio","video aspect ratio dimensions",0,82],
  ["video-thumbnail-extractor","Video Thumbnail Extractor","video","Capture a JPEG thumbnail from a selected timestamp in a local video.","video","thumbnail","video thumbnail frame extractor",1,94],
  ["video-audio-extractor","Extract Audio from Video","video","Extract the audio track from a local video using browser media capture when supported.","video","extract-audio","video audio extractor convert",1,97],
  ["video-poster-generator","Video Poster Generator","video","Generate a poster image from a selected frame of a local video.","video","thumbnail","video poster frame",0,80],
  ["video-frame-preview","Video Frame Preview","video","Capture a still frame from a local video for quick preview or sharing.","video","thumbnail","video frame snapshot preview",0,78],
  ["video-frame-png","Video Frame to PNG","video","Capture a selected local video frame as a downloadable PNG.","video","frame-png","video frame png extract",0,84],
  ["video-frame-percent","Video Frame by Percentage","video","Capture a frame from a local video by percentage through its duration.","video","frame-percent","video frame percentage snapshot",0,82],
  ["video-frame-contact-sheet","Video Frame Contact Sheet","video","Generate a 9-frame contact sheet from a local video.","video","frame-grid","video contact sheet storyboard frames",0,88],
  ["video-metadata-json","Video Metadata JSON","video","Export basic browser-readable local video metadata as JSON.","video","metadata-json","video metadata json export",0,86],
  ["video-bitrate-estimator","Video Bitrate Estimator","video","Estimate average video file bitrate from local file size and playable duration.","video","bitrate-estimator","video bitrate calculator estimate",0,83],
  ["video-audio-track-checker","Video Audio Track Checker","video","Check whether the browser exposes an audio track from a local video.","video","audio-track-check","video audio track checker",0,80],
  ["media-runtime-inspector","Media Runtime Inspector","video","Inspect browser, native, server, and FFmpeg media-processing runtime availability.","video","media-runtime-inspector","media runtime ffmpeg processing",0,44],
  ["ffmpeg-runtime-checker","FFmpeg Runtime Checker","video","Check whether an FFmpeg processing runtime has been configured; no fake conversion is performed.","video","ffmpeg-runtime-checker","ffmpeg runtime wasm media",0,43],
  ["media-backend-checker","Media Backend Checker","video","Check whether an enV server media-processing endpoint is configured.","video","media-backend-checker","media backend server processing",0,42],
  ["url-media-inspector","URL Media Inspector","video","Inspect supported public media URLs for title, uploader, duration, thumbnail, codecs, resolution, and available formats without downloading the media.","custom","url-media-inspector","url media metadata inspector info formats",0,95,"n"],
  ["video-url-downloader","Video URL Downloader","video","Download media from a supported public video URL when the enV media service is available.","custom","video-url-downloader","video url downloader",1,96,"p"],
  ["youtube-video-downloader","YouTube Video Downloader","video","Download a video from a YouTube URL when a compliant media-processing service is available.","custom","youtube-downloader","youtube video downloader",1,99,"p"],
  ["tiktok-video-downloader","TikTok Video Downloader","video","Download a TikTok video from a supported public URL when the media service is available.","custom","tiktok-downloader","tiktok video downloader",1,97,"p"],
  ["facebook-video-downloader","Facebook Video Downloader","video","Download a supported public Facebook video URL through the enV media service.","custom","facebook-downloader","facebook video downloader",1,94,"p"],
  ["instagram-video-downloader","Instagram Video Downloader","video","Download supported public Instagram video media through the enV media service.","custom","instagram-downloader","instagram video downloader",0,91,"p"],
  ["x-video-downloader","X Video Downloader","video","Download supported public X video media through the enV media service.","custom","x-downloader","x twitter video downloader",0,86,"p"],
  ["video-to-text","Video to Text","video","Transcribe speech from a video using a real speech-to-text model when configured.","custom","video-to-text","video transcription speech text",1,99,"p"],
  ["video-to-subtitles","Video to Subtitles","video","Create timed subtitles from video speech using a real transcription pipeline when configured.","custom","video-to-subtitles","video subtitles srt captions",1,96,"p"],
  ["video-compressor","Video Compressor","video","Compress video locally when the browser processing pipeline is available.","custom","vcompress","compress video",0,92,"p"],
  ["video-to-gif","Video to GIF","video","Convert a video segment to an animated GIF using the media processing pipeline.","custom","vtogif","gif video",0,90,"p"],
  ["video-cropper","Video Cropper","video","Crop a video to a chosen frame region using the media processing pipeline.","custom","vcrop","crop video",0,88,"p"],
  ["video-trimmer","Video Trimmer","video","Trim a video to a selected start and end time using the media processing pipeline.","custom","vtrim","trim video cut",0,93,"p"],
  ["video-merger","Video Merger","video","Join multiple video files in sequence using the enV FFmpeg media processor.","custom","video-merge","merge join video ffmpeg",0,90,"p"],
  ["video-audio-replacer","Replace Video Audio","video","Replace a video’s audio track with a selected audio file using the enV FFmpeg media processor.","custom","video-replace-audio","replace swap video audio ffmpeg",0,89,"p"],
  ["video-to-mp4","Video to MP4","video","Convert a local video to MP4 using the enV FFmpeg media processor when configured.","custom","video-to-mp4","video mp4 convert ffmpeg",1,99,"p"],
  ["video-to-mp3","Video to MP3","video","Convert a local video to MP3 using the enV FFmpeg media processor when configured.","custom","video-to-mp3","video mp3 audio convert ffmpeg",1,98,"p"],
  ["video-to-gif","Video to GIF","video","Convert a local video to an animated GIF using the enV FFmpeg media processor when configured.","custom","video-to-gif","video gif convert animation ffmpeg",0,94,"p"],
  ["video-to-webm","Video to WebM","video","Convert a local video to WebM using the enV FFmpeg media processor when configured.","custom","video-to-webm","video webm convert ffmpeg",0,92,"p"],
  ["video-to-mov","Video to MOV","video","Convert a local video to QuickTime MOV using the enV FFmpeg media processor when configured.","custom","video-to-mov","video mov quicktime convert ffmpeg",0,88,"p"],
  ["video-to-avi","Video to AVI","video","Convert a local video to AVI using the enV FFmpeg media processor when configured.","custom","video-to-avi","video avi convert ffmpeg",0,84,"p"],
  ["video-resize","Video Resizer","video","Resize a video to exact dimensions with FFmpeg while preserving aspect ratio with padding.","custom","video-resize","video resize dimensions ffmpeg",0,90,"p"],
  ["video-crop","Video Cropper","video","Crop a video to a selected rectangle using the FFmpeg media processor.","custom","video-crop","video crop trim ffmpeg",0,89,"p"],
  ["video-rotate","Video Rotator","video","Rotate a video by 90, 180, or 270 degrees using FFmpeg.","custom","video-rotate","video rotate orientation ffmpeg",0,87,"p"],
  ["video-mute","Mute Video","video","Remove the audio track from a video using the FFmpeg media processor.","custom","video-mute","video mute remove audio ffmpeg",0,86,"p"],
  ["video-fps","Video Frame Rate Converter","video","Convert a video to a selected frame rate using FFmpeg.","custom","video-fps","video fps frame rate ffmpeg",0,83,"p"],
  ["video-bitrate","Video Bitrate Converter","video","Re-encode a video at a selected video bitrate using FFmpeg.","custom","video-bitrate","video bitrate encoding ffmpeg",0,82,"p"],
  ["audio-to-flac-server","Audio to FLAC","audio","Convert a local audio file to FLAC using the enV FFmpeg media processor when configured.","custom","audio-to-flac-server","audio flac convert ffmpeg",0,88,"p"],
  ["video-speed-changer","Video Speed Changer","video","Change the playback speed of a local video and export browser-native WebM.","video","video-speed","video speed changer slow motion fast forward",0,91,"p"],
  ["media-capability-checker","Media Capability Checker","video","Check which browser media APIs are available for local processing.","video","media-capabilities","media capability browser webcodecs recorder",1,88],
  ["webcodecs-video-checker","WebCodecs Video Checker","video","Check whether WebCodecs video encoding and decoding APIs are available.","video","webcodecs-video","webcodecs video encoder decoder",0,82],
  ["webcodecs-audio-checker","WebCodecs Audio Checker","audio","Check whether WebCodecs audio encoding and decoding APIs are available.","audio","webcodecs-audio","webcodecs audio encoder decoder",0,82],
  ["mediarecorder-support-checker","MediaRecorder Support Checker","video","Check supported MediaRecorder MIME types in the current browser.","video","mediarecorder-support","media recorder codec support",0,81],
  ["video-codec-support-checker","Video Codec Support Checker","video","Inspect browser support for common browser-recordable video MIME types.","video","codec-support","video codec support webm mp4",0,84],
  ["media-worker-support-checker","Media Worker Support Checker","video","Check whether Web Workers and OffscreenCanvas are available for background media work.","video","worker-support","media worker offscreen canvas",0,79],
  ["youtube-audio-extractor","YouTube Audio Extractor","audio","Extract audio from a supported YouTube URL through the configured enV media service.","url-media","youtube","youtube audio extractor mp3",1,98],
  ["audio-to-text","Audio to Text","audio","Transcribe speech from an audio file using a real speech-to-text model when configured.","custom","audio-to-text","audio transcription speech text",1,99,"p"],
  ["audio-to-subtitles","Audio to Subtitles","audio","Create timed subtitles from an audio file using a real transcription pipeline when configured.","custom","audio-to-subtitles","audio subtitles srt captions",1,94,"p"],
  ["audio-to-mp3-server","Audio to MP3","audio","Convert a local audio file to MP3 using the enV FFmpeg media processor when configured.","custom","audio-to-mp3-server","audio mp3 convert ffmpeg",1,97,"p"],
  ["audio-to-wav-server","Audio to WAV","audio","Convert a local audio file to WAV using the enV FFmpeg media processor when configured.","custom","audio-to-wav-server","audio wav convert ffmpeg",0,92,"p"],
  ["video-resolution-presets","Video Resolution Presets","video","Export video at common 360p, 480p, 720p, 1080p, 1440p, or 4K dimensions with FFmpeg.","custom","video-resolution","video resolution 360p 480p 720p 1080p 1440p 4k ffmpeg",0,90,"p"],
  ["video-audio-volume","Video Audio Volume","video","Increase, reduce, or mute a video's audio level with FFmpeg.","custom","video-audio-volume","video volume audio gain ffmpeg",0,86,"p"],
  ["audio-volume-control","Audio Volume Control","audio","Change the volume of a local audio file with FFmpeg.","custom","audio-volume","audio volume gain loudness ffmpeg",0,86,"p"],
  ["audio-merger","Audio Merger","audio","Merge multiple audio files in sequence with the enV FFmpeg media processor.","custom","audio-merge","audio merge join concatenate ffmpeg",0,88,"p"],
  ["audio-bitrate-converter","Audio Bitrate Converter","audio","Convert a local audio file to a selected MP3 bitrate with FFmpeg.","custom","audio-bitrate","audio bitrate mp3 kbps ffmpeg",0,84,"p"],
  ["audio-sample-rate-converter","Audio Sample Rate Converter","audio","Convert a local audio file to a selected WAV sample rate with FFmpeg.","custom","audio-sample-rate","audio sample rate hz wav ffmpeg",0,82,"p"],
  ["audio-channel-converter","Audio Channel Converter","audio","Convert a local audio file between mono and stereo with FFmpeg.","custom","audio-channels","audio mono stereo channels ffmpeg",0,82,"p"],
  ["audio-to-ogg-server","Audio to OGG","audio","Convert a local audio file to OGG using the enV FFmpeg media processor when configured.","custom","audio-to-ogg-server","audio ogg opus convert ffmpeg",0,90,"p"],
]);

// PDF/document inventory.
addCross("pdf", ["PDF", "Document", "DOCX", "Spreadsheet", "Presentation", "Image"], ["Merger", "Splitter", "Compressor", "Page Extractor", "Page Reorder Tool", "Page Numbering Tool", "Watermark Tool", "Metadata Tool", "Text Extractor", "Image Extractor", "Screenshot Tool", "Comparison Tool", "Print Layout Helper"], "A {platform} utility for document workflows.");

// Creator and social platform matrix.
addCross("creators", ["YouTube", "TikTok", "Instagram", "Facebook", "X", "LinkedIn", "Twitch", "Spotify", "Apple Music", "Podcast"], ["Revenue Calculator", "Engagement Calculator", "Growth Calculator", "Content Planner", "Caption Generator", "Title Generator", "Description Generator", "Hashtag Generator", "Bio Generator", "Posting Time Helper", "Content Calendar", "Thumbnail Size Helper"], "A {platform} creator utility for planning and publishing.");
addCross("social", ["Instagram", "TikTok", "YouTube", "Facebook", "X", "LinkedIn", "Pinterest", "Snapchat", "Threads", "Reddit", "Discord", "Twitch"], ["Post Size Guide", "Story Size Guide", "Profile Size Guide", "Banner Size Guide", "Caption Helper", "Hashtag Helper", "Bio Helper", "Username Generator", "Post Mockup", "Profile Mockup", "Engagement Calculator"], "A {platform} social-media utility.");

// Business/e-commerce/marketing.
addCross("business", ["Invoice", "Receipt", "Quotation", "Estimate", "Purchase Order", "Payslip", "Expense", "Profit", "Margin", "Markup", "ROI", "Break-Even", "Cash Flow", "Salary", "Commission", "Pricing", "Inventory", "Customer Lifetime Value", "Customer Acquisition Cost", "Recurring Revenue"], ["Calculator", "Generator", "Template", "Estimator", "Planner"], "A practical {platform} business utility.");
addCross("ecommerce", ["Product", "Order", "Inventory", "Shipping", "Pricing", "Discount", "Coupon", "SKU", "Barcode", "Catalog", "Store", "Customer", "Return", "Profit", "Margin"], ["Generator", "Calculator", "Planner", "Template", "Mockup", "Helper"], "An e-commerce {platform} utility.");
addCross("marketing", ["Campaign", "Content", "Email", "Landing Page", "Product", "Brand", "Social", "SEO", "Influencer", "Affiliate", "Lead", "Sales", "Ad", "Newsletter", "Event"], ["Planner", "Generator", "Calculator", "Brief Generator", "Checklist", "Template", "Headline Helper", "CTA Generator"], "A {platform} marketing utility.");

// Random/fun/gaming.
addCross("random", ["Name", "Username", "Country", "City", "Color", "Word", "Emoji", "Date", "Time", "Number", "Decision", "Team", "Group", "Secret Santa", "Story", "Character", "Fantasy", "Gamer", "Pet", "Baby"], ["Generator", "Picker", "Randomizer", "Wheel", "List Generator"], "A fun {platform} random utility.");
addCross("gaming", ["RPG Character", "Fantasy Character", "Loot", "Encounter", "Quest", "NPC", "Guild", "Clan", "Team", "Tournament", "Score", "XP", "Damage", "Critical Hit", "Dice", "Deck", "Card", "Game Session", "Streamer"], ["Generator", "Calculator", "Randomizer", "Planner", "Tracker", "Bracket Generator"], "A {platform} utility for games and gaming communities.");

// Interactive experiences — the requested surprise/ask-out family.
addCross("interactive", ["Ask-Out", "Question", "Yes-No", "Reveal", "Surprise", "Quiz", "Memory", "Story", "Choice", "Decision", "Countdown", "Interactive Card", "Interactive Letter", "Interactive Invitation", "Interactive Message"], ["Generator", "Page Builder", "Experience Builder", "Template", "Shareable Page"], "Create a shareable interactive {platform} experience.");
addCross("relationships", ["Crush", "Ask-Out", "Valentine", "Friendship", "Couple", "Appreciation", "Confession", "Love Letter", "Compatibility", "Memory", "Question", "Surprise"], ["Generator", "Quiz", "Interactive Page", "Message Builder", "Reveal Page", "Countdown Page"], "A respectful {platform} relationship/social experience.");
addCross("celebrations", ["Birthday", "Anniversary", "Graduation", "Valentine", "Christmas", "New Year", "Congratulations", "Thank You", "Appreciation", "Farewell", "Achievement", "Party"], ["Page Generator", "Interactive Card", "Invitation Generator", "Countdown", "Memory Page", "Reveal Page", "Quiz Generator", "Surprise Page"], "Create a personalized {platform} celebration experience.");
addCross("events", ["Birthday", "Wedding", "Graduation", "Party", "Dinner", "Conference", "Workshop", "Meeting", "Webinar", "Concert", "Launch", "Fundraiser", "Sports Event"], ["Invitation Generator", "RSVP Page", "Countdown", "Schedule Builder", "Agenda Generator", "Event QR Generator", "Ticket Mockup", "Check-In Page"], "An {platform} event utility.");

// Photography/travel/food/career/personal.
addCross("photography", ["Print Size", "Crop", "Aspect Ratio", "DPI", "PPI", "Resolution", "Exposure", "Depth of Field", "FOV", "Lens", "Sensor", "Photo", "Passport Photo", "ID Photo", "Social Photo"], ["Calculator", "Planner", "Guide", "Generator", "Checker"], "A photography {platform} utility.");
addCross("travel", ["Trip Budget", "Fuel", "Distance", "Travel Time", "Timezone", "Packing", "Itinerary", "Currency", "Road Trip", "Flight Time", "Jet Lag", "Hotel Budget", "Daily Budget", "Travel Checklist"], ["Calculator", "Planner", "Generator", "Checklist", "Converter"], "A travel {platform} utility.");
addCross("food", ["Recipe", "Serving", "Ingredient", "Kitchen Unit", "Oven Temperature", "Baking", "Meal", "Grocery", "Food Cost", "Portion", "Nutrition", "Cooking Time"], ["Calculator", "Scaler", "Converter", "Planner", "Generator", "Checklist"], "A food and cooking {platform} utility.");
addCross("career", ["Resume", "CV", "Cover Letter", "Interview", "Salary", "Job", "LinkedIn", "Portfolio", "Career", "Skills", "Application", "Reference", "Achievement"], ["Generator", "Planner", "Checker", "Calculator", "Builder", "Template"], "A career {platform} utility.");
addCross("personal", ["Budget", "Habit", "Goal", "Decision", "Routine", "Checklist", "Countdown", "Reminder", "Packing", "Shopping", "Meal", "Study", "Sleep", "Time", "Life Event"], ["Planner", "Calculator", "Generator", "Tracker", "Checklist", "Countdown"], "A personal {platform} utility.");

// Personal Utilities are browser-local and use the dedicated PersonalEngine.
// Every generated Personal tool gets a concrete operation instead of a placeholder.
for (const tool of RAW) {
  if (tool[2] !== "personal") continue;
  tool[3] = `Create, calculate, generate, track, checklist, or count down a ${tool[1].replace(/^(.*?) (Planner|Calculator|Generator|Tracker|Checklist|Countdown)$/, "$1").toLowerCase()} workflow locally.`;
  tool[4] = "custom";
  tool[5] = tool[0];
  tool[9] = "";
}


// Accessibility/communication/streaming.
addCross("accessibility", ["Contrast", "Color Blindness", "Font Size", "Line Height", "Text Readability", "Alt Text", "ARIA", "Form", "Keyboard Navigation", "Focus State", "Accessible Color", "Motion"], ["Checker", "Generator", "Simulator", "Helper", "Preview"], "An accessibility {platform} utility.");
addCross("communication", ["Email", "Message", "SMS", "Meeting", "Agenda", "Minutes", "Signature", "Invitation", "Announcement", "Thank You", "Follow Up", "Reminder"], ["Generator", "Template", "Builder", "Planner", "Formatter"], "A communication {platform} utility.");
addCross("streaming", ["YouTube Live", "Twitch", "TikTok Live", "Instagram Live", "Facebook Live", "Kick", "Podcast Live"], ["Bitrate Calculator", "Resolution Helper", "Stream Schedule", "Title Generator", "Description Generator", "Overlay Planner", "Stream Checklist", "Revenue Calculator", "Aspect Ratio Helper"], "A streaming {platform} utility.");

// More image/video/audio families.
addCross("video", ["YouTube", "TikTok", "Instagram", "Facebook", "X", "LinkedIn", "Pinterest", "Snapchat", "Twitch", "Discord"], ["Video Size Calculator", "Aspect Ratio Helper", "Bitrate Calculator", "FPS Calculator", "Thumbnail Size Helper", "Caption Helper", "Subtitle Helper", "Duration Calculator", "Frame Calculator", "Export Preset"], "A {platform} video utility.");
addCross("audio", ["Podcast", "YouTube", "TikTok", "Instagram", "Spotify", "Apple Music", "Twitch", "Discord"], ["Audio File Size Calculator", "Bitrate Calculator", "Sample Rate Helper", "Loudness Helper", "BPM Helper", "Metadata Helper", "Export Preset", "Format Guide"], "An {platform} audio utility.");

// Mockup/screenshot families.
addCross("mockups", ["WhatsApp", "iMessage", "Instagram DM", "Messenger", "Telegram", "Discord", "Snapchat", "X DM", "Google Messages", "SMS", "Signal", "Slack", "LinkedIn DM", "Reddit Chat", "TikTok Chat", "Threads DM", "AI Chat", "Email", "Gmail", "Outlook"], ["Chat Mockup", "Group Chat Mockup", "Voice Note Mockup", "Video Call Mockup", "Notification Mockup", "Typing Indicator Mockup", "Read Receipt Mockup", "Conversation Mockup"], "A clearly labeled fictional {platform} mockup.");
addCross("screenshots", ["iPhone", "Android", "iPad", "Tablet", "MacBook", "Laptop", "Desktop", "Apple Watch", "Chrome", "Safari", "Firefox", "Edge", "Google Search", "App Store", "Google Play"], ["Screenshot Frame", "Screenshot Mockup", "Screenshot Beautifier", "Device Presentation", "Device Collage", "Screenshot Annotation", "Screenshot Redaction"], "A screenshot presentation utility for {platform}.");

// Ensure the catalog is comfortably above 3,000 entries.


// Planned (honest inventory — not counted as available)
add([
  ["background-remover","Background Remover","image","Remove simple solid-color backgrounds locally. Best for clean, flat or studio-style backgrounds.","image","background-remover","remove background local",0,50],
  ["image-upscaler","Image Upscaler","image","Upscale images locally with high-quality browser interpolation; no upload required.","image","upscaler","upscale resize image",0,48],
  ["heic-converter","HEIC Converter","image","Convert HEIC/HEIF when your browser provides native decoding support.","image","heic","heic heif convert",0,40],
  ["pdf-to-word","PDF to Word","pdf","Full PDF→DOCX conversion needs a server-side pipeline.","pdf","pdf-word","pdf word docx",0,45,"p"],
  ["ocr-tool","OCR","pdf","On-device OCR needs a large WASM model.","pdf","ocr","ocr scan text",0,44,"p"],
  ["video-compressor","Video Compressor","video","FFmpeg WASM is large; loaded only when this ships.","custom","vcompress","compress video",0,42,"p"],
  ["video-to-gif","Video to GIF","video","Requires FFmpeg WASM.","custom","vtogif","gif video",0,40,"p"],
  ["audio-joiner","Audio Joiner","audio","Needs decoded audio buffers and an encoder.","custom","ajoin","join audio",0,38,"p"],
  ["whois-lookup","WHOIS Lookup","network","Requires a server-side WHOIS gateway.","custom","whois","whois domain",0,36,"p"],
  ["dns-lookup","DNS Lookup","network","Requires a DNS-over-HTTPS gateway.","custom","dns","dns lookup",0,36,"p"],
  ["website-screenshot","Website Screenshot","network","Requires a headless browser on a server.","custom","webscreenshot","website screenshot",0,35,"p"],
]);


// Systematic STEM/math exercise expansion. These are real formula-driven tools
// registered by math-exercise-calculators.ts. Keep the catalog in sync with the
// executable registry by deriving IDs from the source spec keys/targets.
const mathExerciseRows = [
  ["linear", ["m","x","b","y"]], ["distance", ["d","r","t"]], ["acceleration", ["a","v","u","t"]],
  ["force", ["F","m","a"]], ["work", ["W","F","d"]], ["power", ["P","W","t"]], ["ke", ["E","m","v"]],
  ["pe", ["E","m","g","h"]], ["density", ["rho","m","V"]], ["pressure", ["p","F","A"]], ["ohm", ["V","I","R"]],
  ["electrical-power", ["P","V","I"]], ["charge", ["Q","I","t"]], ["wave-speed", ["v","f","lambda"]], ["frequency-period", ["f","T"]],
  ["heat", ["Q","m","c","deltaT"]], ["ideal-gas", ["P","V","n","R","T"]], ["simple-interest", ["I","P","r","t"]],
  ["compound-growth", ["A","P","r","n","t"]], ["cagr", ["A","P","t","cagr"]], ["rectangle-area", ["A","l","w"]],
  ["triangle-area", ["A","b","h"]], ["circle-area", ["A","r"]], ["circle-circumference", ["C","r"]], ["sphere-volume", ["V","r"]],
  ["cylinder-volume", ["V","r","h"]], ["cone-volume", ["V","r","h"]], ["trapezoid-area", ["A","a","b","h"]], ["pythagorean", ["c","a","b"]],
  ["slope", ["m"]], ["distance-coordinate", ["d"]], ["midpoint-x", ["mx"]], ["midpoint-y", ["my"]],
  ["arithmetic-sequence", ["an","a1","d","n"]], ["arithmetic-sum", ["S","n","a1","an"]], ["geometric-sequence", ["an","a1","r","n"]],
  ["geometric-sum", ["S"]], ["simple-average", ["x","w"]], ["z-score", ["z","x","mu","sigma"]], ["variance-population", ["sigma2","sumSq","N"]],
  ["standard-error", ["SE","s","n"]], ["binomial-probability", ["P"]], ["percentage-score", ["percent","earned","total"]], ["unit-price", ["unit","price","qty"]],
  ["markup-price", ["price","cost","markup"]], ["break-even", ["units"]], ["molarity", ["M","moles","V"]], ["moles", ["n","m","MM"]],
  ["pH", ["pH","H"]], ["faraday", ["E","V","Q"]], ["torque", ["tau","F","r"]], ["angular-speed", ["omega","theta","t"]],
  ["centripetal", ["F","m","v","r"]], ["momentum", ["p","m","v"]], ["impulse", ["J","F","dt"]], ["spring", ["F","k","x"]],
  ["frequency-cycle", ["f","N","t"]], ["efficiency", ["eta","useful","input"]], ["power-factor", ["pf","P","S"]], ["wavelength", ["lambda","v","f"]],
  ["lens", ["f","u","v"]], ["snell", ["n1","theta1","n2","theta2"]],
];

const calculusAndStatisticsRows = [
  ["derivative-power", ["D"]], ["derivative-linear", ["D","m"]], ["derivative-exponential", ["D"]], ["derivative-natural-log", ["D","x"]],
  ["derivative-sine", ["D"]], ["derivative-cosine", ["D"]], ["integral-power", ["I"]], ["integral-linear", ["I"]],
  ["integral-exponential", ["I"]], ["definite-integral-linear", ["I"]], ["trapezoidal-integral", ["I"]], ["average-value-function", ["avg","I"]],
  ["annuity-future-value", ["FV","PMT"]], ["annuity-present-value", ["PV","PMT"]], ["present-value", ["PV","FV","r","n"]], ["apy", ["APY","r"]],
  ["sample-variance", ["s2","sumSq","n"]], ["covariance", ["cov","sum","n"]], ["standard-score-from-raw", ["z","x","mu","sigma"]],
  ["confidence-margin", ["E","z","sigma","n"]],
];
for (const [key, targets] of calculusAndStatisticsRows) {
  for (const target of targets) {
    RAW.push([
      `math-exercise-${key}-${target}`,
      `${key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Solve for ${target}`,
      "calculators",
      `Formula exercise calculator for ${key.replace(/-/g, " ")}, solving for ${target}.`,
      "calculator",
      `exercise-${key}-${target}`,
      `math exercise formula ${key} solve ${target} calculus statistics STEM`,
      0, 66, "n",
    ]);
  }
}

const advancedMathExerciseRows = [
  ["quadratic-discriminant", ["D"]], ["quadratic-root", ["x"]], ["vertex-x", ["h","b","a"]], ["vertex-y", ["k","c","a","b"]],
  ["trig-sine", ["sin","opposite","hypotenuse"]], ["trig-cosine", ["cos","adjacent","hypotenuse"]], ["trig-tangent", ["tan","opposite","adjacent"]], ["law-of-sines", ["a","b","A","B"]], ["law-of-cosines", ["c","a","b","C"]],
  ["arc-length", ["s","r","theta"]], ["sector-area", ["A","r","theta"]], ["rectangular-prism-volume", ["V","l","w","h"]], ["cylinder-surface-area", ["A","h","r"]], ["sphere-surface-area", ["A","r"]], ["prism-surface-area", ["A","base","perimeter","h"]], ["rectangle-diagonal", ["d","l","w"]], ["triangle-perimeter", ["P","a","b","c"]], ["heron-area", ["A"]],
  ["percent-error", ["error","experimental","accepted"]], ["relative-error", ["error","absolute","true"]], ["scientific-notation", ["x","m","e"]], ["log-product", ["L"]], ["exponential-growth", ["A","P","r","t"]], ["doubling-time", ["t","r"]], ["arithmetic-mean", ["mean","sum","n"]], ["geometric-mean", ["mean","product","n"]], ["range-statistic", ["range","max","min"]], ["coefficient-variation", ["cv","sd","mean"]], ["odds-probability", ["p","odds"]], ["probability-complement", ["p","q"]], ["permutation", ["P"]], ["combination", ["C"]],
  ["simple-linear-regression", ["y","m","x","b"]], ["vector-magnitude", ["mag","x","y"]], ["vector-dot", ["dot"]], ["work-angle", ["W","F","d"]], ["gravitational-force", ["F","m1","m2","r"]], ["kinematic-displacement", ["s","u","t","a"]], ["kinematic-final-velocity", ["v","u","a","s"]], ["ideal-efficiency", ["eta","out","in"]], ["electric-resistance-series", ["R","R1","R2","R3"]], ["electric-resistance-parallel", ["R","R1","R2"]], ["electrical-energy", ["E","P","t"]], ["heat-temperature-change", ["deltaT","Q","m","c"]], ["concentration-percent", ["percent","solute","solution"]], ["dilution", ["C1","V1","C2","V2"]], ["molarity-from-mass", ["M","m","MM","V"]], ["gas-density", ["rho","P","MM","T"]],
];
for (const [key, targets] of advancedMathExerciseRows) {
  for (const target of targets) {
    RAW.push([
      `math-exercise-${key}-${target}`,
      `${key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Solve for ${target}`,
      "calculators",
      `Formula exercise calculator for ${key.replace(/-/g, " ")}, solving for ${target}.`,
      "calculator",
      `exercise-${key}-${target}`,
      `math exercise formula ${key} solve ${target} algebra STEM`,
      0, 64, "n",
    ]);
  }
}

for (const [key, targets] of mathExerciseRows) {
  for (const target of targets) {
    RAW.push([
      `math-exercise-${key}-${target}`,
      `${key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Solve for ${target}`,
      "calculators",
      `Formula exercise calculator for ${key.replace(/-/g, " ")}, solving for ${target}. Shows the computed unknown from the remaining values.`,
      "calculator",
      `exercise-${key}-${target}`,
      `math exercise formula ${key} solve ${target} algebra STEM`,
      0,
      62,
      "n",
    ]);
  }
}


const expansionData = JSON.parse(readFileSync(new URL("../src/data/math-expansion.json", import.meta.url), "utf8"));
for (const [family, rows] of Object.entries(expansionData)) {
  for (const [key, aLabel, bLabel, cLabel] of rows) {
    for (const target of ["a", "b", "c"]) {
      const op = `exp-${family}-${key}-${target}`;
      RAW.push([
        `math-${op}`,
        `${String(aLabel).replace(/\b\w/g, c => c.toUpperCase())} / ${String(bLabel).replace(/\b\w/g, c => c.toUpperCase())} — Solve for ${target}`,
        "calculators",
        `Formula exercise calculator: ${cLabel} = ${aLabel} ${family === "product" ? "×" : family === "sum" ? "+" : "÷"} ${bLabel}. Solve for the selected unknown.`,
        "calculator",
        op,
        `math exercise formula ${family} ${key} solve ${target}`,
        0,
        58,
        "n",
      ]);
    }
  }
}

const deepStemRows = [
  ["calculus-second-derivative-power","Second Derivative Power Calculator","calculus second derivative power rule","calculus derivative second derivative",78],
  ["calculus-chain-power","Chain Rule Power Calculator","calculus chain rule derivative","calculus chain rule power",76],
  ["calculus-mean-value-slope","Average Rate of Change Calculator","calculus average rate slope","calculus average rate change",74],
  ["calculus-newton-iteration","Newton Iteration Calculator","calculus newton root iteration","newton method numerical",72],
  ["calculus-rectangular-integration","Rectangular Integration Calculator","calculus numerical integration","riemann sum integral",70],
  ["math-matrix-2x2-determinant","2×2 Matrix Determinant Calculator","math matrix determinant","linear algebra matrix determinant",80],
  ["math-matrix-2x2-inverse","2×2 Matrix Inverse Calculator","math matrix inverse","linear algebra matrix inverse",78],
  ["math-vector-3d-magnitude","3D Vector Magnitude Calculator","math vector magnitude","linear algebra vector 3d",75],
  ["math-vector-3d-dot","3D Vector Dot Product Calculator","math vector dot product","linear algebra vector 3d",73],
  ["math-vector-angle","Vector Angle Calculator","math vector angle","linear algebra vector angle",71],
  ["physics-electric-force","Electric Force Calculator","physics electric force charge","coulomb law",78],
  ["physics-electric-field-point-charge","Point-Charge Electric Field Calculator","physics electric field charge","coulomb electric field",77],
  ["physics-electric-potential-point-charge","Point-Charge Electric Potential Calculator","physics electric potential","electric potential charge",75],
  ["physics-magnetic-force-charge","Magnetic Force on Charge Calculator","physics magnetic force charge","lorentz force",77],
  ["physics-magnetic-force-wire","Magnetic Force on Wire Calculator","physics magnetic force wire","ampere force",75],
  ["physics-induction-emf","Faraday Induction EMF Calculator","physics induction emf","faraday law",74],
  ["physics-capacitor-charge","Capacitor Charge Calculator","physics capacitor charge","electric charge capacitance",72],
  ["physics-capacitor-voltage","Capacitor Voltage Calculator","physics capacitor voltage","electric charge capacitance",70],
  ["physics-resistivity","Electrical Resistivity Calculator","physics resistivity resistance","materials electrical resistivity",74],
  ["physics-doppler-observed-frequency","Doppler Observed Frequency Calculator","physics doppler frequency","doppler effect",72],
  ["mechanical-shaft-power-from-rpm","Torque from Shaft Power Calculator","mechanical torque power rpm","shaft torque",76],
  ["mechanical-gear-output-torque","Gear Output Torque Calculator","mechanical gear torque","gear ratio torque",74],
  ["mechanical-gear-contact-ratio","Gear Circular Pitch Calculator","mechanical gear pitch","gear teeth diameter",68],
  ["mechanical-shaft-angle-of-twist","Shaft Angle of Twist Calculator","mechanical torsion twist shaft","angle of twist",76],
  ["mechanical-torsional-shear-stress","Torsional Shear Stress Calculator","mechanical torsion shear stress","shaft torsion",76],
  ["mechanical-bearing-life","Bearing Life Calculator","mechanical bearing life","bearing rating life",74],
  ["mechanical-bolt-preload-from-torque","Bolt Preload from Torque Calculator","mechanical bolt preload torque","fastener preload",72],
  ["mechanical-bending-stress","Bending Stress Calculator","mechanical bending stress","beam bending",80],
  ["mechanical-deflection-cantilever-end-load","Cantilever End-Load Deflection Calculator","mechanical cantilever deflection","beam deflection",78],
  ["mechanical-deflection-simply-supported-center-load","Simply Supported Beam Deflection Calculator","mechanical beam deflection","simply supported beam",78],
  ["fluid-bernoulli-velocity","Bernoulli Velocity Calculator","fluid bernoulli velocity","fluid mechanics bernoulli",76],
  ["fluid-darcy-friction-factor-laminar","Laminar Darcy Friction Factor Calculator","fluid darcy friction factor","pipe flow laminar",72],
  ["fluid-hydraulic-power","Hydraulic Pump Power Calculator","fluid hydraulic pump power","pump head flow",78],
  ["fluid-hydraulic-diameter","Hydraulic Diameter Calculator","fluid hydraulic diameter","duct pipe flow",70],
  ["thermal-radiation-power","Thermal Radiation Power Calculator","thermal radiation power","stefan boltzmann",74],
  ["thermal-heat-exchanger-lmtd","Heat Exchanger LMTD Calculator","thermal heat exchanger lmtd","heat transfer",78],
  ["thermal-heat-exchanger-duty","Heat Exchanger Duty Calculator","thermal heat exchanger duty","heat transfer ua",76],
  ["thermal-hvac-sensible-load","HVAC Sensible Load Calculator","thermal hvac sensible load","air conditioning load",78],
  ["thermal-hvac-air-changes-per-hour","HVAC Air Changes per Hour Calculator","thermal hvac ach","air changes ventilation",70],
  ["electrical-ac-power-factor-correction-capacitor","Power Factor Correction Capacitor Calculator","electrical power factor capacitor","reactive compensation",80],
  ["electrical-transformer-secondary-voltage","Transformer Secondary Voltage Calculator","electrical transformer voltage","transformer turns ratio",76],
  ["electrical-transformer-current","Transformer Secondary Current Calculator","electrical transformer current","transformer power",74],
  ["electrical-voltage-drop-percent","Voltage Drop Percentage Calculator","electrical voltage drop","wire voltage drop",72],
  ["control-first-order-step-response","First-Order Step Response Calculator","control systems first order response","control step response",76],
  ["control-first-order-time-to-percent","First-Order Settling-Time Calculator","control systems time constant","first order response",74],
  ["control-damping-ratio","Damping Ratio from Overshoot Calculator","control systems damping ratio","second order overshoot",74],
  ["automotive-wheel-torque-from-engine","Automotive Wheel Torque Calculator","automotive wheel torque","gear final drive",78],
  ["automotive-wheel-speed-from-rpm","Automotive Vehicle Speed from RPM Calculator","automotive speed rpm tire","vehicle speed gearing",76],
  ["automotive-braking-force","Automotive Braking Force Calculator","automotive braking force","vehicle dynamics",72],
  ["automotive-stopping-distance","Automotive Stopping Distance Calculator","automotive stopping distance","reaction braking distance",78],
  ["civil-hydrostatic-force-vertical-wall","Hydrostatic Force on Vertical Wall Calculator","civil hydrostatic force","water retaining wall",74],
  ["civil-earthwork-trapezoidal-volume","Earthwork Trapezoidal Volume Calculator","civil earthwork volume","end area method",72],
  ["civil-concrete-weight","Concrete Mass and Weight Calculator","civil concrete weight","concrete density",70],
];
for (const [id,name,desc,keywords,popularity] of deepStemRows) RAW.push([id,name,"calculators",desc,"calculator",id,keywords,0,popularity,"n"]);


const seen = new Set();

// v9 practical calculator expansion
add([
  ["work-hours-calculator","Work Hours Calculator","calculators","Calculate paid hours from a shift and break.","calculator","work-hours-calculator","work hours shift payroll",0,68,"n"],
  ["overtime-pay-calculator","Overtime Pay Calculator","calculators","Calculate overtime earnings above a weekly threshold.","calculator","overtime-pay-calculator","overtime salary payroll",0,68,"n"],
  ["hourly-to-salary-calculator","Hourly to Annual Salary Calculator","calculators","Convert hourly pay to annual pay from working hours and weeks.","calculator","hourly-to-salary-calculator","salary wage income",0,68,"n"],
  ["salary-to-hourly-calculator","Annual Salary to Hourly Calculator","calculators","Convert annual salary to hourly pay.","calculator","salary-to-hourly-calculator","salary wage income",0,68,"n"],
  ["rent-affordability-calculator","Rent Affordability Calculator","calculators","Estimate rent from income and a target housing percentage.","calculator","rent-affordability-calculator","rent housing budget",0,68,"n"],
  ["budget-category-calculator","Budget Category Calculator","calculators","Allocate a monthly budget by percentage.","calculator","budget-category-calculator","budget money",0,68,"n"],
  ["savings-goal-calculator","Savings Goal Calculator","calculators","Calculate monthly savings needed to reach a target.","calculator","savings-goal-calculator","savings goal",0,68,"n"],
  ["debt-to-income-calculator","Debt-to-Income Calculator","calculators","Calculate debt-to-income ratio.","calculator","debt-to-income-calculator","debt finance",0,68,"n"],
  ["net-worth-calculator","Net Worth Calculator","calculators","Calculate net worth from assets and liabilities.","calculator","net-worth-calculator","net worth finance",0,68,"n"],
  ["savings-rate-calculator","Savings Rate Calculator","calculators","Calculate savings as a percentage of income.","calculator","savings-rate-calculator","savings finance",0,68,"n"],
  ["discount-stack-calculator","Stacked Discount Calculator","calculators","Apply two sequential discounts.","calculator","discount-stack-calculator","shopping discount price",0,68,"n"],
  ["unit-price-calculator","Unit Price Calculator","calculators","Compare the cost per unit of a product.","calculator","unit-price-calculator","shopping unit price",0,68,"n"],
  ["tip-split-calculator","Tip and Split Calculator","calculators","Calculate tip and split a bill.","calculator","tip-split-calculator","tip restaurant split",0,68,"n"],
  ["recipe-scale-calculator","Recipe Scaling Calculator","calculators","Scale recipe quantities to a new serving count.","calculator","recipe-scale-calculator","recipe cooking food",0,68,"n"],
  ["bmi-calculator-metric","BMI Calculator (Metric)","calculators","Calculate body mass index from metric measurements.","calculator","bmi-calculator-metric","health bmi",0,68,"n"],
  ["body-surface-area-calculator","Body Surface Area Calculator","calculators","Estimate body surface area using Mosteller formula.","calculator","body-surface-area-calculator","health bsa",0,68,"n"],
  ["calorie-deficit-calculator","Calorie Deficit Calculator","calculators","Estimate daily calorie intake from maintenance and deficit.","calculator","calorie-deficit-calculator","health calories",0,68,"n"],
  ["protein-intake-calculator","Protein Intake Calculator","calculators","Estimate protein intake from body weight and a target multiplier.","calculator","protein-intake-calculator","fitness protein",0,68,"n"],
  ["pace-conversion-calculator","Running Pace Conversion Calculator","calculators","Convert pace and speed between km and miles.","calculator","pace-conversion-calculator","running pace fitness",0,68,"n"],
  ["body-mass-index-percent-calculator","BMI Weight-at-Height Calculator","calculators","Calculate weight corresponding to a target BMI.","calculator","body-mass-index-percent-calculator","bmi health",0,68,"n"],
  ["sleep-duration-calculator","Sleep Duration Calculator","calculators","Calculate sleep duration between bedtime and wake time.","calculator","sleep-duration-calculator","sleep health time",0,68,"n"],
  ["right-triangle-calculator","Right Triangle Calculator","calculators","Calculate a missing side and angle of a right triangle.","calculator","right-triangle-calculator","geometry triangle",0,68,"n"],
  ["herons-formula-calculator","Heron Formula Calculator","calculators","Calculate triangle area from three sides.","calculator","herons-formula-calculator","geometry triangle",0,68,"n"],
  ["regular-polygon-calculator","Regular Polygon Calculator","calculators","Calculate area and perimeter of a regular polygon.","calculator","regular-polygon-calculator","geometry polygon",0,68,"n"],
  ["arc-length-calculator","Arc Length Calculator","calculators","Calculate arc length from radius and central angle.","calculator","arc-length-calculator","geometry circle arc",0,68,"n"],
  ["sector-area-calculator","Sector Area Calculator","calculators","Calculate area of a circular sector.","calculator","sector-area-calculator","geometry circle sector",0,68,"n"],
  ["trapezoid-calculator","Trapezoid Calculator","calculators","Calculate trapezoid area from parallel sides and height.","calculator","trapezoid-calculator","geometry trapezoid",0,68,"n"],
  ["parallelogram-calculator","Parallelogram Calculator","calculators","Calculate area from base, side and included angle.","calculator","parallelogram-calculator","geometry parallelogram",0,68,"n"],
  ["distance-between-points-calculator","Distance Between Two Points Calculator","calculators","Calculate 2D distance between two points.","calculator","distance-between-points-calculator","geometry coordinate",0,68,"n"],
  ["midpoint-calculator","Midpoint Calculator","calculators","Find the midpoint between two 2D points.","calculator","midpoint-calculator","geometry coordinate",0,68,"n"],
  ["slope-calculator","Slope Calculator","calculators","Calculate slope and intercept from two points.","calculator","slope-calculator","geometry algebra",0,68,"n"],
  ["range-calculator","Range Calculator","calculators","Find range, minimum, and maximum of a list.","calculator","range-calculator","statistics data",0,68,"n"],
  ["quartile-calculator","Quartile Calculator","calculators","Calculate Q1, median, and Q3 using the median-of-halves method.","calculator","quartile-calculator","statistics quartile",0,68,"n"],
  ["percentile-calculator","Percentile Calculator","calculators","Estimate a percentile using linear interpolation.","calculator","percentile-calculator","statistics percentile",0,68,"n"],
  ["weighted-average-calculator","Weighted Average Calculator","calculators","Calculate weighted average from paired values and weights.","calculator","weighted-average-calculator","statistics weighted",0,68,"n"],
  ["z-score-calculator","Z-Score Calculator","calculators","Calculate a z-score from a value, mean and standard deviation.","calculator","z-score-calculator","statistics z score",0,68,"n"],
  ["future-value-lump-sum-calculator","Future Value Lump Sum Calculator","calculators","Calculate future value of a lump-sum investment.","calculator","future-value-lump-sum-calculator","finance investment",0,68,"n"],
  ["present-value-calculator","Present Value Calculator","calculators","Discount a future amount to present value.","calculator","present-value-calculator","finance investment",0,68,"n"],
  ["payback-period-calculator","Payback Period Calculator","calculators","Calculate simple payback period from investment and annual cash flow.","calculator","payback-period-calculator","business finance",0,68,"n"],
  ["gross-margin-calculator","Gross Margin Calculator","calculators","Calculate gross profit and gross margin.","calculator","gross-margin-calculator","business finance",0,68,"n"],
  ["markup-from-margin-calculator","Markup from Margin Calculator","calculators","Convert gross margin percentage to markup percentage.","calculator","markup-from-margin-calculator","business pricing",0,68,"n"],
  ["conversion-rate-calculator","Conversion Rate Calculator","calculators","Calculate conversion rate from visitors and conversions.","calculator","conversion-rate-calculator","marketing business",0,68,"n"],
  ["lead-to-customer-calculator","Lead to Customer Funnel Calculator","calculators","Calculate customers from leads and conversion rates.","calculator","lead-to-customer-calculator","marketing sales",0,68,"n"],
  ["break-even-revenue-calculator","Break-Even Revenue Calculator","calculators","Calculate break-even revenue from fixed costs and contribution margin.","calculator","break-even-revenue-calculator","business break even",0,68,"n"],
  ["battery-runtime-calculator","Battery Runtime Calculator","calculators","Estimate battery runtime from capacity and load.","calculator","battery-runtime-calculator","battery electronics",0,68,"n"],
  ["battery-energy-calculator","Battery Energy Calculator","calculators","Calculate battery energy from voltage and capacity.","calculator","battery-energy-calculator","battery energy",0,68,"n"],
  ["led-resistor-calculator","LED Series Resistor Calculator","calculators","Calculate resistor needed for an LED circuit.","calculator","led-resistor-calculator","electronics led resistor",0,68,"n"],
  ["rc-charge-time-calculator","RC Charge Time Calculator","calculators","Calculate capacitor charging time to a target percentage.","calculator","rc-charge-time-calculator","electronics rc circuit",0,68,"n"],
  ["frequency-period-calculator","Frequency Period Calculator","calculators","Convert frequency and period.","calculator","frequency-period-calculator","electronics frequency",0,68,"n"],
  ["decibel-power-ratio-calculator","Decibel Power Ratio Calculator","calculators","Calculate dB from a power ratio.","calculator","decibel-power-ratio-calculator","electronics decibel audio",0,68,"n"],
  ["decibel-voltage-ratio-calculator","Decibel Voltage Ratio Calculator","calculators","Calculate dB from a voltage ratio for equal impedance.","calculator","decibel-voltage-ratio-calculator","electronics decibel audio",0,68,"n"],
  ["cooking-ratio-calculator","Cooking Ratio Calculator","calculators","Scale an ingredient by a recipe ratio.","calculator","cooking-ratio-calculator","cooking recipe",0,68,"n"],
  ["cooking-temperature-conversion-calculator","Cooking Temperature Conversion Calculator","calculators","Convert oven temperature between Celsius and Fahrenheit.","calculator","cooking-temperature-conversion-calculator","cooking temperature",0,68,"n"],
  ["percentage-point-change-calculator","Percentage-Point Change Calculator","calculators","Calculate absolute percentage-point change.","calculator","percentage-point-change-calculator","percentage statistics",0,68,"n"],
  ["ratio-to-percent-calculator","Ratio to Percentage Calculator","calculators","Convert one part of a ratio into a percentage of the total.","calculator","ratio-to-percent-calculator","ratio percentage",0,68,"n"],
  ["fraction-to-percent-calculator","Fraction to Percentage Calculator","calculators","Convert a fraction to a percentage.","calculator","fraction-to-percent-calculator","fraction percentage",0,68,"n"],
  ["percent-to-fraction-calculator","Percentage to Fraction Calculator","calculators","Convert a percentage to a fraction.","calculator","percent-to-fraction-calculator","percentage fraction",0,68,"n"],
  ["decimal-to-percent-calculator","Decimal to Percent Calculator","calculators","Convert decimal to percentage.","calculator","decimal-to-percent-calculator","decimal percentage",0,68,"n"],
  ["percent-to-decimal-calculator","Percent to Decimal Calculator","calculators","Convert percentage to decimal.","calculator","percent-to-decimal-calculator","percentage decimal",0,68,"n"],
  ["scientific-notation-calculator","Scientific Notation Calculator","calculators","Convert a number to scientific notation.","calculator","scientific-notation-calculator","math scientific notation",0,68,"n"],
  ["fraction-decimal-calculator","Fraction Decimal Calculator","calculators","Convert a fraction to decimal form.","calculator","fraction-decimal-calculator","fraction decimal",0,68,"n"],
  ["power-law-calculator","Power Law Calculator","calculators","Evaluate y = a x^b.","calculator","power-law-calculator","math power",0,68,"n"],
  ["exponential-growth-calculator","Exponential Growth Calculator","calculators","Calculate exponential growth or decay.","calculator","exponential-growth-calculator","math growth",0,68,"n"],
  ["doubling-time-calculator","Doubling Time Calculator","calculators","Estimate doubling time using the rule of 70.","calculator","doubling-time-calculator","finance growth",0,68,"n"],
  ["rule-of-72-calculator","Rule of 72 Calculator","calculators","Estimate doubling time from annual return.","calculator","rule-of-72-calculator","finance growth",0,68,"n"],
  ["calorie-macro-calculator","Macro Calorie Calculator","calculators","Calculate calories from protein, carbohydrate and fat grams.","calculator","calorie-macro-calculator","nutrition calories",0,68,"n"],
  ["water-intake-by-weight-calculator","Water Intake by Weight Calculator","calculators","Estimate daily water from body weight.","calculator","water-intake-by-weight-calculator","health water",0,68,"n"],
  ["steps-to-distance-calculator","Steps to Distance Calculator","calculators","Estimate walking distance from steps and stride length.","calculator","steps-to-distance-calculator","fitness walking",0,68,"n"],
  ["cycling-speed-calculator","Cycling Speed Calculator","calculators","Calculate cycling speed from distance and time.","calculator","cycling-speed-calculator","cycling fitness",0,68,"n"],
  ["fuel-cost-calculator","Fuel Cost Calculator","calculators","Estimate trip fuel cost from distance, efficiency and price.","calculator","fuel-cost-calculator","automotive fuel cost",0,68,"n"],
  ["trip-cost-calculator","Trip Cost Calculator","calculators","Estimate total trip cost from fuel, tolls and other costs.","calculator","trip-cost-calculator","travel transport cost",0,68,"n"],
  ["paint-mix-ratio-calculator","Paint Mix Ratio Calculator","calculators","Calculate component amounts for a paint or resin mix ratio.","calculator","paint-mix-ratio-calculator","mix ratio construction",0,68,"n"],
  ["concrete-mix-material-calculator","Concrete Mix Material Calculator","calculators","Estimate component volumes from a concrete mix ratio.","calculator","concrete-mix-material-calculator","construction concrete",0,68,"n"],
  ["tile-box-calculator","Tile Box Calculator","calculators","Calculate tile boxes needed from area and box coverage.","calculator","tile-box-calculator","construction tile",0,68,"n"],
  ["solar-panel-energy-calculator","Solar Panel Energy Calculator","calculators","Estimate daily solar energy production.","calculator","solar-panel-energy-calculator","solar energy renewable",0,68,"n"],
  ["solar-panel-count-calculator","Solar Panel Count Calculator","calculators","Estimate panels needed for a target solar capacity.","calculator","solar-panel-count-calculator","solar energy",0,68,"n"],
  ["ohms-power-calculator","Ohm Power Calculator","calculators","Calculate electrical power from voltage and current.","calculator","ohms-power-calculator","electricity power",0,68,"n"],
  ["resistor-series-calculator","Series Resistor Calculator","calculators","Calculate total resistance for resistors in series.","calculator","resistor-series-calculator","electronics resistor",0,68,"n"],
  ["resistor-parallel-calculator","Parallel Resistor Calculator","calculators","Calculate equivalent resistance for resistors in parallel.","calculator","resistor-parallel-calculator","electronics resistor",0,68,"n"],
  ["gear-output-speed-calculator","Gear Output Speed Calculator","calculators","Calculate output RPM from input RPM and gear ratio.","calculator","gear-output-speed-calculator","mechanical gear",0,68,"n"],
  ["gear-train-ratio-calculator","Gear Train Ratio Calculator","calculators","Calculate overall gear ratio from two stages.","calculator","gear-train-ratio-calculator","mechanical gear",0,68,"n"],
  ["mechanical-advantage-calculator","Mechanical Advantage Calculator","calculators","Calculate mechanical advantage from output and input force.","calculator","mechanical-advantage-calculator","mechanical physics",0,68,"n"],
  ["pulley-mechanical-advantage-calculator","Pulley Mechanical Advantage Calculator","calculators","Estimate ideal pulley mechanical advantage from supporting rope segments.","calculator","pulley-mechanical-advantage-calculator","mechanical pulley",0,68,"n"],
  ["hydraulic-force-calculator","Hydraulic Force Calculator","calculators","Calculate hydraulic force from pressure and piston area.","calculator","hydraulic-force-calculator","hydraulic mechanical",0,68,"n"],
  ["hydraulic-pressure-calculator","Hydraulic Pressure Calculator","calculators","Calculate pressure from hydraulic force and piston area.","calculator","hydraulic-pressure-calculator","hydraulic mechanical",0,68,"n"],
  ["pump-power-calculator","Pump Power Calculator","calculators","Calculate ideal hydraulic pump power.","calculator","pump-power-calculator","pump hydraulic",0,68,"n"],
  ["beam-load-calculator","Beam Uniform Load Calculator","calculators","Calculate total load from distributed load and beam length.","calculator","beam-load-calculator","structural beam",0,68,"n"],
  ["thermal-expansion-calculator","Thermal Expansion Calculator","calculators","Calculate linear thermal expansion.","calculator","thermal-expansion-calculator","thermal engineering",0,68,"n"],
  ["heat-transfer-calculator","Heat Transfer Calculator","calculators","Calculate heat transfer using Q = m c ΔT.","calculator","heat-transfer-calculator","thermal physics",0,68,"n"],
  ["ideal-gas-density-calculator","Ideal Gas Density Calculator","calculators","Calculate ideal-gas density from pressure, molar mass and temperature.","calculator","ideal-gas-density-calculator","gas thermodynamics",0,68,"n"],
  ["reynolds-number-calculator","Reynolds Number Calculator","calculators","Calculate Reynolds number for flow.","calculator","reynolds-number-calculator","fluid mechanics",0,68,"n"],
  ["dynamic-pressure-calculator","Dynamic Pressure Calculator","calculators","Calculate dynamic pressure q = ½ρv².","calculator","dynamic-pressure-calculator","fluid aerodynamics",0,68,"n"],
  ["drag-force-calculator","Drag Force Calculator","calculators","Calculate aerodynamic drag force.","calculator","drag-force-calculator","automotive aerodynamics",0,68,"n"],
  ["lift-force-calculator","Lift Force Calculator","calculators","Calculate aerodynamic lift force.","calculator","lift-force-calculator","aerodynamics physics",0,68,"n"],
  ["spring-energy-calculator","Spring Energy Calculator","calculators","Calculate energy stored in a linear spring.","calculator","spring-energy-calculator","mechanical spring",0,68,"n"],
  ["torque-from-force-calculator","Torque from Force Calculator","calculators","Calculate torque from force and moment arm.","calculator","torque-from-force-calculator","mechanical torque",0,68,"n"],
  ["angular-speed-rpm-calculator","RPM to Angular Speed Calculator","calculators","Convert RPM to angular velocity.","calculator","angular-speed-rpm-calculator","mechanical rpm",0,68,"n"],
  ["angular-speed-rad-calculator","Angular Speed to RPM Calculator","calculators","Convert angular velocity to RPM.","calculator","angular-speed-rad-calculator","mechanical rpm",0,68,"n"],
  ["kinetic-energy-velocity-calculator","Velocity from Kinetic Energy Calculator","calculators","Calculate velocity from kinetic energy and mass.","calculator","kinetic-energy-velocity-calculator","physics energy",0,68,"n"],
  ["momentum-velocity-calculator","Velocity from Momentum Calculator","calculators","Calculate velocity from momentum and mass.","calculator","momentum-velocity-calculator","physics momentum",0,68,"n"],
  ["force-from-pressure-calculator","Force from Pressure Calculator","calculators","Calculate force from pressure and area.","calculator","force-from-pressure-calculator","physics pressure",0,68,"n"],
  ["pressure-from-depth-calculator","Hydrostatic Pressure from Depth Calculator","calculators","Calculate gauge pressure at depth in a fluid.","calculator","pressure-from-depth-calculator","fluid pressure",0,68,"n"],
  ["gravitational-force-calculator","Gravitational Force Calculator","calculators","Calculate Newtonian gravitational force.","calculator","gravitational-force-calculator","physics gravity",0,68,"n"],
  ["escape-velocity-calculator","Escape Velocity Calculator","calculators","Calculate escape velocity from a mass and radius.","calculator","escape-velocity-calculator","physics astronomy",0,68,"n"],
  ["orbital-period-calculator","Orbital Period Calculator","calculators","Calculate circular orbital period.","calculator","orbital-period-calculator","physics astronomy",0,68,"n"],
  ["photon-wavelength-energy-calculator","Photon Energy from Wavelength Calculator","calculators","Calculate photon energy from wavelength.","calculator","photon-wavelength-energy-calculator","physics quantum",0,68,"n"],
  ["sound-intensity-level-calculator","Sound Intensity Level Calculator","calculators","Calculate sound level from intensity.","calculator","sound-intensity-level-calculator","acoustics sound",0,68,"n"],
  ["wave-period-calculator","Wave Period Calculator","calculators","Calculate period from frequency.","calculator","wave-period-calculator","waves physics",0,68,"n"],
  ["molarity-from-mass-calculator","Molarity from Mass Calculator","calculators","Calculate molarity from solute mass, molar mass and solution volume.","calculator","molarity-from-mass-calculator","chemistry molarity",0,68,"n"],
  ["molarity-dilution-calculator","Dilution Calculator","calculators","Calculate final concentration with C1V1 = C2V2.","calculator","molarity-dilution-calculator","chemistry dilution",0,68,"n"],
  ["mole-fraction-calculator","Mole Fraction Calculator","calculators","Calculate mole fraction from component and total moles.","calculator","mole-fraction-calculator","chemistry",0,68,"n"],
  ["ph-calculator-from-molarity","pH from Molarity Calculator","calculators","Calculate pH for a strong acid approximation.","calculator","ph-calculator-from-molarity","chemistry pH",0,68,"n"],
  ["oh-calculator","pOH Calculator","calculators","Calculate pOH from hydroxide concentration.","calculator","oh-calculator","chemistry pOH",0,68,"n"],
  ["half-life-decay-calculator","Radioactive Decay Calculator","calculators","Calculate remaining quantity after radioactive decay.","calculator","half-life-decay-calculator","physics chemistry decay",0,68,"n"],
  ["construction-area-waste-calculator","Material Area with Waste Calculator","calculators","Add waste allowance to a required material area.","calculator","construction-area-waste-calculator","construction materials",0,68,"n"],
  ["construction-material-cost-calculator","Material Cost Calculator","calculators","Calculate material cost from quantity and unit price.","calculator","construction-material-cost-calculator","construction cost",0,68,"n"],
  ["labor-cost-calculator","Labor Cost Calculator","calculators","Calculate labor cost from hours and hourly rate.","calculator","labor-cost-calculator","construction labor business",0,68,"n"],
  ["total-project-cost-calculator","Total Project Cost Calculator","calculators","Add material, labor and contingency costs.","calculator","total-project-cost-calculator","construction project",0,68,"n"],
  ["area-per-person-calculator","Area per Person Calculator","calculators","Calculate area allocation per person.","calculator","area-per-person-calculator","planning space",0,68,"n"],
  ["occupancy-load-calculator","Occupancy Load Calculator","calculators","Estimate occupancy from floor area and area-per-person factor.","calculator","occupancy-load-calculator","building occupancy",0,68,"n"],
  ["electrical-energy-cost-calculator","Electricity Cost Calculator","calculators","Calculate electricity cost from power, runtime and energy price.","calculator","electrical-energy-cost-calculator","electricity energy cost",0,68,"n"],
  ["appliance-running-cost-calculator","Appliance Running Cost Calculator","calculators","Estimate appliance running cost per day.","calculator","appliance-running-cost-calculator","electricity household",0,68,"n"],
  ["data-transfer-time-calculator","Data Transfer Time Calculator","calculators","Estimate transfer time from file size and connection speed.","calculator","data-transfer-time-calculator","internet network",0,68,"n"],
  ["download-time-calculator","Download Time Calculator","calculators","Estimate download time from file size and speed.","calculator","download-time-calculator","internet download",0,68,"n"],
  ["screen-pixel-density-calculator","Screen PPI Calculator","calculators","Calculate pixel density from resolution and diagonal size.","calculator","screen-pixel-density-calculator","display screen ppi",0,68,"n"],
  ["image-file-size-calculator","Uncompressed Image Size Calculator","calculators","Estimate uncompressed bitmap size.","calculator","image-file-size-calculator","image pixels storage",0,68,"n"],
  ["percentage-of-total-calculator","Percentage of Total Calculator","calculators","Calculate one value as a percentage of a total.","calculator","percentage-of-total-calculator","percentage ratio",0,68,"n"],
  ["average-speed-calculator","Average Speed Calculator","calculators","Calculate average speed from total distance and total time.","calculator","average-speed-calculator","travel physics",0,68,"n"],
  ["fuel-economy-calculator","Fuel Economy Calculator","calculators","Calculate fuel economy from distance and fuel used.","calculator","fuel-economy-calculator","automotive fuel",0,68,"n"],
  ["currency-markup-calculator","Price After Markup Calculator","calculators","Calculate selling price after markup.","calculator","currency-markup-calculator","pricing retail",0,68,"n"],
  ["commission-plus-base-calculator","Base Plus Commission Calculator","calculators","Calculate total compensation from base pay and commission.","calculator","commission-plus-base-calculator","business sales commission",0,68,"n"],
]);

add([
  ["sales-tax-from-total-calculator","Sales Tax from Total Calculator","calculators","Recover the pre-tax price and tax amount from a tax-inclusive total.","calculator","sales-tax-from-total-calculator","tax sales price",0,70,"n"],
  ["markup-from-margin-calculator","Markup from Margin Calculator","calculators","Convert a target margin and cost into a selling price and markup.","calculator","markup-from-margin-calculator","margin markup pricing",0,70,"n"],
  ["commission-rate-calculator","Commission Rate Calculator","calculators","Calculate commission rate from commission earned and sales.","calculator","commission-rate-calculator","commission sales business",0,70,"n"],
  ["gross-profit-calculator","Gross Profit Calculator","calculators","Calculate gross profit and gross margin from revenue and cost of goods.","calculator","gross-profit-calculator","profit business margin",0,70,"n"],
  ["operating-margin-calculator","Operating Margin Calculator","calculators","Calculate operating margin from operating income and revenue.","calculator","operating-margin-calculator","business margin profit",0,70,"n"],
  ["inventory-turnover-calculator","Inventory Turnover Calculator","calculators","Calculate inventory turnover from COGS and average inventory.","calculator","inventory-turnover-calculator","inventory business",0,70,"n"],
  ["days-inventory-outstanding-calculator","Days Inventory Outstanding Calculator","calculators","Estimate inventory days from inventory, COGS, and period length.","calculator","days-inventory-outstanding-calculator","inventory accounting",0,70,"n"],
  ["conversion-rate-calculator","Conversion Rate Calculator","calculators","Calculate conversions as a percentage of visitors.","calculator","conversion-rate-calculator","marketing conversion",0,70,"n"],
  ["cost-per-acquisition-calculator","Cost per Acquisition Calculator","calculators","Calculate advertising cost per acquired customer.","calculator","cost-per-acquisition-calculator","marketing cpa",0,70,"n"],
  ["cost-per-click-calculator","Cost per Click Calculator","calculators","Calculate advertising cost per click.","calculator","cost-per-click-calculator","marketing cpc",0,70,"n"],
  ["cost-per-thousand-calculator","CPM Calculator","calculators","Calculate cost per thousand impressions.","calculator","cost-per-thousand-calculator","marketing cpm",0,70,"n"],
  ["click-through-rate-calculator","Click Through Rate Calculator","calculators","Calculate click-through rate from clicks and impressions.","calculator","click-through-rate-calculator","marketing ctr",0,70,"n"],
  ["revenue-per-user-calculator","Revenue per User Calculator","calculators","Calculate average revenue per user.","calculator","revenue-per-user-calculator","business arpu",0,70,"n"],
  ["customer-lifetime-value-calculator","Customer Lifetime Value Calculator","calculators","Estimate gross-margin customer lifetime value.","calculator","customer-lifetime-value-calculator","business clv",0,70,"n"],
  ["break-even-revenue-calculator","Break-Even Revenue Calculator","calculators","Calculate required revenue for break-even with variable costs.","calculator","break-even-revenue-calculator","business break even",0,70,"n"],
  ["hourly-rate-after-tax-calculator","After-Tax Hourly Rate Calculator","calculators","Estimate hourly take-home rate after a flat tax percentage.","calculator","hourly-rate-after-tax-calculator","pay tax salary",0,70,"n"],
  ["overtime-hours-calculator","Overtime Hours Calculator","calculators","Solve overtime hours from total pay, rate, and multiplier.","calculator","overtime-hours-calculator","overtime pay work",0,70,"n"],
  ["time-zone-offset-calculator","UTC Offset Calculator","calculators","Convert a UTC hour using a numeric UTC offset.","calculator","time-zone-offset-calculator","time timezone",0,70,"n"],
  ["minutes-to-decimal-hours-calculator","Minutes to Decimal Hours Calculator","calculators","Convert minutes to decimal hours.","calculator","minutes-to-decimal-hours-calculator","time hours",0,70,"n"],
  ["decimal-hours-to-minutes-calculator","Decimal Hours to Minutes Calculator","calculators","Convert decimal hours to minutes.","calculator","decimal-hours-to-minutes-calculator","time minutes",0,70,"n"],
  ["pace-from-distance-time-calculator","Pace from Distance and Time Calculator","calculators","Calculate running pace and speed from distance and elapsed time.","calculator","pace-from-distance-time-calculator","running pace speed",0,70,"n"],
  ["cycling-speed-calculator","Cycling Speed Calculator","calculators","Calculate average cycling speed from distance and time.","calculator","cycling-speed-calculator","cycling speed",0,70,"n"],
  ["calorie-burn-per-minute-calculator","Calorie Burn per Minute Calculator","calculators","Calculate average calories burned per exercise minute.","calculator","calorie-burn-per-minute-calculator","fitness calories",0,70,"n"],
  ["hydration-needs-calculator","Hydration Needs Calculator","calculators","Estimate a daily water target from body weight and a chosen mL/kg guideline.","calculator","hydration-needs-calculator","water hydration fitness",0,70,"n","h"],
  ["percentage-calorie-macro-calculator","Macro Calories Calculator","calculators","Convert calorie percentages into daily protein, carbohydrate, and fat grams.","calculator","percentage-calorie-macro-calculator","nutrition macros calories",0,70,"n","h"],
  ["recipe-cost-per-serving-calculator","Recipe Cost per Serving Calculator","calculators","Calculate recipe cost per serving.","calculator","recipe-cost-per-serving-calculator","cooking recipe cost",0,70,"n"],
  ["cooking-temperature-conversion-calculator","Cooking Temperature Conversion Calculator","calculators","Convert Fahrenheit cooking temperature to Celsius and Kelvin.","calculator","cooking-temperature-conversion-calculator","cooking temperature",0,70,"n"],
  ["electricity-usage-kwh-calculator","Electricity Usage Calculator","calculators","Estimate electricity consumption from appliance power and runtime.","calculator","electricity-usage-kwh-calculator","electricity kwh energy",0,70,"n"],
  ["solar-panel-energy-calculator","Solar Panel Energy Calculator","calculators","Estimate solar energy production from panel power and peak sun hours.","calculator","solar-panel-energy-calculator","solar energy",0,70,"n"],
  ["battery-runtime-calculator","Battery Runtime Calculator","calculators","Estimate runtime from battery energy, load, and efficiency.","calculator","battery-runtime-calculator","battery runtime power",0,70,"n"],
  ["generator-fuel-cost-calculator","Generator Fuel Cost Calculator","calculators","Estimate generator fuel use and cost from runtime and consumption.","calculator","generator-fuel-cost-calculator","generator fuel cost",0,70,"n"],
  ["pipe-volume-calculator","Pipe Volume Calculator","calculators","Calculate internal cylindrical pipe volume.","calculator","pipe-volume-calculator","pipe volume fluid",0,70,"n"],
  ["flow-velocity-calculator","Flow Velocity Calculator","calculators","Calculate flow velocity from flow rate and area.","calculator","flow-velocity-calculator","fluid flow velocity",0,70,"n"],
  ["pressure-force-area-calculator","Pressure Force Area Calculator","calculators","Solve area from pressure and applied force.","calculator","pressure-force-area-calculator","pressure force area",0,70,"n"],
  ["gear-ratio-calculator","Gear Ratio Calculator","calculators","Calculate gear ratio from driver and driven tooth counts.","calculator","gear-ratio-calculator","gear mechanical",0,70,"n"],
  ["mechanical-advantage-calculator","Mechanical Advantage Calculator","calculators","Calculate mechanical advantage from load and effort force.","calculator","mechanical-advantage-calculator","mechanical advantage",0,70,"n"],
  ["belt-speed-calculator","Belt Speed Calculator","calculators","Calculate belt speed from pulley diameter and RPM.","calculator","belt-speed-calculator","belt pulley mechanical",0,70,"n"],
  ["beam-uniform-load-total-calculator","Beam Uniform Load Total Calculator","calculators","Calculate total load from distributed load and beam length.","calculator","beam-uniform-load-total-calculator","beam structural load",0,70,"n"],
  ["thermal-expansion-length-calculator","Thermal Expansion Length Calculator","calculators","Calculate linear thermal expansion and final length.","calculator","thermal-expansion-length-calculator","thermal expansion engineering",0,70,"n"]
]);


add([
  ["voice-noise-reducer","Voice Noise Reducer","audio","Reduce steady low-level background noise locally with an adaptive high-pass filter and soft noise gate. No upload required.","audio","voice-noise-reducer","voice noise reduction denoise audio speech",1,93,"n"],
  ["voice-noise-gate","Voice Noise Gate","audio","Suppress low-level room noise between spoken phrases using a local adaptive gate.","audio","voice-noise-gate","voice gate speech noise",0,82,"n"],
  ["audio-hum-reducer","Audio Hum Reducer","audio","Reduce common low-frequency mains hum locally with a notch-style filter.","audio","audio-hum-reducer","audio hum 50hz 60hz noise",0,82,"n"],
  ["video-noise-reducer","Video Noise Reducer","video","Reduce temporal/spatial video noise with a real FFmpeg denoise backend when that backend is available.","custom","video-noise-reducer","video noise denoise hqdn3d ffmpeg",0,90,"p"],
  ["video-grain-reducer","Video Grain Reducer","video","Reduce film/digital grain with a verified video-processing backend when available.","custom","video-grain-reducer","video grain denoise",0,84,"p"]
]);

// Two named convenience calculators round the catalog to the 10,000-tool release target.
RAW.push(
  ["interest-earned-from-principal-calculator", "Interest Earned from Principal Calculator", "calculators", "Calculate interest from principal, rate, and time.", "calculator", "exercise-simple-interest-I", "interest principal rate time", 0, 64, "n"],
  ["cagr-rate-from-values-calculator", "CAGR Rate from Values Calculator", "calculators", "Calculate compound annual growth rate from beginning value, ending value, and years.", "calculator", "exercise-cagr-cagr", "cagr growth beginning ending years", 0, 64, "n"],
);

const tools = [];
for (const row of RAW) {
  const [id, name, cat, desc, engineType, engineKey, kw, featured, pop, extra = ""] = row;
  if (seen.has(id)) continue;
  seen.add(id);
  // Calculator catalog entries are intentionally executable.
  // Expanded calculator families use the generic calculator engine with their
  // engineKey as the formula id, so they do not become dead "Coming Soon" links.
  const isCalculatorFamily = cat === "calculators" && engineType === "custom";
  const isDeveloperFamily = cat === "developer" && engineType === "custom";
  const developerImplemented = new Set([
    "json-formatter","json-validator","json-minifier","json-beautifier",
    "jwt-decoder","jwt-expiration-checker","base64-encoder","base64-decoder",
    "url-encoder","url-decoder","html-encoder","html-decoder","unicode-converter",
    "ascii-converter","binary-converter","hex-converter","uuid-generator","uuid-validator",
    "md5-hash","sha1-hash","sha256-hash","sha512-hash","hash-compare","regex-tester",
    "regex-replace","sql-formatter","html-formatter","css-formatter","javascript-formatter",
    "xml-formatter","yaml-formatter","html-minifier","css-minifier","javascript-minifier",
    "unix-timestamp-converter","http-status-lookup","url-parser","mime-lookup",
    "lorem-ipsum-generator","dummy-json-generator","markdown-preview","markdown-to-html",
    "cron-generator","cron-parser","user-agent-parser","query-string-parser","data-uri-generator"
  ]);
  const isImplementedDeveloper = cat === "developer" && developerImplemented.has(id);
  const isTextCustom = cat === "text" && engineType === "custom";
  const isImageEngine = cat === "image" && engineType === "image";
  const isCreatorCustom = cat === "creators" && engineType === "custom";
  const isBusinessTool = cat === "business";
  const effectiveEngineType = isCalculatorFamily ? "calculator" : isDeveloperFamily ? "developer" : isTextCustom ? "text" : isCreatorCustom ? "creator" : isBusinessTool ? "business" : engineType;
  const effectiveEngineKey = isCalculatorFamily ? engineKey.toLowerCase() : isDeveloperFamily ? id : isBusinessTool ? id.replace(/-(calculator|generator|template|estimator|planner)$/, "") : engineKey;
  const unsupportedEngineType = ["custom", "ai", "document", "pdf"].includes(effectiveEngineType);
  const status = isCalculatorFamily || isTextCustom || isImageEngine || isCreatorCustom || isBusinessTool || isImplementedDeveloper ? "active" : (isDeveloperFamily || extra.includes("p") || unsupportedEngineType ? "planned" : extra.includes("b") ? "beta" : "active");
  let disclaimer;
  if (extra.includes("h")) disclaimer = "health";
  else if (extra.includes("f")) disclaimer = "finance";
  else if (extra.includes("e")) disclaimer = "earnings";
  else if (extra.includes("m")) disclaimer = "mockup";
  else if (extra.includes("s")) disclaimer = "estimate";
  const keywords = kw.split(/\s+/).filter(Boolean);
  const plannedBackend = extra.includes("p") && ["whois","dns","webscreenshot","bg-remove","ocr","pdf-word"].includes(engineKey);

  const engineKeyName =
    effectiveEngineType === "calculator" ? "formula"
    : effectiveEngineType === "converter" ? "system"
    : effectiveEngineType === "creator" ? "op"
    : effectiveEngineType === "business" ? "op"
    : effectiveEngineType === "custom" ? "id"
    : effectiveEngineType === "developer" ? "op"
    : engineType === "barcode" ? "format"
    : engineType === "qr" ? "preset"
    : engineType === "mockup" || engineType === "post" || engineType === "device" ? "variant"
    : "op";

  tools.push({
    id,
    name,
    slug: id,
    description: desc,
    category: cat,
    keywords,
    tags: keywords.slice(0, 4),
    icon: ICON[cat] || "Wrench",
    popularity: pop,
    featured: Boolean(featured),
    clientSide: !plannedBackend,
    requiresBackend: Boolean(plannedBackend),
    requiresAuth: false,
    status,
    related: [],
    engine: { type: effectiveEngineType, [engineKeyName]: effectiveEngineKey },
    disclaimer,
    isNew: extra.includes("n") || undefined,
  });
}

// Design-family expansions are browser-local and use the shared CSS/color engines.
// Promote every generated Design utility to a real executable route, while preserving
// the catalog distinction between the different UI workflows (builder, preview, CSS,
// SVG, tokens, presets) through the engine op.
const designFamilies = ["color", "gradient", "shadow", "border", "button", "card", "badge", "input", "avatar", "glass", "neumorphism", "neomorph", "pattern", "blob", "wave", "noise"];
for (const tool of tools) {
  if (tool.category !== "design") continue;
  const lower = `${tool.id} ${tool.name}`.toLowerCase();
  const family = designFamilies.find((f) => lower.includes(f));
  if (!family) continue;
  const normalizedFamily = family === "neumorphism" ? "neomorph" : family;
  const workflow = lower.includes("token") ? "token" : lower.includes("preset") ? "preset" : lower.includes("svg") ? "svg" : lower.includes("preview") ? "preview" : lower.includes("builder") ? "builder" : lower.includes("css generator") ? "css" : lower.includes("generator") ? "generator" : "tool";
  if (normalizedFamily === "color") {
    const colorOp = lower.includes("contrast") || lower.includes("wcag") ? "contrast" : lower.includes("colorblind") ? "colorblind" : lower.includes("palette") || workflow === "generator" || workflow === "builder" ? "palette" : "picker";
    tool.engine = { type: "color", op: colorOp };
  } else {
    tool.engine = { type: "cssgen", op: `${normalizedFamily}:${workflow}` };
  }
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
}

// Browser-local video operations use the dedicated VideoEngine. Source downloads,
// transcoding-heavy operations, and transcription remain planned until their real
// processing backends are shipped.
const videoOps = new Set(["media-capability-checker","webcodecs-video-checker","mediarecorder-support-checker","video-codec-support-checker","media-worker-support-checker","video-file-inspector","video-duration-tool","video-dimensions-tool","video-aspect-ratio-tool","video-thumbnail-extractor","video-poster-generator","video-frame-preview","video-audio-extractor","video-frame-png","video-frame-percent","video-frame-contact-sheet","video-metadata-json","video-bitrate-estimator","video-audio-track-checker","media-runtime-inspector","ffmpeg-runtime-checker","media-backend-checker","video-trimmer","video-compressor","video-speed-changer","video-to-mp4","video-to-mp3","video-to-gif"]);
for (const tool of tools) {
  if (tool.category !== "video" || !videoOps.has(tool.id)) continue;
  const opMap = {
    "media-capability-checker": "media-capabilities",
    "webcodecs-video-checker": "webcodecs-video",
    "mediarecorder-support-checker": "mediarecorder-support",
    "video-codec-support-checker": "codec-support",
    "media-worker-support-checker": "worker-support",
    "video-file-inspector": "inspect",
    "video-duration-tool": "duration",
    "video-dimensions-tool": "dimensions",
    "video-aspect-ratio-tool": "aspect-ratio",
    "video-thumbnail-extractor": "thumbnail",
    "video-poster-generator": "thumbnail",
    "video-frame-preview": "thumbnail",
    "video-audio-extractor": "extract-audio",
    "video-frame-png": "frame-png", "video-frame-percent": "frame-percent", "video-frame-contact-sheet": "frame-grid",
    "video-metadata-json": "metadata-json", "video-bitrate-estimator": "bitrate-estimator", "video-audio-track-checker": "audio-track-check",
    "video-trimmer": "video-trimmer", "video-compressor": "video-compressor", "video-speed-changer": "video-speed",
    "video-to-mp4": "video-to-mp4", "video-to-mp3": "video-to-mp3", "video-to-gif": "video-to-gif",
  };
  tool.engine = { type: "video", op: opMap[tool.id] };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

// Real FFmpeg-backed media conversions. These remain active in the catalog but explicitly
// require the optional media processor endpoint; the UI reports the missing backend rather
// than pretending conversion is available.
const serverMediaVideoOps = {
  "video-to-mp4": "video-to-mp4",
  "video-to-mp3": "video-to-mp3",
  "video-to-gif": "video-to-gif",
  "video-to-webm": "video-to-webm",
  "video-to-mov": "video-to-mov",
  "video-to-avi": "video-to-avi",
  "video-resize": "video-resize",
  "video-crop": "video-crop",
  "video-rotate": "video-rotate",
  "video-mute": "video-mute",
  "video-fps": "video-fps",
  "video-bitrate": "video-bitrate",
  "video-resolution-presets": "video-resolution",
  "video-audio-volume": "video-audio-volume",
  "video-merger": "video-merge",
  "video-audio-replacer": "video-replace-audio",
};
for (const tool of tools) {
  const op = serverMediaVideoOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "video", op };
  tool.status = "active";
  tool.clientSide = false;
  tool.requiresBackend = true;
  tool.requiresAuth = false;
}

// Server-backed audio conversion tools use the shared audio engine.
const serverAudioOps = {
  "audio-to-mp3-server": "server-mp3",
  "audio-to-wav-server": "server-wav",
  "audio-to-ogg-server": "server-ogg",
  "audio-to-flac-server": "server-flac",
  "audio-volume-control": "server-volume",
  "audio-bitrate-converter": "server-bitrate",
  "audio-sample-rate-converter": "server-sample-rate",
  "audio-channel-converter": "server-channels",
  "audio-merger": "server-merge",
};
for (const tool of tools) {
  const op = serverAudioOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "audio", op };
  tool.status = "active";
  tool.clientSide = false;
  tool.requiresBackend = true;
  tool.requiresAuth = false;
}

// PDF tools backed by the browser-local pdf-lib engine. Keep unsupported OCR/office conversion honest.
const pdfOps = {
  "pdf-merger":"merge", "pdf-splitter":"split", "pdf-rotator":"rotate", "images-to-pdf":"images-to-pdf",
  "pdf-page-extractor":"extract", "pdf-metadata-viewer":"meta", "pdf-compressor":"compress",
  "pdf-page-reorder-tool":"reorder", "pdf-page-numbering-tool":"number", "pdf-watermark-tool":"watermark",
  "pdf-metadata-tool":"metadata", "pdf-comparison-tool":"compare", "pdf-print-layout-helper":"print-layout",
  "pdf-protector":"protect", "pdf-unlocker":"unlock", "pdf-flattener":"flatten",
};
for (const tool of tools) {
  const op = pdfOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "pdf", op };
  tool.status = "active"; tool.clientSide = true; tool.requiresBackend = false;
}

// Coming Soon audit promotions: these operations are already implemented by the
// browser-local image/PDF engines, so they must not regress to placeholder custom engines.
const comingSoonImageOps = {
  "image-merger": "merge",
  "image-watermark-tool": "watermark",
  "image-metadata-tool": "exif-view",
};
for (const tool of tools) {
  const op = comingSoonImageOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "image", op };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

const comingSoonImageCustomOps = {
  "image-comparison-tool": "image-comparison",
  "image-screenshot-tool": "image-screenshot",
  "image-print-layout-helper": "image-print-layout",
};
for (const tool of tools) {
  const id = comingSoonImageCustomOps[tool.id];
  if (!id) continue;
  tool.engine = { type: "custom", id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

const comingSoonPdfOps = {
  "document-merger": "merge",
  "document-splitter": "split",
  "document-compressor": "compress",
  "document-page-extractor": "extract",
  "document-page-reorder-tool": "reorder",
  "document-page-numbering-tool": "number",
  "document-watermark-tool": "watermark",
  "document-metadata-tool": "metadata",
};
for (const tool of tools) {
  const op = comingSoonPdfOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "pdf", op };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

// Coming Soon feasible-local promotions from the cumulative audit. Keep the
// exact audited ID set rather than re-evaluating category membership against the
// larger 10k catalog, which could accidentally promote newer unrelated entries.
const auditedFeasibleComingSoonIds = new Set(["birthday-page-generator", "birthday-interactive-card", "birthday-invitation-generator", "birthday-memory-page", "birthday-reveal-page", "birthday-quiz-generator", "birthday-surprise-page", "anniversary-page-generator", "anniversary-interactive-card", "anniversary-invitation-generator", "anniversary-countdown", "anniversary-memory-page", "anniversary-reveal-page", "anniversary-quiz-generator", "anniversary-surprise-page", "graduation-page-generator", "graduation-interactive-card", "graduation-invitation-generator", "graduation-countdown", "graduation-memory-page", "graduation-reveal-page", "graduation-quiz-generator", "graduation-surprise-page", "valentine-page-generator", "valentine-interactive-card", "valentine-invitation-generator", "valentine-countdown", "valentine-memory-page", "valentine-quiz-generator", "valentine-surprise-page", "christmas-page-generator", "christmas-interactive-card", "christmas-invitation-generator", "christmas-countdown", "christmas-memory-page", "christmas-reveal-page", "christmas-quiz-generator", "christmas-surprise-page", "new-year-page-generator", "new-year-interactive-card", "new-year-invitation-generator", "new-year-countdown", "new-year-memory-page", "new-year-reveal-page", "new-year-quiz-generator", "new-year-surprise-page", "congratulations-page-generator", "congratulations-interactive-card", "congratulations-invitation-generator", "congratulations-countdown", "congratulations-memory-page", "congratulations-reveal-page", "congratulations-quiz-generator", "congratulations-surprise-page", "thank-you-page-generator", "thank-you-interactive-card", "thank-you-invitation-generator", "thank-you-countdown", "thank-you-memory-page", "thank-you-reveal-page", "thank-you-quiz-generator", "thank-you-surprise-page", "appreciation-page-generator", "appreciation-interactive-card", "appreciation-invitation-generator", "appreciation-countdown", "appreciation-memory-page", "appreciation-quiz-generator", "appreciation-surprise-page", "farewell-page-generator", "farewell-interactive-card", "farewell-invitation-generator", "farewell-countdown", "farewell-memory-page", "farewell-reveal-page", "farewell-quiz-generator", "farewell-surprise-page", "achievement-page-generator", "achievement-interactive-card", "achievement-invitation-generator", "achievement-countdown", "achievement-memory-page", "achievement-reveal-page", "achievement-quiz-generator", "achievement-surprise-page", "party-page-generator", "party-interactive-card", "party-invitation-generator", "party-countdown", "party-memory-page", "party-reveal-page", "party-quiz-generator", "party-surprise-page", "birthday-rsvp-page", "birthday-schedule-builder", "birthday-agenda-generator", "birthday-event-qr-generator", "birthday-ticket-mockup", "birthday-check-in-page", "wedding-invitation-generator", "wedding-rsvp-page", "wedding-countdown", "wedding-schedule-builder", "wedding-agenda-generator", "wedding-event-qr-generator", "wedding-ticket-mockup", "wedding-check-in-page", "graduation-rsvp-page", "graduation-schedule-builder", "graduation-agenda-generator", "graduation-event-qr-generator", "graduation-ticket-mockup", "graduation-check-in-page", "party-rsvp-page", "party-schedule-builder", "party-agenda-generator", "party-event-qr-generator", "party-ticket-mockup", "party-check-in-page", "dinner-invitation-generator", "dinner-rsvp-page", "dinner-countdown", "dinner-schedule-builder", "dinner-agenda-generator", "dinner-event-qr-generator", "dinner-ticket-mockup", "dinner-check-in-page", "conference-invitation-generator", "conference-rsvp-page", "conference-countdown", "conference-schedule-builder", "conference-agenda-generator", "conference-event-qr-generator", "conference-ticket-mockup", "conference-check-in-page", "workshop-invitation-generator", "workshop-rsvp-page", "workshop-countdown", "workshop-schedule-builder", "workshop-agenda-generator", "workshop-event-qr-generator", "workshop-ticket-mockup", "workshop-check-in-page", "meeting-invitation-generator", "meeting-rsvp-page", "meeting-countdown", "meeting-schedule-builder", "meeting-event-qr-generator", "meeting-ticket-mockup", "meeting-check-in-page", "webinar-invitation-generator", "webinar-rsvp-page", "webinar-countdown", "webinar-schedule-builder", "webinar-agenda-generator", "webinar-event-qr-generator", "webinar-ticket-mockup", "webinar-check-in-page", "concert-invitation-generator", "concert-rsvp-page", "concert-countdown", "concert-schedule-builder", "concert-agenda-generator", "concert-event-qr-generator", "concert-ticket-mockup", "concert-check-in-page", "launch-invitation-generator", "launch-rsvp-page", "launch-countdown", "launch-schedule-builder", "launch-agenda-generator", "launch-event-qr-generator", "launch-ticket-mockup", "launch-check-in-page", "fundraiser-invitation-generator", "fundraiser-rsvp-page", "fundraiser-countdown", "fundraiser-schedule-builder", "fundraiser-agenda-generator", "fundraiser-event-qr-generator", "fundraiser-ticket-mockup", "fundraiser-check-in-page", "sports-event-invitation-generator", "sports-event-rsvp-page", "sports-event-countdown", "sports-event-schedule-builder", "sports-event-agenda-generator", "sports-event-event-qr-generator", "sports-event-ticket-mockup", "sports-event-check-in-page", "print-size-calculator", "print-size-planner", "print-size-guide", "print-size-generator", "print-size-checker", "crop-calculator", "crop-planner", "crop-guide", "crop-generator", "crop-checker", "aspect-ratio-planner", "aspect-ratio-guide", "aspect-ratio-generator", "aspect-ratio-checker", "dpi-calculator", "dpi-planner", "dpi-guide", "dpi-generator", "dpi-checker", "ppi-calculator", "ppi-planner", "ppi-guide", "ppi-generator", "ppi-checker", "resolution-calculator", "resolution-planner", "resolution-guide", "resolution-generator", "resolution-checker", "exposure-calculator", "exposure-planner", "exposure-guide", "exposure-generator", "exposure-checker", "depth-of-field-calculator", "depth-of-field-planner", "depth-of-field-guide", "depth-of-field-generator", "depth-of-field-checker", "fov-calculator", "fov-planner", "fov-guide", "fov-generator", "fov-checker", "lens-calculator", "lens-planner", "lens-guide", "lens-generator", "lens-checker", "sensor-calculator", "sensor-planner", "sensor-guide", "sensor-generator", "sensor-checker", "photo-calculator", "photo-planner", "photo-guide", "photo-generator", "photo-checker", "passport-photo-calculator", "passport-photo-planner", "passport-photo-guide", "passport-photo-generator", "passport-photo-checker", "id-photo-calculator", "id-photo-planner", "id-photo-guide", "id-photo-generator", "id-photo-checker", "social-photo-calculator", "social-photo-planner", "social-photo-guide", "social-photo-generator", "social-photo-checker", "trip-budget-calculator", "trip-budget-planner", "trip-budget-generator", "trip-budget-checklist", "trip-budget-converter", "fuel-calculator", "fuel-planner", "fuel-generator", "fuel-checklist", "distance-planner", "distance-generator", "distance-checklist", "distance-converter", "travel-time-calculator", "travel-time-planner", "travel-time-generator", "travel-time-checklist", "travel-time-converter", "timezone-calculator", "timezone-planner", "timezone-generator", "timezone-checklist", "packing-calculator", "packing-planner", "packing-generator", "packing-checklist", "packing-converter", "itinerary-calculator", "itinerary-planner", "itinerary-generator", "itinerary-checklist", "itinerary-converter", "currency-calculator", "currency-planner", "currency-generator", "currency-checklist", "currency-converter", "road-trip-calculator", "road-trip-planner", "road-trip-generator", "road-trip-checklist", "road-trip-converter", "flight-time-calculator", "flight-time-planner", "flight-time-generator", "flight-time-checklist", "flight-time-converter", "jet-lag-calculator", "jet-lag-planner", "jet-lag-generator", "jet-lag-checklist", "jet-lag-converter", "hotel-budget-calculator", "hotel-budget-planner", "hotel-budget-generator", "hotel-budget-checklist", "hotel-budget-converter", "daily-budget-calculator", "daily-budget-planner", "daily-budget-generator", "daily-budget-checklist", "daily-budget-converter", "travel-checklist-calculator", "travel-checklist-planner", "travel-checklist-generator", "travel-checklist-checklist", "travel-checklist-converter", "recipe-calculator", "recipe-scaler", "recipe-converter", "recipe-planner", "recipe-generator", "recipe-checklist", "serving-calculator", "serving-scaler", "serving-converter", "serving-planner", "serving-generator", "serving-checklist", "ingredient-calculator", "ingredient-scaler", "ingredient-converter", "ingredient-planner", "ingredient-generator", "ingredient-checklist", "kitchen-unit-calculator", "kitchen-unit-scaler", "kitchen-unit-converter", "kitchen-unit-planner", "kitchen-unit-generator", "kitchen-unit-checklist", "oven-temperature-calculator", "oven-temperature-scaler", "oven-temperature-converter", "oven-temperature-planner", "oven-temperature-generator", "oven-temperature-checklist", "baking-calculator", "baking-scaler", "baking-converter", "baking-planner", "baking-generator", "baking-checklist", "meal-calculator", "meal-scaler", "meal-converter", "meal-planner", "meal-generator", "meal-checklist", "grocery-calculator", "grocery-scaler", "grocery-converter", "grocery-planner", "grocery-generator", "grocery-checklist", "food-cost-calculator", "food-cost-scaler", "food-cost-converter", "food-cost-planner", "food-cost-generator", "food-cost-checklist", "portion-calculator", "portion-scaler", "portion-converter", "portion-planner", "portion-generator", "portion-checklist", "nutrition-calculator", "nutrition-scaler", "nutrition-converter", "nutrition-planner", "nutrition-generator", "nutrition-checklist", "cooking-time-calculator", "cooking-time-scaler", "cooking-time-converter", "cooking-time-planner", "cooking-time-generator", "cooking-time-checklist", "youtube-video-size-calculator", "youtube-aspect-ratio-helper", "youtube-bitrate-calculator", "youtube-fps-calculator", "youtube-subtitle-helper", "youtube-duration-calculator", "youtube-frame-calculator", "youtube-export-preset", "tiktok-video-size-calculator", "tiktok-aspect-ratio-helper", "tiktok-bitrate-calculator", "tiktok-fps-calculator", "tiktok-subtitle-helper", "tiktok-duration-calculator", "tiktok-frame-calculator", "tiktok-export-preset", "instagram-video-size-calculator", "instagram-aspect-ratio-helper", "instagram-bitrate-calculator", "instagram-fps-calculator", "instagram-subtitle-helper", "instagram-duration-calculator", "instagram-frame-calculator", "instagram-export-preset", "facebook-video-size-calculator", "facebook-aspect-ratio-helper", "facebook-bitrate-calculator", "facebook-fps-calculator", "facebook-subtitle-helper", "facebook-duration-calculator", "facebook-frame-calculator", "facebook-export-preset", "x-video-size-calculator", "x-aspect-ratio-helper", "x-bitrate-calculator", "x-fps-calculator", "x-subtitle-helper", "x-duration-calculator", "x-frame-calculator", "x-export-preset", "linkedin-video-size-calculator", "linkedin-aspect-ratio-helper", "linkedin-bitrate-calculator", "linkedin-fps-calculator", "linkedin-subtitle-helper", "linkedin-duration-calculator", "linkedin-frame-calculator", "linkedin-export-preset", "pinterest-video-size-calculator", "pinterest-aspect-ratio-helper", "pinterest-bitrate-calculator", "pinterest-fps-calculator", "pinterest-thumbnail-size-helper", "pinterest-subtitle-helper", "pinterest-duration-calculator", "pinterest-frame-calculator", "pinterest-export-preset", "snapchat-video-size-calculator", "snapchat-aspect-ratio-helper", "snapchat-bitrate-calculator", "snapchat-fps-calculator", "snapchat-thumbnail-size-helper", "snapchat-subtitle-helper", "snapchat-duration-calculator", "snapchat-frame-calculator", "snapchat-export-preset", "twitch-video-size-calculator", "twitch-fps-calculator", "twitch-subtitle-helper", "twitch-duration-calculator", "twitch-frame-calculator", "twitch-export-preset", "discord-video-size-calculator", "discord-aspect-ratio-helper", "discord-bitrate-calculator", "discord-fps-calculator", "discord-thumbnail-size-helper", "discord-subtitle-helper", "discord-duration-calculator", "discord-frame-calculator", "discord-export-preset"]);
let feasibleComingSoonPromotions = 0;
for (const tool of tools) {
  if (!auditedFeasibleComingSoonIds.has(tool.id) || tool.status !== "planned") continue;
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
  tool.engine = { type: "custom", id: `planned-local:${tool.id}` };
  feasibleComingSoonPromotions += 1;
}
if (feasibleComingSoonPromotions !== 484) {
  throw new Error(`Coming Soon feasible promotion drift: expected 484, promoted ${feasibleComingSoonPromotions}`);
}

// Random/fun utilities are browser-local and executable.
const randomTools = new Set();
for (const tool of tools) {
  if (tool.category !== "random") continue;
  randomTools.add(tool.id);
  tool.engine = { type: "generator", op: tool.id === "coin-flip" ? "coin-flip" : tool.id === "dice-roller" ? "dice-roller" : tool.id === "wheel-spinner" ? "wheel" : tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
}

// Productivity timers are browser-local and executable.
const productivityOps = {
  stopwatch: "stopwatch",
  "pomodoro-timer": "pomodoro",
  "focus-timer": "focus-timer",
};
for (const tool of tools) {
  if (tool.category !== "productivity") continue;
  const op = productivityOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "custom", id: op };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
}

// Audio tools use a dedicated browser-local engine. Existing calculator tools remain
// calculator engines; all other Audio entries get an explicit audio operation.
for (const tool of tools) {
  if (tool.category !== "audio") continue;
  if (tool.id === "audio-to-mp3-server" || tool.id === "audio-to-wav-server" || tool.id === "audio-to-ogg-server" || tool.id === "audio-to-flac-server") continue;
  if (tool.id === "audio-bitrate-calculator" || tool.id === "audio-file-size-calculator" || tool.id === "sample-rate-info") continue;
  const id = tool.id;
  const platform = ["podcast","youtube","tiktok","instagram","spotify","apple-music","twitch","discord"].find((p) => id.startsWith(`${p}-`));
  let op = id;
  if (id === "audio-joiner") op = "joiner";
  else if (id.includes("audio-file-size-calculator")) op = `${platform || "audio"}:file-size`;
  else if (id.includes("bitrate-calculator")) op = `${platform || "audio"}:bitrate`;
  else if (id.includes("sample-rate-helper")) op = `${platform || "audio"}:sample-rate`;
  else if (id.includes("loudness-helper")) op = `${platform || "audio"}:loudness`;
  else if (id.includes("bpm-helper")) op = `${platform || "audio"}:bpm`;
  else if (id.includes("metadata-helper")) op = `${platform || "audio"}:metadata`;
  else if (id.includes("export-preset")) op = `${platform || "audio"}:export-preset`;
  else if (id.includes("format-guide")) op = `${platform || "audio"}:format-guide`;
  else op = `${platform || "audio"}:guide`;
  tool.engine = { type: "audio", op };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
}

// Re-apply server-backed audio conversion engines after the general audio mapping above.
for (const tool of tools) {
  const op = serverAudioOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "audio", op };
  tool.status = "active";
  tool.clientSide = false;
  tool.requiresBackend = true;
  tool.requiresAuth = false;
}

const localAudioOps = new Set(["webcodecs-audio-checker","audio-file-inspector","audio-duration-tool","audio-waveform-generator","audio-to-wav","audio-trimmer","audio-reverser","audio-normalizer","audio-fade-in","audio-fade-out","audio-to-mono","audio-to-stereo","audio-peak-meter","audio-rms-meter","audio-silence-detector","audio-channel-balance","audio-dc-offset-checker","audio-joiner"]);
for (const tool of tools) {
  if (tool.category !== "audio" || !localAudioOps.has(tool.id)) continue;
  const opMap = {
    "webcodecs-audio-checker": "webcodecs-audio",
    "audio-file-inspector": "inspector", "audio-duration-tool": "duration", "audio-waveform-generator": "waveform",
    "audio-to-wav": "to-wav", "audio-trimmer": "trim", "audio-reverser": "reverse", "audio-normalizer": "normalize",
    "audio-fade-in": "fade-in", "audio-fade-out": "fade-out", "audio-to-mono": "mono", "audio-to-stereo": "stereo",
    "audio-peak-meter": "peak", "audio-rms-meter": "rms", "audio-silence-detector": "silence",
    "audio-channel-balance": "channel-balance", "audio-dc-offset-checker": "dc-offset",
    "audio-joiner": "join",
  };
  tool.engine = { type: "audio", op: opMap[tool.id] };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

// AI micro-tools are local deterministic templates. They never imply a hosted model call.
// Keep true provider/model integrations out of the active catalog until a real integration is shipped.
for (const tool of tools) {
  if (tool.category !== "ai") continue;
  tool.engine = { type: "ai", op: tool.engine?.type === "ai" ? tool.engine.op : tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

const urlMediaInfoProviders = {
  "url-media-inspector": "generic",
};
for (const tool of tools) {
  const provider = urlMediaInfoProviders[tool.id];
  if (!provider) continue;
  tool.engine = { type: "url-media-info", provider };
  tool.requiresBackend = true;
  tool.clientSide = false;
  tool.requiresAuth = false;
  tool.status = "active";
}

const urlMediaProviders = {
  "video-url-downloader": "generic",
  "youtube-video-downloader": "youtube",
  "tiktok-video-downloader": "tiktok",
  "facebook-video-downloader": "facebook",
  "instagram-video-downloader": "instagram",
  "x-video-downloader": "x",
  "youtube-audio-extractor": "youtube",
};
for (const tool of tools) {
  const provider = urlMediaProviders[tool.id];
  if (!provider) continue;
  tool.engine = { type: "url-media", provider };
  tool.requiresBackend = true;
  tool.clientSide = false;
  tool.requiresAuth = false;
  tool.status = "active";
}

const backendRequiredIds = new Set([
  "video-to-text", "video-to-subtitles", "audio-to-text", "audio-to-subtitles",
]);
for (const tool of tools) {
  if (!backendRequiredIds.has(tool.id)) continue;
  tool.requiresBackend = true;
  tool.clientSide = false;
  tool.status = "planned";
}

// Personal tools are genuinely executable with local state/templates/calculations; no backend is implied.
for (const tool of tools) {
  if (tool.category !== "personal") continue;
  tool.engine = { type: "custom", id: tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

// Marketing utilities are deterministic local planners, generators, templates and calculators.
for (const tool of tools) {
  if (tool.category !== "marketing") continue;
  tool.engine = { type: "custom", id: tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
  const action = tool.id.match(/-(brief-generator|headline-helper|cta-generator|calculator|planner|generator|checklist|template)$/)?.[1] || "generator";
  const labels = {
    planner: "Create a local marketing plan with audience, goal, channel, workflow, and measurement steps.",
    generator: "Generate a structured local marketing draft from audience, goal, offer, channel, and notes.",
    calculator: "Calculate practical marketing metrics including CPC, CPL, CPA, conversion rates, ROAS, and net revenue before other costs.",
    "brief-generator": "Generate a structured local marketing brief with objective, audience, offer, message, deliverables, and measurement.",
    checklist: "Create a practical local marketing launch and review checklist.",
    template: "Create an editable local marketing template for the selected marketing topic.",
    "headline-helper": "Generate local headline options from the supplied audience, offer, and goal.",
    "cta-generator": "Generate clear call-to-action options based on the selected marketing topic and offer.",
  };
  tool.description = labels[action];
}

// Communication tools are deterministic local drafting/formatting utilities.
for (const tool of tools) {
  if (tool.category !== "communication") continue;
  tool.engine = { type: "custom", id: tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

// Streaming utilities are deterministic local calculators/planners/generators; no backend is implied.
for (const tool of tools) {
  if (tool.category !== "streaming") continue;
  tool.engine = { type: "custom", id: tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
}

// Accessibility utilities run locally. They provide deterministic WCAG-oriented checks,
// calculations, previews and templates without claiming automated compliance certification.
for (const tool of tools) {
  if (tool.category !== "accessibility") continue;
  tool.engine = { type: "custom", id: tool.id };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
  tool.requiresAuth = false;
  const action = tool.id.match(/-(checker|generator|simulator|helper|preview)$/)?.[1] || "checker";
  const labels = {
    checker: "Run a local accessibility-oriented check using the supplied values or markup.",
    generator: "Generate an accessibility-oriented starting point, template, or recommendation locally.",
    simulator: "Simulate or calculate an accessibility scenario locally for inspection and testing.",
    helper: "Provide practical accessibility guidance from the supplied values or markup.",
    preview: "Preview an accessibility result locally before implementation."
  };
  tool.description = labels[action];
}

// Auto-related: same category, nearest popularity
const byCat = new Map();
for (const t of tools) {
  if (!byCat.has(t.category)) byCat.set(t.category, []);
  byCat.get(t.category).push(t);
}
for (const t of tools) {
  const peers = byCat
    .get(t.category)
    .filter((x) => x.id !== t.id && x.status !== "planned")
    .sort((a, b) => Math.abs(a.popularity - t.popularity) - Math.abs(b.popularity - t.popularity))
    .slice(0, 6)
    .map((x) => x.id);
  t.related = peers;
}

// Network utilities run locally. Keep remote lookup/scanning tools planned until a deliberate backend is added.
const networkOps = new Set(["ipv4-calculator","subnet-calculator","cidr-calculator","ipv4-binary","ipv4-decimal","ipv4-network-address","ipv4-broadcast-address","ipv4-host-range","ipv4-wildcard-mask","ipv4-mask-from-prefix","ipv4-prefix-from-mask","ipv4-host-count","ipv4-subnet-count","ipv4-split-subnets","ipv6-expand","ipv6-compress","ipv6-binary","ipv6-address-type","ipv6-subnet-calculator","url-parser","url-query-parser","url-query-builder","url-origin","url-path-analyzer","url-encode","url-decode","port-lookup","port-reference","http-status-reference","http-method-reference","header-format","header-parser","basic-auth-header","bearer-header","content-type-reference","websocket-url-builder","localhost-url-builder","connection-info"]);
for (const tool of tools) {
  if (tool.category === "network" && networkOps.has(tool.id)) {
    tool.engine = { type: "network", op: tool.id };
    tool.status = "active";
    tool.clientSide = true;
    tool.requiresBackend = false;
  }
}

// Promote converter-family expansions to the real converter engine.
const converterSystems = {
  length: "length", mass: "mass", weight: "weight", area: "area", volume: "volume",
  speed: "speed", time: "time", pressure: "pressure", energy: "energy", power: "power",
  force: "force", frequency: "frequency", "data-storage": "storage", storage: "storage",
  "data-transfer": "data-transfer", temperature: "temperature", angle: "angle", torque: "torque",
  density: "density", "flow-rate": "flow-rate", "fuel-economy": "fuel-economy", fuel: "fuel",
  cooking: "cooking", paper: "paper", dpi: "dpi", pixels: "pixels",
};
for (const tool of tools) {
  if (tool.category !== "converters") continue;
  const match = tool.name.match(/^(.*?) (Converter|Table|Quick Converter|Comparison|Reference)$/);
  const base = match?.[1]?.toLowerCase().replace(/\s+/g, "-");
  const system = converterSystems[base];
  if (!system) continue;
  const suffix = match?.[2];
  const mode = suffix === "Table" ? "table" : suffix === "Quick Converter" ? "quick" : suffix === "Comparison" ? "comparison" : suffix === "Reference" ? "reference" : "standard";
  tool.engine = { type: "converter", system, mode };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
}

// File-format converters are also fully client-side. Files are processed locally.
const fileConverterOps = {
  "JPG to PNG Converter": "jpg-to-png", "PNG to JPG Converter": "png-to-jpg",
  "PNG to WebP Converter": "png-to-webp", "WebP to PNG Converter": "webp-to-png",
  "JPG to WebP Converter": "jpg-to-webp", "WebP to JPG Converter": "webp-to-jpg",
  "SVG to PNG Converter": "svg-to-png", "PNG to SVG Helper": "png-to-svg",
  "CSV to JSON Converter": "csv-to-json", "JSON to CSV Converter": "json-to-csv",
  "CSV to TSV Converter": "csv-to-tsv", "TSV to CSV Converter": "tsv-to-csv",
  "XML to JSON Converter": "xml-to-json", "JSON to XML Converter": "json-to-xml",
  "YAML to JSON Converter": "yaml-to-json", "JSON to YAML Converter": "json-to-yaml",
  "TXT to CSV Converter": "txt-to-csv", "CSV to TXT Converter": "csv-to-txt",
  "Markdown to HTML Converter": "markdown-to-html", "HTML to Markdown Converter": "html-to-markdown",
};
for (const tool of tools) {
  const op = fileConverterOps[tool.name];
  if (!op) continue;
  tool.engine = { type: "file-converter", op };
  tool.status = "active";
  tool.clientSide = true;
  tool.requiresBackend = false;
}

// MIME lookup/inspection runs entirely client-side using a curated reference table and magic-byte signatures.
for (const tool of tools) {
  if (tool.engine?.type === "mime") {
    tool.engine = { type: "mime", op: "lookup" };
    tool.status = "active";
    tool.clientSide = true;
    tool.requiresBackend = false;
  }
}



// Large, executable equation families. Each expansion row produces three
// solve-for calculators. The calculator engine implements the same equations
// in math-exercise-calculators.ts, so catalog growth stays synchronized with
// real client-side computation instead of creating placeholder tools.
function addEquationExpansionTools() {
  const families = [
    ["product", "Product Relationship", "×"],
    ["sum", "Sum Relationship", "+"],
    ["ratio", "Ratio Relationship", "÷"],
  ];
  for (const [family, familyLabel, operator] of families) {
    for (const [key, aLabel, bLabel, cLabel] of mathExpansion[family]) {
      for (const target of ["a", "b", "c"]) {
        const targetLabel = target === "a" ? aLabel : target === "b" ? bLabel : cLabel;
        const id = `exp-${family}-${key}-${target}`;
        if (RAW.some((row) => row[0] === id)) continue;
        const formula = `${cLabel} = ${aLabel} ${operator} ${bLabel}`;
        RAW.push([
          id,
          `${familyLabel}: ${aLabel} ${operator} ${bLabel} = ${cLabel} — solve for ${targetLabel}`,
          "calculators",
          `Solve the ${formula} relationship for ${targetLabel}. This is a real browser-local equation calculator.`,
          "calculator",
          id,
          `${family} equation ${aLabel} ${bLabel} ${cLabel} solve`,
          0,
          58,
          "n",
        ]);
      }
    }
  }
}

addEquationExpansionTools();


function js(value) {
  return JSON.stringify(value);
}


// v10 media additions. Voice cleanup is browser-local; video denoise remains planned
// until a backend with a verified denoise implementation is connected.
const v10AudioOps = {
  "voice-noise-reducer": "voice-noise-reducer",
  "voice-noise-gate": "voice-noise-gate",
  "audio-hum-reducer": "audio-hum-reducer",
};
const v10VideoPlanned = new Set(["video-noise-reducer","video-grain-reducer"]);
for (const tool of tools) {
  if (!v10VideoPlanned.has(tool.id)) continue;
  tool.status = "planned"; tool.clientSide = false; tool.requiresBackend = true; tool.requiresAuth = false;
}

for (const tool of tools) {
  const op = v10AudioOps[tool.id];
  if (!op) continue;
  tool.engine = { type: "audio", op };
  tool.status = "active"; tool.clientSide = true; tool.requiresBackend = false; tool.requiresAuth = false;
}

// Keep the generated catalog deterministic and human-navigable: categories are
// grouped alphabetically by their visible label, then tools are alphabetized by
// visible name within each category. The registry applies the same tool ordering
// for category views, so regeneration cannot silently restore popularity ordering.
const CATEGORY_LABELS = {
  accessibility: "Accessibility",
  ai: "AI micro-tools",
  audio: "Audio",
  business: "Business",
  calculators: "Calculators",
  career: "Career",
  celebrations: "Celebrations",
  communication: "Communication",
  converters: "Unit converters",
  creators: "Creators & music",
  datetime: "Date & time",
  design: "Design",
  developer: "Developer",
  ecommerce: "E-commerce",
  education: "Education",
  events: "Events",
  files: "Files",
  fitness: "Fitness & health",
  food: "Food & Cooking",
  gaming: "Gaming",
  generators: "Generators",
  image: "Image",
  interactive: "Interactive Experiences",
  marketing: "Marketing",
  mockups: "Mockups",
  network: "Web & network",
  pdf: "PDF & documents",
  personal: "Personal Utilities",
  photography: "Photography",
  productivity: "Productivity",
  qr: "QR & barcodes",
  random: "Random & fun",
  relationships: "Relationships & Social",
  screenshots: "Screenshots & devices",
  security: "Security & privacy",
  seo: "SEO & web",
  social: "Social media",
  streaming: "Streaming",
  testdata: "Test data",
  text: "Text",
  travel: "Travel",
  video: "Video",
  webdesign: "Web Design",
};

function alphabeticalKey(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compareAlphabetically(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

tools.sort((a, b) =>
  compareAlphabetically(
    alphabeticalKey(CATEGORY_LABELS[a.category] ?? a.category),
    alphabeticalKey(CATEGORY_LABELS[b.category] ?? b.category),
  ) ||
  compareAlphabetically(alphabeticalKey(a.name), alphabeticalKey(b.name)) ||
  compareAlphabetically(a.id, b.id),
);

const serializedCatalog = js(tools);
const chunkSize = 60_000;
const catalogChunks = [];
for (let start = 0; start < serializedCatalog.length; start += chunkSize) {
  catalogChunks.push(JSON.stringify(serializedCatalog.slice(start, start + chunkSize)));
}

const body = `import type { ToolMeta } from "@/types/tool";

const catalogJson = [
${catalogChunks.join(",\n")}
].join("");

export const tools: ToolMeta[] = JSON.parse(catalogJson) as ToolMeta[];
`;

writeFileSync(new URL("../src/data/catalog.ts", import.meta.url), body);
const active = tools.filter((t) => t.status !== "planned").length;
const planned = tools.length - active;
console.log(`Wrote ${tools.length} tools (${active} active, ${planned} planned)`);
