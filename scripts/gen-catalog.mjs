/**
 * Generates src/data/catalog.ts from compact tool tuples.
 * Run: node scripts/gen-catalog.mjs
 */
import { writeFileSync } from "node:fs";

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
  ["frequency-wavelength-calculator","Frequency & Wavelength Calculator","calculators","Convert between frequency and wavelength (c = fλ).","calculator","freq-wave","frequency wavelength light",0,64],
  ["work-calculator","Work Calculator","calculators","Work from force and distance.","calculator","work","work joule physics",0,60],
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
  ["base64-encoder","Base64 Encoder","developer","Encode text or files to Base64.","codec","base64-encode","base64 encode",1,93],
  ["base64-decoder","Base64 Decoder","developer","Decode Base64 to text or a downloadable file.","codec","base64-decode","base64 decode",1,92],
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
  ["regex-tester","Regex Tester","developer","Test a regular expression against sample text with matches highlighted.","custom","regex-tester","regex test match javascript",1,96],
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
  ["cron-generator","Cron Expression Generator","developer","Build a 5-field cron expression with a human-readable summary.","custom","cron-generator","cron schedule quartz",1,87],
  ["cron-parser","Cron Parser","developer","Explain a cron expression in plain language.","custom","cron-generator","cron parse explain",0,80],
  ["unix-timestamp-converter","Unix Timestamp Converter","developer","Convert between Unix time and human-readable dates.","datetime","unix","unix epoch timestamp",1,92],
  ["http-status-lookup","HTTP Status Lookup","developer","Look up HTTP status codes and what they mean.","custom","http-status","http status 404 500",1,85],
  ["user-agent-parser","User-Agent Parser","developer","Parse a user-agent string into browser, OS, and device hints.","custom","user-agent","user-agent ua browser",0,76],
  ["url-parser","URL Parser","developer","Split a URL into protocol, host, path, query, and hash.","custom","url-parser","url parse query",0,84],
  ["query-string-parser","Query String Parser","developer","Parse and build URL query strings.","custom","url-parser","query string params",0,78],
  ["mime-lookup","MIME Type Lookup","developer","Look up MIME types by extension and the reverse.","custom","mime-lookup","mime content-type extension",0,77],
  ["data-uri-generator","Data URI Generator","developer","Turn text or a file into a data: URI.","custom","data-uri","data uri base64",0,74],
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
  ["mime-type-lookup","MIME Type Lookup","files","Find a MIME type from a file extension.","custom","mime-lookup","mime extension",0,72],
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
  ["bmr-calculator","BMR Calculator","fitness","Basal metabolic rate (Mifflin–St Jeor).","calculator","bmr","bmr metabolism calories",1,90,"h"],
  ["tdee-calculator","TDEE Calculator","fitness","Total daily energy expenditure from BMR and activity.","calculator","tdee","tdee calories maintenance",1,92,"h"],
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
  ["age-calculator","Age Calculator","datetime","Exact age in years, months, and days from a birth date.","datetime","age","age birthday years",1,95],
  ["date-difference","Date Difference Calculator","datetime","Days, weeks, and months between two dates.","datetime","date-diff","date difference between",1,90],
  ["workday-calculator","Workday Calculator","datetime","Add business days, skipping weekends.","datetime","workday","workdays business days",0,82],
  ["business-day-calculator","Business Day Calculator","datetime","Count weekdays between two dates.","datetime","business-days","business days weekdays",0,80],
  ["time-duration-calculator","Time Duration Calculator","datetime","Duration between two times or timestamps.","datetime","duration","duration elapsed",0,78],
  ["countdown","Countdown","datetime","Count down to a date and time.","custom","countdown","countdown timer event",1,88],
  ["stopwatch","Stopwatch","productivity","A simple stopwatch with laps.","custom","stopwatch","stopwatch lap",1,86],
  ["world-clock","World Clock","datetime","Current time in major cities.","custom","world-clock","world clock timezone cities",1,87],
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
]);

add([
  ["qr-generator","QR Code Generator","qr","QR code from text or a URL. Download PNG.","qr","text","qr code url",1,99,"n"],
  ["wifi-qr-generator","Wi-Fi QR Generator","qr","QR that joins a Wi-Fi network.","qr","wifi","wifi qr ssid",1,92],
  ["whatsapp-qr-generator","WhatsApp QR Generator","qr","QR that opens a WhatsApp chat.","qr","whatsapp","whatsapp qr",0,84],
  ["email-qr-generator","Email QR Generator","qr","mailto QR with subject and body.","qr","email","email qr mailto",0,78],
  ["phone-qr-generator","Phone QR Generator","qr","tel: QR for a phone number.","qr","phone","phone qr tel",0,76],
  ["sms-qr-generator","SMS QR Generator","qr","sms: QR with a prefilled message.","qr","sms","sms qr",0,74],
  ["vcard-qr-generator","vCard QR Generator","qr","Contact card as a QR code.","qr","vcard","vcard contact qr",1,86],
  ["location-qr-generator","Location QR Generator","qr","geo: QR from latitude and longitude.","qr","geo","maps location qr",0,72],
  ["event-qr-generator","Event QR Generator","qr","VEVENT calendar QR.","qr","event","calendar event qr",0,70],
  ["ean13-barcode","EAN-13 Barcode Generator","qr","EAN-13 product barcode.","barcode","ean13","ean13 barcode",1,82],
  ["upc-barcode","UPC-A Barcode Generator","qr","UPC-A barcode.","barcode","upca","upc barcode",0,78],
  ["code128-barcode","Code 128 Barcode Generator","qr","Code 128 barcode from text.","barcode","code128","code128 barcode",1,80],
  ["isbn-barcode","ISBN Barcode Generator","qr","ISBN-13 as an EAN-13 barcode.","barcode","isbn","isbn barcode book",0,74],
]);

