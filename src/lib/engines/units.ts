export type Unit = {
  id: string;
  label: string;
  toBase: number;
  offset?: number;
  inverse?: boolean;
  table?: Record<string, number>;
};

export type System = { id: string; name: string; units: Unit[] };

export type DpiInput = {
  pixels?: number;
  inches?: number;
  mm?: number;
  dpi?: number;
};

export type DpiResult = {
  pixels: number;
  inches: number;
  mm: number;
  dpi: number;
};

export type PaperSize = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
};

function u(id: string, label: string, toBase: number, extra?: Partial<Unit>): Unit {
  return { id, label, toBase, ...extra };
}

const LENGTH: Unit[] = [
  u("nm", "Nanometre (nm)", 1e-9),
  u("um", "Micrometre (µm)", 1e-6),
  u("mm", "Millimetre (mm)", 0.001),
  u("cm", "Centimetre (cm)", 0.01),
  u("dm", "Decimetre (dm)", 0.1),
  u("m", "Metre (m)", 1),
  u("km", "Kilometre (km)", 1000),
  u("mil", "Mil (thou)", 0.0000254),
  u("in", "Inch (in)", 0.0254),
  u("ft", "Foot (ft)", 0.3048),
  u("yd", "Yard (yd)", 0.9144),
  u("mi", "Mile (mi)", 1609.344),
  u("nmi", "Nautical mile", 1852),
  u("fathom", "Fathom", 1.8288),
  u("furlong", "Furlong", 201.168),
  u("au", "Astronomical unit", 149597870700),
  u("ly", "Light-year", 9.4607304725808e15),
  u("pc", "Parsec", Number("3.0856775814913673e16")),
];

const MASS_UNITS: Unit[] = [
  u("ug", "Microgram (µg)", 1e-9),
  u("mg", "Milligram (mg)", 1e-6),
  u("g", "Gram (g)", 0.001),
  u("kg", "Kilogram (kg)", 1),
  u("t", "Tonne (t)", 1000),
  u("oz", "Ounce (oz)", 0.028349523125),
  u("lb", "Pound (lb)", 0.45359237),
  u("st", "Stone (st)", 6.35029318),
  u("ton", "Short ton (US)", 907.18474),
  u("long-ton", "Long ton (UK)", 1016.0469088),
  u("slug", "Slug", 14.593902937),
  u("ct", "Carat", 0.0002),
  u("gr", "Grain", 0.00006479891),
];

const TEMPERATURE: Unit[] = [
  u("c", "Celsius (°C)", 1, { offset: 0 }),
  u("k", "Kelvin (K)", 1, { offset: -273.15 }),
  u("f", "Fahrenheit (°F)", 5 / 9, { offset: -32 }),
  u("r", "Rankine (°R)", 5 / 9, { offset: -491.67 }),
];

const AREA: Unit[] = [
  u("mm2", "Square millimetre", 1e-6),
  u("cm2", "Square centimetre", 1e-4),
  u("m2", "Square metre", 1),
  u("a", "Are", 100),
  u("ha", "Hectare", 10000),
  u("km2", "Square kilometre", 1e6),
  u("in2", "Square inch", 0.00064516),
  u("ft2", "Square foot", 0.09290304),
  u("yd2", "Square yard", 0.83612736),
  u("ac", "Acre", 4046.8564224),
  u("mi2", "Square mile", 2589988.110336),
];

const VOLUME: Unit[] = [
  u("ml", "Millilitre (ml)", 1e-6),
  u("l", "Litre (L)", 0.001),
  u("m3", "Cubic metre", 1),
  u("cm3", "Cubic centimetre", 1e-6),
  u("in3", "Cubic inch", 1.6387064e-5),
  u("ft3", "Cubic foot", 0.028316846592),
  u("yd3", "Cubic yard", 0.764554857984),
  u("tsp", "Teaspoon (US)", 4.92892159375e-6),
  u("tbsp", "Tablespoon (US)", 1.478676478125e-5),
  u("cup", "Cup (US)", 2.365882365e-4),
  u("floz", "Fluid ounce (US)", 2.95735295625e-5),
  u("pt", "Pint (US)", 4.73176473e-4),
  u("qt", "Quart (US)", 9.46352946e-4),
  u("gal", "Gallon (US)", 0.003785411784),
  u("gal-uk", "Gallon (UK)", 0.00454609),
  u("bbl", "Barrel (oil)", 0.158987294928),
];

const SPEED: Unit[] = [
  u("m-s", "Metre per second", 1),
  u("km-h", "Kilometre per hour", 1000 / 3600),
  u("mph", "Mile per hour", 1609.344 / 3600),
  u("knot", "Knot", 1852 / 3600),
  u("ft-s", "Foot per second", 0.3048),
  u("mach", "Mach (sea level)", 340.29),
];

const TIME: Unit[] = [
  u("ns", "Nanosecond", 1e-9),
  u("us", "Microsecond", 1e-6),
  u("ms", "Millisecond", 0.001),
  u("s", "Second", 1),
  u("min", "Minute", 60),
  u("h", "Hour", 3600),
  u("day", "Day", 86400),
  u("week", "Week", 604800),
  u("month", "Month (avg)", 2629800),
  u("year", "Year (Julian)", 31557600),
  u("decade", "Decade", 315576000),
  u("century", "Century", 3155760000),
];

const PRESSURE: Unit[] = [
  u("pa", "Pascal (Pa)", 1),
  u("hpa", "Hectopascal", 100),
  u("kpa", "Kilopascal", 1000),
  u("mpa", "Megapascal", 1e6),
  u("bar", "Bar", 1e5),
  u("mbar", "Millibar", 100),
  u("psi", "Pound per square inch", 6894.757293168),
  u("atm", "Standard atmosphere", 101325),
  u("torr", "Torr", 133.322368421),
  u("mmhg", "Millimetre of mercury", 133.322387415),
  u("inhg", "Inch of mercury", 3386.389),
];

const ENERGY: Unit[] = [
  u("j", "Joule (J)", 1),
  u("kj", "Kilojoule", 1000),
  u("cal", "Calorie (cal)", 4.184),
  u("kcal", "Kilocalorie", 4184),
  u("wh", "Watt-hour", 3600),
  u("kwh", "Kilowatt-hour", 3.6e6),
  u("btu", "British thermal unit", 1055.05585262),
  u("ev", "Electronvolt", 1.602176634e-19),
  u("ft-lb", "Foot-pound", 1.3558179483314),
  u("therm", "Therm (US)", 105480400),
];

const POWER: Unit[] = [
  u("w", "Watt (W)", 1),
  u("mw", "Milliwatt", 0.001),
  u("kw", "Kilowatt", 1000),
  u("mwatt", "Megawatt", 1e6),
  u("hp", "Horsepower (metric)", 735.49875),
  u("hp-us", "Horsepower (imperial)", 745.69987158227),
  u("btu-h", "BTU per hour", 0.29307107),
];

const FORCE: Unit[] = [
  u("n", "Newton (N)", 1),
  u("kn", "Kilonewton", 1000),
  u("dyn", "Dyne", 1e-5),
  u("lbf", "Pound-force", 4.4482216152605),
  u("kgf", "Kilogram-force", 9.80665),
  u("pdl", "Poundal", 0.138254954376),
  u("ozf", "Ounce-force", 0.278013850953781),
];

const FREQUENCY: Unit[] = [
  u("hz", "Hertz (Hz)", 1),
  u("khz", "Kilohertz", 1e3),
  u("mhz", "Megahertz", 1e6),
  u("ghz", "Gigahertz", 1e9),
  u("thz", "Terahertz", 1e12),
  u("rpm", "Revolutions per minute", 1 / 60),
];