add([
  ["ipv4-calculator","IPv4 Calculator","network","Network, broadcast, and host range from an IP and prefix.","custom","ipv4","ip subnet cidr ipv4",1,88],
  ["subnet-calculator","Subnet Calculator","network","Split a network into subnets.","custom","ipv4","subnet mask cidr",1,86],
  ["cidr-calculator","CIDR Calculator","network","CIDR to mask and host count.","custom","ipv4","cidr mask",0,84],
  ["utm-builder","UTM Builder","network","Same as UTM generator — campaign URLs.","seo","utm","utm",0,70],
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
  ["aspect-ratio-calculator","Aspect Ratio Calculator","video","Reduce a ratio and fit a dimension.","calculator","aspect","aspect ratio 16:9",1,82],
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

// Planned (honest inventory — not counted as available)
add([
  ["background-remover","Background Remover","image","Remove image backgrounds. Needs a dedicated model or API.","custom","bg-remove","remove background",0,50,"p"],
  ["image-upscaler","Image Upscaler","image","AI upscaling requires a model too large for a first-load bundle.","custom","upscale","upscale image",0,48,"p"],
  ["heic-converter","HEIC Converter","image","HEIC decoding is not reliable in every browser.","image","heic","heic convert",0,40,"p"],
  ["pdf-to-word","PDF to Word","pdf","Full PDF→DOCX conversion needs a server-side pipeline.","pdf","pdf-word","pdf word docx",0,45,"p"],
  ["ocr-tool","OCR","pdf","On-device OCR needs a large WASM model.","pdf","ocr","ocr scan text",0,44,"p"],
  ["video-compressor","Video Compressor","video","FFmpeg WASM is large; loaded only when this ships.","custom","vcompress","compress video",0,42,"p"],
  ["video-to-gif","Video to GIF","video","Requires FFmpeg WASM.","custom","vtogif","gif video",0,40,"p"],
  ["audio-joiner","Audio Joiner","audio","Needs decoded audio buffers and an encoder.","custom","ajoin","join audio",0,38,"p"],
  ["whois-lookup","WHOIS Lookup","network","Requires a server-side WHOIS gateway.","custom","whois","whois domain",0,36,"p"],
  ["dns-lookup","DNS Lookup","network","Requires a DNS-over-HTTPS gateway.","custom","dns","dns lookup",0,36,"p"],
  ["website-screenshot","Website Screenshot","network","Requires a headless browser on a server.","custom","webscreenshot","website screenshot",0,35,"p"],
]);

const seen = new Set();
const tools = [];
for (const row of RAW) {
  const [id, name, cat, desc, engineType, engineKey, kw, featured, pop, extra = ""] = row;
  if (seen.has(id)) continue;
  seen.add(id);
  const status = extra.includes("p") ? "planned" : extra.includes("b") ? "beta" : "active";
  let disclaimer;
  if (extra.includes("h")) disclaimer = "health";
  else if (extra.includes("f")) disclaimer = "finance";
  else if (extra.includes("e")) disclaimer = "earnings";
  else if (extra.includes("m")) disclaimer = "mockup";
  else if (extra.includes("s")) disclaimer = "estimate";
  const keywords = kw.split(/\s+/).filter(Boolean);
  const plannedBackend = extra.includes("p") && ["whois","dns","webscreenshot","bg-remove","ocr","pdf-word"].includes(engineKey);

  const engineKeyName =
    engineType === "calculator" ? "formula"
    : engineType === "converter" ? "system"
    : engineType === "custom" ? "id"
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
    engine: { type: engineType, [engineKeyName]: engineKey },
    disclaimer,
    isNew: extra.includes("n") || undefined,
  });
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

function js(value) {
  return JSON.stringify(value);
}

const body = `import type { ToolMeta } from "@/types/tool";

export const tools: ToolMeta[] = ${js(tools)} satisfies ToolMeta[];
`;

writeFileSync(new URL("../src/data/catalog.ts", import.meta.url), body);
const active = tools.filter((t) => t.status !== "planned").length;
const planned = tools.length - active;
console.log(`Wrote ${tools.length} tools (${active} active, ${planned} planned)`);