const STORAGE: Unit[] = [
  u("bit", "Bit", 1 / 8),
  u("B", "Byte (B)", 1),
  u("kB", "Kilobyte (kB)", 1e3),
  u("MB", "Megabyte (MB)", 1e6),
  u("GB", "Gigabyte (GB)", 1e9),
  u("TB", "Terabyte (TB)", 1e12),
  u("PB", "Petabyte (PB)", 1e15),
  u("EB", "Exabyte (EB)", 1e18),
  u("KiB", "Kibibyte (KiB)", 1024),
  u("MiB", "Mebibyte (MiB)", 1024 ** 2),
  u("GiB", "Gibibyte (GiB)", 1024 ** 3),
  u("TiB", "Tebibyte (TiB)", 1024 ** 4),
  u("PiB", "Pebibyte (PiB)", 1024 ** 5),
  u("EiB", "Exbibyte (EiB)", 1024 ** 6),
];

const DATA_TRANSFER: Unit[] = [
  u("bps", "Bit per second", 1),
  u("kbps", "Kilobit per second", 1e3),
  u("mbps", "Megabit per second", 1e6),
  u("gbps", "Gigabit per second", 1e9),
  u("tbps", "Terabit per second", 1e12),
  u("Bps", "Byte per second", 8),
  u("kBps", "Kilobyte per second", 8e3),
  u("MBps", "Megabyte per second", 8e6),
  u("GBps", "Gigabyte per second", 8e9),
  u("Kibps", "Kibibit per second", 1024),
  u("Mibps", "Mebibit per second", 1024 ** 2),
  u("KiBps", "Kibibyte per second", 8 * 1024),
  u("MiBps", "Mebibyte per second", 8 * 1024 ** 2),
];

const ANGLE: Unit[] = [
  u("rad", "Radian", 1),
  u("deg", "Degree", Math.PI / 180),
  u("grad", "Gradian", Math.PI / 200),
  u("turn", "Turn", Math.PI * 2),
  u("arcmin", "Arcminute", Math.PI / 180 / 60),
  u("arcsec", "Arcsecond", Math.PI / 180 / 3600),
  u("mil", "NATO mil", Math.PI / 3200),
];

const TORQUE: Unit[] = [
  u("nm", "Newton-metre (N·m)", 1),
  u("lbf-ft", "Pound-force foot", 1.3558179483314),
  u("lbf-in", "Pound-force inch", 0.1129848290276167),
  u("kgf-m", "Kilogram-force metre", 9.80665),
  u("ozf-in", "Ounce-force inch", 0.007061551833141662),
  u("dyn-cm", "Dyne-centimetre", 1e-7),
];

const FUEL: Unit[] = [
  u("km-l", "Kilometre per litre", 1),
  u("mpg-us", "Miles per gallon (US)", 0.425143707),
  u("mpg-uk", "Miles per gallon (UK)", 0.35400619),
  u("mi-l", "Mile per litre", 1.609344),
  u("l-100km", "Litres per 100 km", 100, { inverse: true }),
];

const COOKING: Unit[] = [
  u("ml", "Millilitre", 1),
  u("l", "Litre", 1000),
  u("tsp", "Teaspoon", 4.92892),
  u("tbsp", "Tablespoon", 14.7868),
  u("cup", "Cup (US)", 236.588),
  u("floz", "Fluid ounce (US)", 29.5735),
  u("pt", "Pint (US)", 473.176),
  u("qt", "Quart (US)", 946.353),
  u("gal", "Gallon (US)", 3785.41),
  u("g", "Gram (water)", 1),
  u("kg", "Kilogram (water)", 1000),
  u("oz", "Ounce (weight)", 28.3495),
  u("lb", "Pound (weight)", 453.592),
  u("pinch", "Pinch", 0.31),
  u("dash", "Dash", 0.62),
  u("stick", "Stick of butter", 113.4),
];

const SHOE_US_M: Record<string, number> = {
  "3.5": 35.5, "4": 36, "4.5": 36.5, "5": 37, "5.5": 37.5, "6": 38.5, "6.5": 39,
  "7": 40, "7.5": 40.5, "8": 41, "8.5": 42, "9": 42.5, "9.5": 43, "10": 44,
  "10.5": 44.5, "11": 45, "11.5": 45.5, "12": 46, "13": 47.5, "14": 48.5,
};

const SHOE_US_W: Record<string, number> = {
  "5": 35.5, "5.5": 36, "6": 36.5, "6.5": 37, "7": 37.5, "7.5": 38.5, "8": 39,
  "8.5": 40, "9": 40.5, "9.5": 41, "10": 42, "10.5": 42.5, "11": 43, "11.5": 44,
  "12": 44.5, "13": 45.5,
};

const SHOE_UK: Record<string, number> = {
  "2.5": 35.5, "3": 36, "3.5": 36.5, "4": 37, "4.5": 37.5, "5": 38.5, "5.5": 39,
  "6": 40, "6.5": 40.5, "7": 41, "7.5": 42, "8": 42.5, "8.5": 43, "9": 44,
  "9.5": 44.5, "10": 45, "10.5": 45.5, "11": 46, "12": 47.5, "13": 48.5,
};

const SHOE_JP: Record<string, number> = {
  "21.5": 35.5, "22": 36, "22.5": 36.5, "23": 37, "23.5": 37.5, "24": 38.5,
  "24.5": 39, "25": 40, "25.5": 40.5, "26": 41, "26.5": 42, "27": 42.5,
  "27.5": 43, "28": 44, "28.5": 44.5, "29": 45, "29.5": 45.5, "30": 46, "31": 47.5,
};

const SHOE: Unit[] = [
  u("eu", "EU", 1),
  u("us-m", "US Men's", 0, { table: SHOE_US_M }),
  u("us-w", "US Women's", 0, { table: SHOE_US_W }),
  u("uk", "UK", 0, { table: SHOE_UK }),
  u("jp", "Japan (cm)", 0, { table: SHOE_JP }),
  u("mondo", "Mondopoint (mm)", 0.1, { offset: -150 }),
];

const CLOTHING_US: Record<string, number> = {
  "0": 1, "2": 2, "4": 3, "6": 4, "8": 5, "10": 6, "12": 7, "14": 8, "16": 9, "18": 10,
};

const CLOTHING_UK: Record<string, number> = {
  "4": 1, "6": 2, "8": 3, "10": 4, "12": 5, "14": 6, "16": 7, "18": 8, "20": 9, "22": 10,
};

const CLOTHING_EU: Record<string, number> = {
  "32": 1, "34": 2, "36": 3, "38": 4, "40": 5, "42": 6, "44": 7, "46": 8, "48": 9, "50": 10,
};

const CLOTHING_ALPHA: Record<string, number> = {
  "0": 1, "1": 2, "2": 4, "3": 6, "4": 8, "5": 9, "6": 10,
};

const CLOTHING: Unit[] = [
  u("scale", "Numeric (1–10)", 1),
  u("us", "US (women's)", 0, { table: CLOTHING_US }),
  u("uk", "UK (women's)", 0, { table: CLOTHING_UK }),
  u("eu", "EU", 0, { table: CLOTHING_EU }),
  u("alpha", "Alpha (0=XXS … 6=XXL)", 0, { table: CLOTHING_ALPHA }),
  u("it", "Italy", 0, { table: { "36": 1, "38": 2, "40": 3, "42": 4, "44": 5, "46": 6, "48": 7, "50": 8, "52": 9, "54": 10 } }),
];

export const paperSizes: Record<string, PaperSize> = {
  a0: { id: "a0", name: "A0", widthMm: 841, heightMm: 1189 },
  a1: { id: "a1", name: "A1", widthMm: 594, heightMm: 841 },
  a2: { id: "a2", name: "A2", widthMm: 420, heightMm: 594 },
  a3: { id: "a3", name: "A3", widthMm: 297, heightMm: 420 },
  a4: { id: "a4", name: "A4", widthMm: 210, heightMm: 297 },
  a5: { id: "a5", name: "A5", widthMm: 148, heightMm: 210 },
  a6: { id: "a6", name: "A6", widthMm: 105, heightMm: 148 },
  a7: { id: "a7", name: "A7", widthMm: 74, heightMm: 105 },
  b4: { id: "b4", name: "B4", widthMm: 250, heightMm: 353 },
  b5: { id: "b5", name: "B5", widthMm: 176, heightMm: 250 },
  letter: { id: "letter", name: "US Letter", widthMm: 216, heightMm: 279 },
  legal: { id: "legal", name: "US Legal", widthMm: 216, heightMm: 356 },
  tabloid: { id: "tabloid", name: "Tabloid", widthMm: 279, heightMm: 432 },
  executive: { id: "executive", name: "Executive", widthMm: 184, heightMm: 267 },
  statement: { id: "statement", name: "Statement", widthMm: 140, heightMm: 216 },
};

const PAPER: Unit[] = Object.values(paperSizes).map((p) =>
  u(p.id, p.name, 0, { table: { "1": p.widthMm } }),
);

const DPI: Unit[] = [
  u("px", "Pixels", 1 / 96),
  u("in", "Inches", 1),
  u("mm", "Millimetres", 1 / 25.4),
  u("dpi", "DPI / PPI", 0),
];

function sys(id: string, name: string, units: Unit[]): System {
  return { id, name, units };
}

export const systems: Record<string, System> = {
  length: sys("length", "Length", LENGTH),
  weight: sys("weight", "Weight", MASS_UNITS),
  mass: sys("mass", "Mass", MASS_UNITS),
  temperature: sys("temperature", "Temperature", TEMPERATURE),
  area: sys("area", "Area", AREA),
  volume: sys("volume", "Volume", VOLUME),
  speed: sys("speed", "Speed", SPEED),
  time: sys("time", "Time", TIME),
  pressure: sys("pressure", "Pressure", PRESSURE),
  energy: sys("energy", "Energy", ENERGY),
  power: sys("power", "Power", POWER),
  force: sys("force", "Force", FORCE),
  frequency: sys("frequency", "Frequency", FREQUENCY),
  storage: sys("storage", "Digital storage", STORAGE),
  "data-transfer": sys("data-transfer", "Data transfer", DATA_TRANSFER),
  angle: sys("angle", "Angle", ANGLE),
  torque: sys("torque", "Torque", TORQUE),
  fuel: sys("fuel", "Fuel economy", FUEL),
  cooking: sys("cooking", "Cooking", COOKING),
  shoe: sys("shoe", "Shoe size", SHOE),
  clothing: sys("clothing", "Clothing size", CLOTHING),
  paper: sys("paper", "Paper size", PAPER),
  dpi: sys("dpi", "DPI / PPI", DPI),
};

function findUnit(system: System, id: string): Unit | undefined {
  const lower = id.toLowerCase();
  return system.units.find((unit) => unit.id.toLowerCase() === lower);
}

function tableEntries(table: Record<string, number>): Array<[number, number]> {
  return Object.entries(table)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
}

function tableToBase(table: Record<string, number>, value: number): number {
  const exact = table[String(value)];
  if (typeof exact === "number") return exact;
  const entries = tableEntries(table);
  if (entries.length === 0) return value;
  if (value <= entries[0]![0]) return entries[0]![1];
  const last = entries[entries.length - 1]!;
  if (value >= last[0]) return last[1];
  for (let i = 1; i < entries.length; i += 1) {
    const [x0, y0] = entries[i - 1]!;
    const [x1, y1] = entries[i]!;
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function tableFromBase(table: Record<string, number>, base: number): number {
  const entries = tableEntries(table);
  if (entries.length === 0) return base;
  if (base <= entries[0]![1]) return entries[0]![0];
  const last = entries[entries.length - 1]!;
  if (base >= last[1]) return last[0];
  for (let i = 1; i < entries.length; i += 1) {
    const [x0, y0] = entries[i - 1]!;
    const [x1, y1] = entries[i]!;
    if (base <= y1) {
      const span = y1 - y0;
      const t = span === 0 ? 0 : (base - y0) / span;
      return x0 + t * (x1 - x0);
    }
  }
  return last[0];
}

function toBaseValue(unit: Unit, value: number): number {
  if (unit.inverse) {
    if (value === 0) return Number.NaN;
    return unit.toBase / value;
  }
  if (unit.toBase === 0 && unit.table) {
    return tableToBase(unit.table, value);
  }
  return (value + (unit.offset ?? 0)) * (unit.toBase === 0 ? 1 : unit.toBase);
}

function fromBaseValue(unit: Unit, base: number): number {
  if (unit.inverse) {
    if (base === 0) return Number.NaN;
    return unit.toBase / base;
  }
  if (unit.toBase === 0 && unit.table) {
    return tableFromBase(unit.table, base);
  }
  const factor = unit.toBase === 0 ? 1 : unit.toBase;
  return base / factor - (unit.offset ?? 0);
}

const DEFAULT_DPI = 96;

function convertDpi(value: number, from: string, to: string): number {
  const fromId = from.toLowerCase();
  const toId = to.toLowerCase();
  let inches: number;
  if (fromId === "in") inches = value;
  else if (fromId === "mm") inches = value / 25.4;
  else if (fromId === "px") inches = value / DEFAULT_DPI;
  else if (fromId === "dpi") {
    if (toId === "dpi") return value;
    return Number.NaN;
  } else {
    return Number.NaN;
  }
  if (toId === "in") return inches;
  if (toId === "mm") return inches * 25.4;
  if (toId === "px") return inches * DEFAULT_DPI;
  if (toId === "dpi") return DEFAULT_DPI;
  return Number.NaN;
}

export function dpiConvert(input: DpiInput): DpiResult {
  const dpi = input.dpi && input.dpi > 0 ? input.dpi : DEFAULT_DPI;
  let inches = input.inches;
  if (inches === undefined && input.mm !== undefined) inches = input.mm / 25.4;
  let pixels = input.pixels;
  if (pixels === undefined && inches !== undefined) pixels = inches * dpi;
  if (inches === undefined && pixels !== undefined) inches = pixels / dpi;
  if (pixels !== undefined && inches !== undefined && input.dpi === undefined) {
    const derived = inches === 0 ? dpi : pixels / inches;
    return {
      pixels,
      inches,
      mm: inches * 25.4,
      dpi: derived,
    };
  }
  const px = pixels ?? 0;
  const inn = inches ?? 0;
  return {
    pixels: px,
    inches: inn,
    mm: inn * 25.4,
    dpi,
  };
}

export function paperInfo(id: string): string {
  const paper = paperSizes[id.toLowerCase()];
  if (!paper) return "";
  const inW = paper.widthMm / 25.4;
  const inH = paper.heightMm / 25.4;
  return `${paper.name}: ${paper.widthMm} × ${paper.heightMm} mm (${inW.toFixed(2)} × ${inH.toFixed(2)} in)`;
}

export function formatUnitValue(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e10)) {
    return n.toExponential(6).replace(/\.?0+e/, "e");
  }
  const text = abs >= 1e6 ? n.toPrecision(8) : n.toPrecision(10);
  const num = Number(text);
  if (!Number.isFinite(num)) return String(n);
  let s = num.toString();
  if (s.includes("e")) return s;
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s;
}

export function convert(systemId: string, value: number, from: string, to: string): number {
  if (!Number.isFinite(value)) return Number.NaN;
  const system = systems[systemId];
  if (!system) throw new Error(`Unknown system: ${systemId}`);
  if (from === to) return value;

  if (systemId === "dpi") {
    return convertDpi(value, from, to);
  }

  if (systemId === "paper") {
    const fromPaper = paperSizes[from.toLowerCase()];
    const toPaper = paperSizes[to.toLowerCase()];
    if (fromPaper && toPaper) return toPaper.widthMm;
    if (fromPaper) return fromPaper.widthMm * value;
    return Number.NaN;
  }

  const fromUnit = findUnit(system, from);
  const toUnit = findUnit(system, to);
  if (!fromUnit) throw new Error(`Unknown unit: ${from}`);
  if (!toUnit) throw new Error(`Unknown unit: ${to}`);
  const base = toBaseValue(fromUnit, value);
  return fromBaseValue(toUnit, base);
}
