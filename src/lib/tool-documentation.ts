import { CATEGORIES } from "@/data/categories";
import type { CategoryId, ToolMeta } from "@/types/tool";

export type ToolDocumentationSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  steps?: string[];
};

type CategoryAdvice = {
  prepare: string;
  verify: string;
  responsibleUse?: string;
};

const CATEGORY_ADVICE: Partial<Record<CategoryId, CategoryAdvice>> = {
  calculators: {
    prepare: "Read the unit labels and definitions for every field before entering values. Calculators can use different conventions for percentages, rates, time periods, dimensions, and rounding, even when their names sound similar.",
    verify: "Check that the result uses the expected unit and that the input values reflect the question you are solving. Recheck critical calculations independently before using them in a financial, engineering, academic, or operational decision.",
  },
  converters: {
    prepare: "Identify the source value and source unit first, then select the requested target unit or conversion mode from the controls provided. Do not assume two similarly named units are interchangeable.",
    verify: "Check the target unit, sign, precision, and rounding. For conversions affected by context, such as temperature scales, data encodings, or date representations, verify the interpretation as well as the displayed number.",
  },
  developer: {
    prepare: "Prepare a representative input and identify the format expected by the tool. Keep a copy of the original before formatting, encoding, decoding, comparing, or transforming production data.",
    verify: "Validate the output with the system that will consume it. A syntactically valid result does not automatically prove that a configuration is secure, compatible, or correct for every downstream use.",
    responsibleUse: "Never paste production credentials, private keys, session cookies, or confidential payloads into a tool unless its processing path and your organization's policy explicitly permit it.",
  },
  text: {
    prepare: "Use the exact text you want to process and check whether line breaks, spaces, punctuation, case, or Unicode characters are significant to your task.",
    verify: "Compare the output with the original around whitespace, line order, punctuation, special characters, and any sections that must stay unchanged.",
  },
  image: {
    prepare: "Choose the intended source image and review the controls available for dimensions, quality, format, transparency, and metadata. Keep the original file until you have checked the processed copy.",
    verify: "Preview the output at its intended display size. Check dimensions, image quality, transparency, color appearance, and metadata behavior where those details matter.",
  },
  pdf: {
    prepare: "Select the source document and review any page, ordering, rotation, or output-format controls shown by the tool. Keep an unchanged copy of source documents that must be preserved.",
    verify: "Open the resulting file and inspect page order, page count, orientation, legibility, links, and any content that is important to retain. A successful download alone does not confirm that every page is correct.",
  },
  audio: {
    prepare: "Review the source file or audio input requested by the tool, then check the available controls for format, channels, sample rate, duration, or processing options. Use only settings that the interface actually exposes.",
    verify: "Play or inspect the resulting audio from beginning to end where practical. Check duration, intelligibility, clipping, channel balance, timing, and the output format before publishing or sharing it.",
  },
  video: {
    prepare: "Check the source video or URL type requested by the tool and review all available output and processing options. For remote media, confirm that you have the right to access and process the content and follow the applicable platform terms.",
    verify: "Review the complete output where practical, including playback, duration, audio synchronization, resolution, orientation, and the selected format. Do not assume a job completed correctly just because a file was produced.",
    responsibleUse: "Only process or redistribute media when you have the necessary rights and authorization. Availability can depend on configured services and platform restrictions.",
  },
  qr: {
    prepare: "Confirm the exact text, URL, contact details, or other payload you intend to encode. Review the error-correction, styling, or export controls only when they are provided by the tool.",
    verify: "Scan the generated code using a real device before printing or publishing it. Check the decoded destination and test the final size, contrast, quiet zone, and printed surface where applicable.",
    responsibleUse: "A QR code can make its encoded data easy to share. Do not encode passwords, private credentials, or personal information in a code that may become public.",
  },
  security: {
    prepare: "Use a test value or sample that is appropriate for the operation, and read whether the tool generates, inspects, transforms, or removes data. A security utility's scope is limited to the check or transformation it actually performs.",
    verify: "Review the result and any warnings. A single successful check is not a full security audit, and generated passwords, hashes, or metadata changes should be verified against the requirements of the system where they will be used.",
    responsibleUse: "Use security tools for systems and data you own or are authorized to assess. Do not treat a tool result as a guarantee that a system is secure.",
  },
  business: {
    prepare: "Enter business details carefully and confirm names, dates, quantities, currency, taxes, and other fields that appear in the form. Use the values required for the actual transaction or document.",
    verify: "Check all totals, identifiers, dates, currency units, and generated document content before issuing or relying on it. Estimates and templates are not a substitute for professional review where one is required.",
  },
  creators: {
    prepare: "Identify the source assumptions behind each estimate or creative output. When a result depends on audience size, platform rules, rates, dimensions, or other variable inputs, use current values and record your assumptions.",
    verify: "Treat forecasts and earnings figures as estimates unless the tool explicitly reports measured source data. Compare creative output with the current requirements of the platform where you plan to use it.",
    responsibleUse: "Platform rules, monetization eligibility, and actual results can change. Verify material claims against the relevant platform or rights holder before acting on them.",
  },
  fitness: {
    prepare: "Use accurate measurements and the units requested by the form. Read the tool's stated assumptions and provide context only when the interface explicitly asks for it.",
    verify: "Interpret calculated values as estimates, not a diagnosis or an individualized treatment plan. Measurement methods, age, health context, and other factors can affect what a result means.",
    responsibleUse: "Health and fitness estimates are informational only and do not replace advice from a qualified healthcare professional.",
  },
  mockups: {
    prepare: "Choose the mockup or fictional scenario you intend to demonstrate and use only the editable fields available in the interface.",
    verify: "Inspect names, timestamps, layouts, visible messages, and exported files so the output accurately reflects the intended demonstration.",
    responsibleUse: "Keep mockups clearly identified as demo, sample, or fictional content. Do not present simulated communications, transactions, identities, or interfaces as genuine evidence.",
  },
  testdata: {
    prepare: "Select the data shape and output format required by your test. Confirm which fields are generated and whether the output is intentionally fictional.",
    verify: "Check schema, field types, escaping, row counts, and edge cases before using the output in a test pipeline.",
    responsibleUse: "Use generated test data in test or sandbox environments. Do not mistake fictional records for verified people, addresses, accounts, or events.",
  },
  seo: {
    prepare: "Prepare the page URL, title, description, structured data, or other source values requested by the specific tool. Confirm whether you are inspecting a draft, a supplied input, or a live webpage.",
    verify: "Compare generated markup or previews with the source page and test the deployed result using the relevant search engine or validation tool. A preview cannot guarantee indexing, ranking, rich-result eligibility, or traffic.",
  },
  travel: {
    prepare: "Enter the trip dates, locations, distances, currency, or other values requested by the specific tool. Distinguish user-supplied assumptions from live transport, booking, map, or weather information.",
    verify: "Check the result against current official schedules, local conditions, prices, and travel requirements before booking or departing. Planning estimates can become outdated.",
  },
  food: {
    prepare: "Confirm the original quantity, serving count, measurement system, and ingredient unit before scaling or converting a recipe.",
    verify: "Check ingredient units and practical rounding after scaling. A mathematical conversion does not automatically account for cooking technique, equipment, ingredient substitutions, or food-safety requirements.",
  },
  accessibility: {
    prepare: "Identify the exact page, component, snippet, or user scenario the tool asks you to inspect. Review the stated scope and any limitations before interpreting a result.",
    verify: "Use flagged items as actionable checks, not as proof of full accessibility or inaccessibility. Confirm issues with keyboard navigation, assistive technology, manual review, and relevant standards when appropriate.",
  },
  social: {
    prepare: "Confirm the target platform and intended placement before selecting dimensions, text, or other options. Different placements within the same platform may use different requirements.",
    verify: "Preview the final content in the intended placement and verify current platform limits, cropping, text length, and publishing rules before posting.",
  },
  marketing: {
    prepare: "Define the audience, channel, product facts, offer terms, and required tone before preparing a marketing asset or plan.",
    verify: "Confirm factual claims, dates, prices, eligibility, links, and disclosures. Suggested copy should be reviewed for brand fit, accessibility, and compliance before publication.",
  },
  ecommerce: {
    prepare: "Use the product, pricing, inventory, shipping, or catalogue values requested by the tool and identify whether values are estimates or live source data.",
    verify: "Recheck currency, quantities, margins, tax treatment, shipping assumptions, and product identifiers against the source system before committing a business decision.",
  },
  events: {
    prepare: "Confirm the event date, time zone, venue or meeting link, schedule, and any RSVP or participation details requested by the tool.",
    verify: "Check date and time displays, time-zone conversions, links, attendee instructions, and event details before sharing invitations or publishing the result.",
  },
  datetime: {
    prepare: "Read the requested date format, time zone, locale, and unit before entering values. Distinguish calendar dates from timestamps and elapsed durations.",
    verify: "Check the selected time zone, daylight-saving assumptions where relevant, and whether the result describes a local time, UTC time, or elapsed interval.",
  },
  design: {
    prepare: "Decide which visual property you need to create, measure, or adjust, then check the available controls and value formats. Color values, dimensions, spacing, and CSS units can look similar while representing different things.",
    verify: "Review the rendered result at the intended size and in the context where it will be used. Test responsive layouts, contrast, browser support, and any generated CSS rather than relying only on a text value or preview.",
  },
  files: {
    prepare: "Identify the source file or data format and the exact target format required by the receiving application. Keep a copy of the original before conversion or restructuring.",
    verify: "Inspect the entire output, including encoding, delimiter or schema, missing values, line endings, and special characters. Successful conversion does not guarantee that another application will interpret the file identically.",
  },
  random: {
    prepare: "Clarify the set of possible choices and the purpose of the random result. Use the options supplied by the tool and understand whether the output is intended for entertainment, decision support, or a technical identifier.",
    verify: "Confirm that the output is within the requested choices and that any reroll, seed, weighting, or repeat behavior shown by the interface is understood. Do not use a casual randomizer for security-sensitive or regulated decisions unless its documentation explicitly supports that use.",
  },
  network: {
    prepare: "Confirm the host, address, URL, or network value the tool asks you to inspect. Determine whether the result should describe a local configuration, a publicly observable service, or a calculation from values you supply.",
    verify: "Network conditions, DNS records, geolocation estimates, and service responses can change by time and vantage point. Treat the result as a point-in-time observation and confirm critical findings from an authoritative system.",
  },
  ai: {
    prepare: "Define the task, intended audience, source facts, and constraints before providing a prompt or source text. Supply only the context needed for the result and avoid confidential data unless the page's processing notice authorizes its use.",
    verify: "Review generated content for accuracy, completeness, tone, unintended assumptions, and unsupported claims. Generated text is a draft to evaluate, not evidence that its facts or recommendations have been verified.",
    responsibleUse: "Disclose and review AI-generated material where appropriate. Do not rely on generated output alone for high-impact medical, legal, financial, safety, or eligibility decisions.",
  },
  education: {
    prepare: "Check the grading scale, credit weighting, term structure, and units expected by the form. Academic conventions differ between institutions, courses, and countries, so use the scale that applies to your programme.",
    verify: "Compare the result against the official course or institution rules before submitting it or making an academic decision. An estimate cannot replace an official transcript, grade policy, or decision by the institution.",
  },
  productivity: {
    prepare: "Define the task, duration, deadline, or planning interval you want to manage. Check whether the tool measures elapsed time, counts down to a target, or simply generates a plan or schedule.",
    verify: "Confirm the start time, pause/resume behavior, selected time zone, and any boundary conditions that matter to the task. Treat generated schedules as planning aids and adjust them to real constraints.",
  },
  generators: {
    prepare: "Decide what kind of output you need and gather the required inputs before generating it. Check whether the result is illustrative, fictional, random, or intended to be used as a real identifier or production asset.",
    verify: "Review the complete output for formatting, completeness, uniqueness where required, and compatibility with the system that will receive it. A generated value is not automatically registered, reserved, valid in a third-party system, or factually true.",
  },
  screenshots: {
    prepare: "Choose the source screenshot and the device frame, layout, or presentation style offered by the tool. Use assets you are authorized to share and preserve an unedited copy of the source.",
    verify: "Check cropping, scaling, safe areas, interface text, and device proportions. A presentation mockup is not a captured test of every device, operating system version, or production UI state.",
  },
  interactive: {
    prepare: "Decide what the participant should see and do, and prepare the content, options, and sequence required by the experience. Keep the flow understandable without relying on hidden assumptions.",
    verify: "Run through the full experience as a participant, including keyboard or touch interaction, empty states, incorrect answers, and the end state. Do not claim that a form collects or stores responses unless the implementation explicitly provides that capability.",
  },
  celebrations: {
    prepare: "Confirm the recipient, occasion, names, spelling, date, and tone before generating a greeting or celebration asset. Use only personal details that you have permission to include.",
    verify: "Preview the finished message or page on the device where it will be shared. Check names, dates, links, and visual wrapping so the result remains respectful and readable.",
  },
  relationships: {
    prepare: "Consider the participants, context, and tone that fit the activity or message. Choose language that is respectful and suitable for the people involved.",
    verify: "Read the output as the recipient would see it. Edit any assumptions or wording that may be intrusive, misleading, or inappropriate for the relationship and context.",
    responsibleUse: "Use playful prompts and relationship activities by mutual choice. Do not use generated content to pressure, impersonate, harass, or expose another person.",
  },
  gaming: {
    prepare: "Check the game, ruleset, scoring convention, player count, or bracket format that the tool expects. Similar games and competitions can use different rules.",
    verify: "Review player or team names, seed order, scoring, tie-breaks, and bracket progression against the competition's actual rules before publishing the result.",
  },
  photography: {
    prepare: "Identify the camera, lens, sensor, print size, output dimensions, or exposure value relevant to your task. Units and crop factors must match the equipment and final use.",
    verify: "Check the result against the target camera or print workflow. Calculated dimensions and exposure estimates depend on their assumptions and cannot fully account for lighting, lens behavior, sensor performance, or output conditions.",
  },
  career: {
    prepare: "Prepare accurate role history, dates, skills, qualifications, and the target role or opportunity. Treat personal career facts as source material, not information to invent for a stronger-sounding result.",
    verify: "Check every claim, date, contact detail, qualification, and example before sharing it with an employer or institution. Tailor wording to the actual role and keep all representations truthful.",
  },
  webdesign: {
    prepare: "Identify the target page, viewport, component, and implementation constraints. Check whether the tool produces a visual preview, CSS, markup, or a checklist before deciding how to use its output.",
    verify: "Test the result in the real project at mobile and desktop widths, and review accessibility, browser support, loading behavior, and interactions. A generated snippet should be reviewed before deployment.",
  },
  streaming: {
    prepare: "Confirm the destination platform, stream resolution, frame rate, audio setup, and available upload bandwidth where those values are requested. Platform presets and network conditions may differ.",
    verify: "Test the configuration against the current platform requirements and your actual upload conditions. Treat bitrate and performance estimates as planning guidance until a live test confirms stability.",
  },
  communication: {
    prepare: "Identify the recipient, purpose, channel, and tone before drafting a message, meeting note, or communication asset. Include only the factual context needed for the recipient to understand it.",
    verify: "Check recipient names, dates, time zones, attachments, links, and requested actions before sending. Generated wording should be reviewed for accuracy and tone.",
  },
  personal: {
    prepare: "Decide the personal task or decision the tool should support and enter only the information it requests. Keep assumptions and personal preferences separate from objectively measured values.",
    verify: "Check the result against the circumstances in which you will use it. A planning or decision aid can organize options, but it cannot account for context that the interface does not collect.",
  },
};


type ToolSpecificGuidance = {
  overview: string;
  example: string;
  validation: string;
};

const CATEGORY_TASK_GUIDANCE: Partial<Record<CategoryId, ToolSpecificGuidance>> = {
  calculators: {
    overview: "A calculator is most useful when its named calculation matches the decision or check you need to make. Identify the quantity being solved for, the meaning of each input, and the units before interpreting a number.",
    example: "Use a small set of values whose relationship you can verify independently. Change one value at a time to see whether the result moves in the expected direction.",
    validation: "Check domain limits, zero values, units, signs, rounding and any formula note. Estimates should not be treated as official quotes or measurements unless the tool explicitly uses an authoritative source.",
  },
  converters: {
    overview: "A converter is appropriate when the same value needs to be represented in another unit or format. Choose the conversion system and the listed source and destination choices that match the task.",
    example: "Convert a familiar reference value and, where possible, reverse the conversion to check the result. Keep the unit or target format attached to the copied value.",
    validation: "Check whether the conversion is exact, rounded, context-dependent or limited to a listed set of choices. Do not treat a conversion as validation of the source data.",
  },
  developer: {
    overview: "Developer utilities help inspect, validate, format, encode, compare, or generate technical values. Their output should be tested in the programming language, protocol, schema, or runtime where it will be used.",
    example: "Start with a small input containing both a common case and an edge case, inspect the output, and test it in the downstream environment before applying the operation to production data.",
    validation: "Check syntax separately from semantics, compatibility and security. Keep credentials, private keys, authentication cookies and sensitive production payloads out of samples.",
  },
  text: {
    overview: "Text tools support a defined transformation or analysis of written content. Use them when the requested operation—such as counting, cleaning, reordering, comparing, or changing text—matches the job to be done.",
    example: "Run a short sample containing punctuation, line breaks, repeated spaces, and non-ASCII characters where relevant. Compare the output with the original to understand exactly what changed.",
    validation: "Confirm how the operation treats whitespace, line endings, case, punctuation, Unicode, and empty input. Preserve an original copy if the transformation is destructive.",
  },
  image: {
    overview: "Image utilities help prepare or inspect an image for a specified visual or technical requirement. The appropriate settings depend on the output dimensions, format, transparency, quality, and intended display use.",
    example: "Use a copy of a representative image and review the result at its intended size. Compare important details with the original before replacing the source asset.",
    validation: "Check dimensions, cropping, image quality, transparency and metadata where relevant. Keep the original until the exported file has been verified.",
  },
  design: {
    overview: "Design tools help create or check a particular visual value, style, or design artifact. Choose the output for the real component or page where it will be used rather than judging a value in isolation.",
    example: "Apply the result to a representative component and inspect it on mobile and desktop widths. Review legibility, spacing, contrast, and the behavior of interactive states.",
    validation: "A generated colour, CSS rule, or visual preview is not a complete design review. Confirm browser support, accessibility, responsiveness, and the constraints of the existing product.",
  },
  pdf: {
    overview: "PDF and document tools help process pages or convert document content through the workflow exposed by the page. Use them when the source format, target result, and page-level operation match the task.",
    example: "Use a duplicate document with a few representative pages. Process it once, open the output independently, and inspect both the first and last pages as well as any pages with important tables or images.",
    validation: "Verify page count and order, rotation, text legibility, links, embedded images, and output integrity. A successful download alone does not prove that all pages survived correctly.",
  },
  files: {
    overview: "File tools help inspect file information or transform structured data between supported representations. Choose the target format based on the application or system that will read the output.",
    example: "Use a small sample with multiple rows or fields and include values that exercise quoting, empty cells, nested structures, or special characters as relevant to the format.",
    validation: "Check encoding, separators, schema, null handling, quoting, line endings and nested data. Conversion may not preserve every feature when the target format has different capabilities.",
  },
  security: {
    overview: "Security tools help with the specific generation, inspection, or transformation named by the tool. Use them as a focused utility within a broader security process, not as proof that an account, file, or system is completely secure.",
    example: "Try a test value or non-production sample first. Confirm the output against the exact requirement of the system where it will be used.",
    validation: "Protect secrets and verify the operation's scope. A strength indicator, hash, or metadata result answers only the question the tool actually tests.",
  },
  fitness: {
    overview: "Fitness and health calculators provide estimates from the measurements and assumptions requested by the tool. Check the input units and context before comparing a result with reference guidance.",
    example: "Use accurately measured values and test that a small input change produces a plausible result. Record the units alongside the output.",
    validation: "Treat results as informational estimates, not a diagnosis or an individual treatment plan. Consult a qualified professional when using the result for a health decision.",
  },
  datetime: {
    overview: "Date and time utilities calculate, compare, or format time-related values. The distinction between an instant, a local clock time, a calendar date, a time zone, and an elapsed duration is important to the result.",
    example: "Use a known date, time, or timestamp and check the result against an independent reference. Where time zones are involved, test a date near a daylight-saving transition if it is relevant to the location.",
    validation: "Verify units, time-zone assumptions, locale and daylight-saving behavior. Seconds and milliseconds are not interchangeable, and the same instant can display as different local clock times.",
  },
  creators: {
    overview: "Creator tools help prepare content or calculate estimates related to publishing, audience, media, or monetization. Identify which inputs are measured facts and which are assumptions before using an estimate.",
    example: "Run a sample with explicit, realistic assumptions, then change one assumption to understand how much it affects the result. Keep a note of the values used if you need to explain the estimate later.",
    validation: "Creator platforms, eligibility rules, rates, and audience outcomes change. Verify important claims against the current platform information and do not treat projected earnings as guaranteed revenue.",
  },
  business: {
    overview: "Business utilities help create or evaluate operational records, document drafts, pricing inputs, and other business information. Use verified business details and review generated material before issuing it externally.",
    example: "Begin with a draft containing a small number of line items or fields. Check the arithmetic, dates and wording before replacing sample values with final transaction data.",
    validation: "Verify names, identifiers, currency, quantities, taxes, totals, dates, and transaction terms. A generated document does not itself prove payment, legal compliance, or entry into an external accounting system.",
  },
  random: {
    overview: "Random and decision tools help select from a defined set of choices or create a playful result. Define the available choices first and make sure the tool's randomness is appropriate for the purpose.",
    example: "Use a small choice set whose result you can check, then confirm that the selected item belongs to the allowed options and that excluded choices are not included.",
    validation: "Do not use casual randomizers for security tokens, regulated selection, or other fairness-sensitive tasks unless the implementation explicitly guarantees the required properties.",
  },
  seo: {
    overview: "SEO tools help prepare, inspect, or preview search-related page information. Their output supports implementation and testing; it cannot guarantee crawling, indexing, eligibility for enhanced results, or ranking.",
    example: "Prepare accurate page facts and check generated markup or metadata against the live page after deployment. Test the deployed URL with current validation tools where available.",
    validation: "Check canonical URLs, metadata escaping, robots directives, schema fields, and consistency with visible content. Search engines make their own crawling and display decisions.",
  },
  qr: {
    overview: "QR and barcode tools encode a value into a code that a compatible scanner can read. The encoded payload, code format and export settings must suit the destination system and the physical or digital context.",
    example: "Generate a code using a non-sensitive sample and scan the exported file with the device or scanner that will be used in practice.",
    validation: "Confirm the decoded payload exactly, then check contrast, quiet space, print size and scanner compatibility. Do not publish a code containing private information unintentionally.",
  },
  network: {
    overview: "Network utilities inspect or calculate a network-related value. Results may depend on the data supplied, the network from which a request runs, and whether a remote service is reachable.",
    example: "Test a known host, address, or sample configuration and compare the result with an authoritative source or the relevant local network configuration.",
    validation: "Treat remote results as observations from a particular time and vantage point. They may not reflect every network, region, resolver, or access policy.",
  },
  ai: {
    overview: "AI-assisted tools generate or transform content from prompts and source information. Define the task, audience, tone and constraints clearly so the result can be evaluated against a concrete purpose.",
    example: "Run a focused prompt with a small amount of non-sensitive context. Review the result, identify missing or unsupported claims, and refine the request only through controls that the page actually provides.",
    validation: "Verify factual claims, names, figures, dates, and links before publication. Generated material is not independently verified evidence and should not be the sole basis of a high-impact decision.",
  },
  education: {
    overview: "Education tools help calculate, organise or prepare academic information. Make sure the grading scale, credit weighting, programme rules and other conventions match the institution or course involved.",
    example: "Use a small example based on an official grading scale, and compare the result with the institution's stated method before applying it to a full term or programme.",
    validation: "Institutional rules vary. Treat estimates as planning aids and use official course or transcript records for formal academic decisions.",
  },
  productivity: {
    overview: "Productivity tools help manage a task, interval, deadline or plan. Confirm whether the tool counts down, tracks elapsed time, or prepares a schedule before interpreting its controls.",
    example: "Run a short test interval and check start, pause, resume, reset and completion behavior where those actions are provided.",
    validation: "Check time zones, deadlines, notification permissions and persistence behavior. A timer or plan should not be assumed to continue running after a browser or app is closed unless that behavior is documented.",
  },
  generators: {
    overview: "Generators create a value, template, or content artifact from the inputs and options they expose. Define the intended output before generating it and verify its fit for the system or audience that will receive it.",
    example: "Create a sample output, inspect its structure and formatting, then test it in the target environment before creating multiple or production-ready values.",
    validation: "Generated data can be fictional, unregistered, duplicated, or incompatible with a third-party system. Confirm uniqueness, format, eligibility and accuracy whenever these properties matter.",
  },
  testdata: {
    overview: "Test-data tools prepare example records or payloads for development and quality checks. Use them to exercise schemas and edge cases in test environments rather than to represent verified real-world records.",
    example: "Generate a small fixture with both normal and boundary values, then validate its field types and schema using the same checks as the application under test.",
    validation: "Keep generated records clearly separated from production records. Do not assume fictional identities, addresses, emails, or payment values belong to real people or work in live services.",
  },
  social: {
    overview: "Social-media tools help prepare copy or assets for a target platform and placement. Start with the exact destination format because profile images, posts, stories, thumbnails and banners can have different requirements.",
    example: "Preview the content at the intended aspect ratio and check any text-length or dimension constraints using current platform requirements before publishing.",
    validation: "Check cropping, accessibility, link destinations, platform rules and factual claims. Requirements may change, so do not rely on an old preset alone.",
  },
  video: {
    overview: "Video tools process or prepare video using the source types and outputs supported by the current workflow. File compatibility, codec support and connected-service availability can affect the result.",
    example: "Test with a short, non-sensitive file, process it once, then play the full output and check image, audio, duration, rotation and synchronization where relevant.",
    validation: "Confirm that the output file is complete and suitable for the destination platform. Only process or redistribute media that you are authorized to use.",
  },
  audio: {
    overview: "Audio tools process, convert, or analyse sound according to the operation exposed by the page. The source codec, channels, sample rate and duration may affect processing compatibility and quality.",
    example: "Use a short representative audio file and listen to the exported result on a compatible player. Check the beginning, end, and a section with the most important content.",
    validation: "Check clipping, silence, channel balance, sample rate, duration and the actual file format when these properties matter. Do not infer quality from a successful export alone.",
  },
  mockups: {
    overview: "Mockup tools create illustrative representations of interfaces or communication. Use them for design, storytelling, and prototyping while keeping the fictional or demonstrative nature clear to viewers.",
    example: "Enter clearly fictional sample content, inspect the rendered layout and verify that names, messages, status indicators and exported files match the intended demonstration.",
    validation: "Do not present simulated messages, identities, transactions or interfaces as genuine evidence or as records from a real service.",
  },
  screenshots: {
    overview: "Screenshot and device-presentation tools arrange visual assets in a chosen frame or presentation. They support presentation and prototyping, but a frame does not prove that the application was tested on that hardware.",
    example: "Use a copy of the screenshot, choose the intended presentation size, and inspect cropping, scale, orientation and text readability before exporting.",
    validation: "Check device proportions, margins, visible interface content and export dimensions. Keep the original screenshot for comparison.",
  },
  interactive: {
    overview: "Interactive-experience tools help assemble a guided sequence, quiz, reveal or other participant-facing interaction. Define the desired participant journey and verify each state rather than reviewing only the initial screen.",
    example: "Run the experience from start to finish using touch and keyboard where supported. Test incorrect answers, empty inputs, back navigation, and the completion state when applicable.",
    validation: "Do not claim live response collection, accounts, persistence, or tracking unless the current implementation explicitly supports those capabilities.",
  },
  celebrations: {
    overview: "Celebration tools prepare a greeting or occasion-specific digital asset. Accurate names, dates and the relationship to the recipient matter as much as the visual result.",
    example: "Create a draft with the recipient's name and occasion, then preview it on a phone-sized screen and check spelling, link behavior and text wrapping.",
    validation: "Proofread the final message and share only the personal information appropriate for the intended audience.",
  },
  relationships: {
    overview: "Relationship and social activities offer prompts, messages or playful experiences that should fit the people and context involved. Select wording and activities that participants can use comfortably and voluntarily.",
    example: "Review a generated prompt as the intended recipient would see it. Edit wording that assumes facts you do not know or that may be intrusive for the relationship.",
    validation: "Use content respectfully and by mutual choice. Do not use a generated message to pressure, impersonate, harass or expose another person.",
  },
  events: {
    overview: "Event tools help prepare schedules, invitations, countdowns, or related planning materials. Ensure that the date, time zone, location and participant instructions are consistent across the final output.",
    example: "Create a test event with a known local date and time, inspect how it is displayed, and check the final invitation or schedule before sharing it with participants.",
    validation: "Confirm time-zone conversions, venue or meeting links, RSVP wording and the latest event details. A generated invitation does not by itself collect responses unless that functionality is explicitly provided.",
  },
  gaming: {
    overview: "Gaming utilities support the specific rules, values, brackets or playful workflows named by the tool. Check the game or competition's actual scoring rules before using the output in a match or event.",
    example: "Use a small test with known participants or scores and check all totals, rankings, ties and progression against the selected ruleset.",
    validation: "Verify player names, seeds, scoring conventions, tie-breaks and bracket progression before publishing results.",
  },
  photography: {
    overview: "Photography utilities help calculate or prepare a technical value for a camera, image, exposure, or print task. Accurate equipment details and consistent measurement units are essential to the result.",
    example: "Use a known sensor size, image dimension or print requirement and compare the output with the equipment specifications or an independent reference.",
    validation: "Distinguish a mathematical estimate from real-world optical, lighting, sensor and print behavior. Check the target device or print workflow before relying on the result.",
  },
  travel: {
    overview: "Travel utilities organise or estimate a trip-related value. Separate the information you supply from live schedules, current prices, local conditions, and official entry requirements.",
    example: "Use confirmed trip dates and locations to calculate a plan, then check all date, distance and budget assumptions against current official sources before committing.",
    validation: "Schedules, prices, weather, transit conditions and entry rules change. Confirm current information with the relevant official service before booking or travelling.",
  },
  food: {
    overview: "Food and cooking utilities help scale a recipe or convert measurements for preparation. Ingredient mass, volume and density are not always interchangeable, so use the measurement type expected by the tool.",
    example: "Scale a recipe with a known serving count and compare the ingredient quantities, units and practical rounding with the original before cooking.",
    validation: "Review ingredient substitutions, rounding and food-safety requirements separately. Mathematical scaling does not guarantee identical cooking time or culinary results.",
  },
  career: {
    overview: "Career tools help organise job-related information or prepare application materials. Accurate experience, qualifications and outcomes are more important than wording that merely sounds impressive.",
    example: "Use a draft for one target role, compare the output with the job requirements, then verify each skill, date, contact detail and achievement before submitting it.",
    validation: "Never invent qualifications, job history, references or performance claims. Review the final material for accuracy, relevance and the receiving organisation's requirements.",
  },
  ecommerce: {
    overview: "E-commerce utilities support product, stock, pricing, fulfilment or store operations. Make clear whether the inputs are estimates, manually entered values, or authoritative data from a live commerce system.",
    example: "Use a sample product with known quantity and price, then check the displayed totals, margin or fulfilment assumptions against a separate calculation.",
    validation: "Verify currency, tax treatment, shipping costs, inventory counts, identifiers and current store rules. Do not assume the tool updates a live catalogue unless the page explicitly says it does.",
  },
  accessibility: {
    overview: "Accessibility tools help inspect or improve a specific interface, document or interaction. A result applies to the component, source or scenario the tool actually checks.",
    example: "Test a concrete page or representative component, reproduce the flagged issue, and confirm the experience with keyboard interaction and assistive technology where relevant.",
    validation: "No single automated checker proves full accessibility. Review semantics, focus order, contrast, keyboard access, labels and real user flows alongside the tool's output.",
  },
  webdesign: {
    overview: "Web-design tools help create or validate web styling, layouts and interface details. The generated output must be tested in the browser, viewport and codebase where it will be used.",
    example: "Use a small representative component and review the output at narrow and wide viewport sizes before copying it into the live project.",
    validation: "Review responsive behavior, browser support, semantics, keyboard interaction, contrast and reduced-motion preferences where applicable. Generated code should be tested before deployment.",
  },
  marketing: {
    overview: "Marketing tools help plan or draft a message, campaign asset, or offer. Ground the work in verified product facts, a defined audience and the channel where it will appear.",
    example: "Prepare a draft for one specific audience and channel, then verify all claims, pricing, dates, links and offer terms before publishing it.",
    validation: "Check brand fit, accessibility, disclosures and current platform or advertising requirements. Do not publish unsupported performance or product claims.",
  },
  streaming: {
    overview: "Streaming utilities help plan or calculate settings for live video or audio delivery. The relevant platform, resolution, frame rate, audio setup and available upload capacity determine whether the result is suitable.",
    example: "Use the target platform's current recommended settings as a reference, compare the suggested configuration, and run a private test stream before a public event.",
    validation: "Bitrate and stability depend on the real network, encoder, hardware and platform. Recheck current service requirements and test under the intended streaming conditions.",
  },
  communication: {
    overview: "Communication tools help draft or organise messages, invitations, meeting details and related content. Identify the recipient, purpose, channel and desired action before using the output.",
    example: "Review a draft as the recipient would read it and confirm names, dates, time zones, attachments, URLs, and any action requested.",
    validation: "Generated wording should be proofread for factual accuracy, privacy and tone before being sent. Confirm delivery or response through the actual communication service.",
  },
  personal: {
    overview: "Personal utilities help with a defined everyday task or planning decision. Their output is most useful when the assumptions and personal inputs reflect the circumstances in which the result will be used.",
    example: "Run a sample using the values you know, inspect which assumptions the tool makes, and adjust only those options the current page provides.",
    validation: "Check important outputs against real constraints and context that the tool may not capture. A planning aid does not substitute for professional guidance where that is needed.",
  },
};

/**
 * Return a readable guide summary even when a catalogue record contains only
 * keywords or a short fragment. Keep well-formed editorial descriptions intact.
 */
export function toolDocumentationSummary(tool: ToolMeta): string {
  const description = (tool.description ?? "").replace(/\s+/g, " ").trim();
  const words = description.split(/\s+/).filter(Boolean);
  const isCompleteSentence =
    words.length >= 8
    && description.length >= 55
    && /^[A-Z0-9"'“‘(]/.test(description)
    && /[.!?]["')\]]?$/.test(description);

  if (isCompleteSentence) return description;

  const name = tool.name.trim();
  const engine = tool.engine.type;

  if (engine === "calculator") {
    return `Use ${name} to calculate results from the values you enter. Confirm the field labels, units, and assumptions, then check the output before relying on it.`;
  }
  if (engine === "converter" || engine === "file-converter") {
    return `Use ${name} to convert supported values or files. Confirm the source and target options, then verify the converted result before using it.`;
  }
  if (engine === "image" || tool.category === "photography") {
    return `Use ${name} to work with images using the options available on the page. Preview the result at its intended size and check image quality before saving it.`;
  }
  if (engine === "document" || engine === "document-backend" || engine === "pdf") {
    return `Use ${name} to work with supported document or PDF inputs. Check the content, page order, and output file before sharing or archiving it.`;
  }
  if (engine === "text" || engine === "codec" || engine === "developer") {
    return `Use ${name} to process text or structured data with the available options. Review the output for correctness, formatting, and information that must be preserved.`;
  }
  if (engine === "audio" || engine === "video") {
    return `Use ${name} to work with supported audio or video inputs. Confirm the selected source and output settings, then review the result before exporting it.`;
  }
  if (engine === "qr" || engine === "barcode") {
    return `Use ${name} to create or inspect a supported code. Verify the encoded value and test the result with a suitable reader before sharing it.`;
  }
  if (engine === "url-media" || engine === "url-media-info") {
    return `Use ${name} with a supported media URL. Confirm that you have permission to access the content and review the returned information or output before relying on it.`;
  }
  if (engine === "security") {
    return `Use ${name} for the specific security check shown in the tool. Test only systems or data you are authorized to assess, and treat the result as one input to your review.`;
  }
  if (engine === "ai") {
    return `Use ${name} to prepare or process content with the configured service. Supply a focused task and relevant constraints, then review the result for accuracy and suitability before using it.`;
  }

  return `Use ${name} with the inputs and options available on the page. Review the result against your requirements before copying, exporting, or sharing it.`;
}

function toolSpecificGuidance(tool: ToolMeta): ToolSpecificGuidance {
  const id = tool.id.toLowerCase();
  const name = tool.name.toLowerCase();
  const category = tool.category;

  if (id === "percentage-calculator") {
    return {
      overview: "Use this calculator when you need to express one value as a percentage of another, or when you are comparing a value with a starting amount. Read the direction of each field carefully: a percentage of a number, the percentage represented by a part, and a percentage increase or decrease are related calculations but answer different questions.",
      example: "For a simple check, use a small part and a known whole, calculate the share independently, and compare it with the displayed percentage. For increase or decrease work, identify the starting value before comparing the change; do not substitute the ending value as the base unless that is what the question asks.",
      validation: "Check the denominator or starting amount and the meaning of each percentage field. A zero denominator cannot produce a meaningful share, and percentage change depends on the original value.",
    };
  }
  if (id === "percentage-change-calculator" || /percentage change/.test(name)) {
    return {
      overview: "This guide is for comparing a starting value with a new value and expressing the difference relative to the starting value. The sign matters: a positive percentage indicates an increase under the usual new-minus-original convention, while a negative value indicates a decrease.",
      example: "Test with an easy pair whose relationship you already know, then reverse the two values. The direction should change when the original and new values are switched; this is a useful check that the correct base value was used.",
      validation: "Confirm which input is the original value and which is the new value. The percentage-change calculation is undefined when the original value is zero, and the sign should be interpreted alongside the direction of the change.",
    };
  }
  if (id === "json-formatter" || id === "json-validator" || id === "json-minifier" || /json (formatter|validator|minifier)/.test(name)) {
    return {
      overview: "This workflow is for working with JSON as structured data. Formatting changes whitespace and indentation to make the structure easier to read; validation checks whether the input follows JSON syntax; minification removes unnecessary whitespace. These operations do not guarantee that the data matches an application's business schema.",
      example: 'Begin with a small JSON object such as {"name":"Ada","active":true}. Compare the formatted and compact representations, then deliberately remove a quote or comma to see how the validator reports malformed syntax. Use a harmless sample rather than a production payload containing secrets.',
      validation: "JSON has stricter syntax than JavaScript: property names and strings use double quotes, and comments and trailing commas are not valid standard JSON. After syntax validation, check required fields and value types separately against the receiving application's schema.",
    };
  }
  if (id === "word-counter" || /word counter/.test(name)) {
    return {
      overview: "The Word Counter updates counts for words, characters, sentences, and paragraphs as text is entered. It is useful for checking writing length, content limits, and the overall size of a passage before submission or publication.",
      example: "Paste a short sample containing two sentences and a blank line, then add or remove a word and watch which totals change. This helps you understand how the current counter treats spaces and paragraph breaks before using it on a longer document.",
      validation: "Counting conventions can differ for hyphenated words, abbreviations, emojis, and languages that do not separate words with spaces. Use the destination platform's own count where a strict character or word limit determines acceptance.",
    };
  }
  if (id === "image-compressor" || /image compressor/.test(name)) {
    return {
      overview: "Use this tool to reduce the file size of a compatible image while balancing the resulting visual quality. Compression is useful for web pages, uploads, sharing, and storage when the image must remain recognisable at its intended display size.",
      example: "Keep the original, then process a copy of a compatible JPEG, PNG, or WebP image using the controls displayed by the tool. Compare the original and compressed previews at the same zoom level and compare the resulting file sizes before deciding which version is suitable.",
      validation: "Smaller files can show visible artifacts, soften details, alter transparency behavior, or change metadata depending on the format and selected settings. Do not assume that every format supports the same quality controls or that a target size can always be reached without unacceptable loss.",
    };
  }
  if (id === "image-resizer" || /image resizer/.test(name)) {
    return {
      overview: "This tool changes image dimensions for a target use such as a web asset, profile image, document, or print layout. The important choice is whether the image should fit within a bound, fill a frame, or be resized to exact dimensions.",
      example: "Use a copy of an image with a known width and height, request a smaller output, and check both dimensions after processing. If the interface offers fit or fill modes, compare whether the whole image remains visible or whether cropping is introduced.",
      validation: "Confirm output width, height, units, aspect ratio, and crop behavior. Upscaling cannot recover detail absent from the original, and physical print units depend on the intended resolution or DPI setting where one is provided.",
    };
  }
  if (id === "qr-generator" || /qr code generator/.test(name)) {
    return {
      overview: "The QR Code Generator encodes text or a URL into a QR image that a compatible camera or scanner can read. It is suited to sharing a web destination or short piece of information without requiring people to type it manually.",
      example: "Generate a code from a non-sensitive URL, download the PNG, and scan that downloaded image with a phone camera. Confirm that the decoded destination exactly matches the intended address before placing the code on a poster, label, presentation, or website.",
      validation: "A QR image can be visually correct while encoding the wrong payload. Test the downloaded file—not only the preview—and check contrast, margin, print size, and scan reliability before wider distribution. Do not encode confidential secrets in a publicly visible code.",
    };
  }
  if (id === "password-generator" || /password generator/.test(name)) {
    return {
      overview: "This tool generates a password using the length and character options exposed by its interface. The result should be unique to the account or service where it will be used, and the options should reflect the receiving service's password requirements.",
      example: "Choose a length and character set accepted by your target service, generate a candidate, and verify that it meets the service's documented rules. Store the accepted password in a trusted password manager rather than reusing it across accounts.",
      validation: "Check the requested length and included character types, and confirm that the generated value meets the destination's restrictions. Do not share generated passwords in screenshots, documents, support tickets, or chat messages.",
    };
  }
  if (id === "regex-tester" || /regex tester/.test(name)) {
    return {
      overview: "The Regex Tester evaluates a JavaScript regular expression against sample text and lists matches. It is intended for experimentation and debugging before a pattern is used in search, validation, extraction, or replacement logic.",
      example: "Start with a short sample whose expected matches you can identify by inspection, then try a boundary case and a non-matching string. Add flags only when the field supports them and compare the actual match list with the expected result.",
      validation: "Regular-expression syntax differs across programming languages and engines. A pattern that works in JavaScript may behave differently in another environment; verify escaping, flags, Unicode handling, and performance before using it on large or untrusted input.",
    };
  }
  if (id === "uuid-generator" || /uuid generator/.test(name)) {
    return {
      overview: "The UUID Generator creates version 4 UUID identifiers locally. UUIDs are useful as identifiers in test data, application records, and workflows that need a practically unique value, but generating one does not register it with another system.",
      example: "Generate a small number of values and check that each follows the UUID v4 structure and is distinct from the other values shown. Then confirm the database or API that will receive the identifier accepts that representation.",
      validation: "Do not confuse identifier uniqueness with authentication or secrecy. A UUID is not a substitute for a purpose-built credential, and the destination system may impose additional rules about storage, uniqueness, or ownership.",
    };
  }
  if (id === "unix-timestamp-converter" || /timestamp converter/.test(name) || /unix time/.test(name)) {
    return {
      overview: "This converter helps translate between Unix timestamps and human-readable dates. The critical details are the timestamp unit, the time zone used for display, and whether the value represents seconds, milliseconds, or another format accepted by the interface.",
      example: "Use a known date and convert it to the available timestamp representation, then convert that result back. If the page exposes a time-zone selector, check the same instant in two time zones and distinguish a changed clock display from a changed instant.",
      validation: "A seconds-versus-milliseconds mistake can shift a timestamp by orders of magnitude. Confirm the source unit and time zone before using a converted time for logs, deadlines, scheduled jobs, or incident analysis.",
    };
  }
  if (id === "invoice-generator" || /invoice generator/.test(name)) {
    return {
      overview: "This tool creates a printable invoice from the business details and line items provided in its form. It can help prepare a document for review or delivery, but the generated page should be checked against the real transaction and the requirements that apply to the business.",
      example: "Prepare a draft with fictional or non-sensitive sample details, add a small number of line items, and review the rendered totals and printable layout. When using real transaction data, replace the sample values carefully and verify the document before sending it.",
      validation: "Confirm legal business names, invoice identifiers, dates, quantities, currency, tax treatment, discounts, totals, payment terms, and contact information. Do not assume tax compliance, payment collection, or accounting-system registration unless the implementation explicitly provides it.",
    };
  }
  if (id === "bmi-calculator" || /bmi calculator/.test(name)) {
    return {
      overview: "The BMI Calculator estimates body mass index from height and weight and may display adult reference categories. BMI is a screening measure based on a simple ratio; it does not directly measure body fat or diagnose an individual's health.",
      example: "Enter a height and weight measured in the units requested by the form, then check that the displayed value changes sensibly if one measurement is adjusted. Confirm the units before comparing the number with published reference ranges.",
      validation: "BMI uses weight divided by height squared when expressed in kilograms and metres. Adult category references are not interpreted the same way for children and adolescents, and the result should be discussed with a qualified clinician when making health decisions.",
    };
  }
  if (id === "video-to-mp4" || id === "video-to-mp3" || /video to (mp4|mp3)/.test(name)) {
    return {
      overview: "This media conversion workflow uses a local video file as input and relies on the configured enV media processor when that service is available. The selected output determines whether the resulting file retains video or is converted to audio-only content.",
      example: "Start with a short, non-sensitive file in a format accepted by the active form. Run the conversion, then open the resulting file and verify its duration, playback, audio synchronization where applicable, and actual output extension before using it elsewhere.",
      validation: "The catalogue states that the enV FFmpeg media processor must be configured for this workflow. Support depends on the source codec, available service, file size, and output options; do not assume that every upload or codec is accepted.",
    };
  }
  if (id === "youtube-video-downloader" || /youtube video downloader/.test(name)) {
    return {
      overview: "This tool describes a URL-based media workflow for YouTube when a compliant enV media-processing service is available. Availability depends on the configured service and source restrictions, not just on whether a URL opens in a browser.",
      example: "Use only a public URL for content you are authorized to access and process. Submit it through the active form, follow the service response, and verify any returned media before saving or using it.",
      validation: "The catalogue explicitly conditions this tool on a compliant media-processing service. It may not work when the source blocks access or service support is unavailable. Respect copyright, platform terms, and rights-holder permissions.",
    };
  }
  if (id === "invoice-generator" || /receipt generator|quotation generator/.test(name)) {
    return {
      overview: "This business-document workflow creates a printable record or quote from the details entered in the form. Treat it as a draft until its figures and wording have been reviewed against the underlying sale or transaction.",
      example: "Use a small example with a clear quantity and unit price, then verify the displayed line amount and overall total before substituting verified business details.",
      validation: "Review identifiers, dates, currency, item descriptions, taxes, discounts, terms and totals. A generated document does not itself prove a payment occurred or a transaction was recorded in an accounting system.",
    };
  }
  if (/json to csv|csv to json|json to yaml|yaml to json|json to xml|xml to json/.test(name) || /json.*(csv|yaml|xml)|(csv|yaml|xml).*json/.test(id)) {
    return {
      overview: "This tool converts structured data between the formats named in its title and description. The receiving format has its own rules for field names, values, arrays, nesting, quoting, and escaping, so conversion may require reviewing how the original structure is represented.",
      example: "Start with a small sample containing more than one record and at least one value that needs quoting, such as text with a comma. Convert the sample, then inspect the output and convert it back where the workflow supports a reverse operation.",
      validation: "Check nested structures, null or missing values, escaping, delimiter choices, and data types. Some target formats cannot represent every source structure identically, so use the output schema expected by the consuming system.",
    };
  }
  if (/contrast/.test(name) || /contrast/.test(id)) {
    return {
      overview: "This tool supports evaluation of contrast or colour relationships for a specific design or accessibility task. The result should be interpreted against the actual foreground/background pair, display conditions, and criteria exposed by the interface.",
      example: "Test the intended text colour against the real background colour rather than against a different nearby shade. Compare the result with the criterion your product or project is required to meet and review large text and other element types separately if the interface distinguishes them.",
      validation: "A contrast result covers only the colour combination and measurement method tested. It does not by itself establish that an entire page meets accessibility requirements; review focus, semantics, labels, structure, and interactive states separately.",
    };
  }
  if (/meta tag|serp|sitemap|robots.txt|structured data|schema generator/.test(name) || /meta-tags|serp|sitemap|robots|schema/.test(id)) {
    return {
      overview: "This SEO utility prepares or previews a specific search-related page element, such as metadata, crawl guidance, a sitemap, or structured data. Treat generated output as an implementation aid and confirm that it accurately describes the deployed page.",
      example: "Use a draft page title, canonical URL, and accurate page description, then inspect the generated result before placing it on the site. After deployment, validate the live URL using the relevant search engine's current inspection or testing tools.",
      validation: "Check canonical URLs, escaping, robots directives, schema types, required fields, and the relationship between markup and visible page content. Valid markup does not guarantee crawling, indexing, a rich result, or a particular search ranking.",
    };
  }

  const engine = tool.engine;
  if (engine.type === "calculator") {
    return {
      overview: "Use the fields to model the calculation you need. Check input units, assumptions, zero values, and expected precision before relying on the result.",
      example: "Choose a small test case for which you can estimate or independently calculate the expected result. Run it once, compare the output with that reference, and only then use more complex values.",
      validation: "Check sign, units, decimal precision, zero values, and boundary cases. Use any formula or assumption note published with this tool, and do not infer precision or financial terms that the interface does not display.",
    };
  }
  if (engine.type === "converter") {
    return {
      overview: "Use this converter when you need to move a value between supported units or formats. The choices shown on the page define the actual conversion pairs; do not assume an unlisted unit or format is supported.",
      example: "Convert a familiar value between two listed units and confirm that the displayed unit label accompanies the result. Repeat in the reverse direction when possible to check that the conversion is consistent.",
      validation: "Verify source and target unit selection, scale, sign, rounding, and precision. Keep the unit next to the number when copying the result because the number alone may be ambiguous.",
    };
  }
  if (engine.type === "image" || tool.category === "image" || tool.category === "photography") {
    return {
      overview: "Choose image settings based on how the result will be displayed or printed. Compare a representative output against the original at the intended size.",
      example: "Use a duplicate of a small, representative image, process it with the available settings, then inspect the full-size output and compare its properties with the original.",
      validation: "Confirm dimensions, crop, format, transparency, colour appearance, and metadata behavior as relevant to the selected operation. Keep the original until the output has been inspected.",
    };
  }
  if (engine.type === "text" || engine.type === "codec" || engine.type === "developer") {
    return {
      overview: "Start with a small, representative input, apply the operation provided by the tool, and validate the output in the format or system that will consume it.",
      example: "Create a small sample containing a normal value and a boundary case, then run the operation on both. This makes it easier to distinguish a genuine formatting or conversion issue from malformed source input.",
      validation: "Pay particular attention to quoting, escaping, whitespace, character encoding, line endings, case sensitivity, and special characters. Preserve the original input until the output has passed downstream validation.",
    };
  }
  if (engine.type === "file-converter" || engine.type === "document" || engine.type === "document-backend" || engine.type === "pdf" || engine.type === "audio" || engine.type === "video") {
    return {
      overview: "Select the source type, target format, and processing options exposed by the page. Do not assume a format or control is supported unless it is listed.",
      example: "Use a duplicate of a small file that meets the form's listed requirements. Process it once with the intended settings, then open the result in a viewer or player that supports the target format.",
      validation: "Check file type and extension, output size, playback or document rendering, completeness, and any relevant page order, dimensions, channels, or timing. An output file being present does not prove that its contents are correct.",
    };
  }
  if (engine.type === "qr" || engine.type === "barcode") {
    return {
      overview: "Enter the exact payload and code type required for your use case, then verify that the generated code decodes to the intended value.",
      example: "Generate a code from a non-sensitive sample value and test it with the actual phone camera, scanner, or application that will be used in practice.",
      validation: "Verify the decoded payload exactly. Check code format, print size, quiet space, contrast, and the limits of the intended scanner before distributing the code.",
    };
  }
  if (engine.type === "url-media" || engine.type === "url-media-info") {
    return {
      overview: "Processing depends on source reachability, provider rules, and the availability of any configured service. Test a supported URL before using a more consequential input.",
      example: "Use a test URL for content you are authorized to inspect, submit it through the form, and confirm that the returned output corresponds to the requested source.",
      validation: "A valid-looking URL does not guarantee that remote processing is allowed or available. Review service errors and follow content rights and platform terms.",
    };
  }
  if (engine.type === "security") {
    return {
      overview: "Treat the specific security check shown here as one part of a review, not as a guarantee that an entire system is secure.",
      example: "Use a test value or non-production sample first, then compare the result with the security requirement you intend to satisfy.",
      validation: "Do not infer comprehensive protection from one passing check. Avoid exposing live credentials or secrets, and verify suitability for the destination system.",
    };
  }
  if (engine.type === "ai") {
    return {
      overview: "The quality of generated output depends on the context and constraints supplied and on the configured service. Treat the result as a draft that needs review.",
      example: "Try one focused prompt with a clear task, intended audience, and constraints. Review the result, identify missing or unsupported points, and refine the request only where the tool supports it.",
      validation: "Review every factual claim and instruction before reuse. Avoid including sensitive source material unless the tool's processing notice permits it, and do not treat generated content as independently verified.",
    };
  }
  const categoryGuidance = CATEGORY_TASK_GUIDANCE[tool.category];
  if (categoryGuidance) {
    return {
      overview: categoryGuidance.overview,
      example: categoryGuidance.example,
      validation: categoryGuidance.validation,
    };
  }
  return {
    overview: "This guide is tailored to the catalogued purpose, category, and execution metadata for " + tool.name + ". Use the current page's labels and controls as the authority for exact input requirements and behavior.",
    example: "Run a small, non-sensitive example that represents the task you intend to complete. Confirm the output matches the expected purpose before moving on to a larger or more consequential input.",
    validation: "Check required fields, supported input types, output completeness, and any assumptions implied by the task. The guide does not claim support for an option unless it is documented by the catalogue or visible in the current interface.",
  };
}

function engineLabel(tool: ToolMeta): string {
  switch (tool.engine.type) {
    case "calculator": return "Calculator";
    case "converter": return "Unit or value converter";
    case "file-converter": return "File converter";
    case "mime": return "File-type utility";
    case "security": return "Security utility";
    case "creator": return "Creator utility";
    case "business": return "Business utility";
    case "audio": return "Audio utility";
    case "network": return "Network utility";
    case "text": return "Text utility";
    case "generator": return "Generator";
    case "codec": return "Encoder or decoder";
    case "color": return "Color utility";
    case "qr": return "QR code utility";
    case "barcode": return "Barcode utility";
    case "image": return "Image utility";
    case "cssgen": return "CSS generator";
    case "mockup": return "Mockup generator";
    case "post": return "Post mockup";
    case "device": return "Device mockup";
    case "datetime": return "Date and time utility";
    case "seo": return "SEO utility";
    case "document": return "Document utility";
    case "document-backend": return "Document processing utility";
    case "pdf": return "PDF utility";
    case "ai": return "AI-assisted utility";
    case "video": return "Video utility";
    case "url-media": return "URL media processing utility";
    case "url-media-info": return "URL media information utility";
    case "developer": return "Developer utility";
    case "custom": return "Custom utility";
  }
}

function engineOverview(tool: ToolMeta): string {
  switch (tool.engine.type) {
    case "calculator":
      return "This tool performs a numerical calculation. Its intended calculation is defined by the tool description, the fields shown in the interface, and any calculation note included below. The form's units and labels determine how values must be interpreted.";
    case "converter":
      return "This tool converts values using the registered " + tool.engine.system + " conversion system. The available conversion modes and supported units are the ones exposed by the interface; the system name alone does not imply support for every possible unit.";
    case "file-converter":
      return "This tool belongs to enV's file-conversion workflow. The actual accepted source types, output choices, and conversion controls are determined by the active form and its configured processing path.";
    case "mime":
      return "This tool works with file-type or MIME-related information. Treat file extensions and declared content types as clues rather than proof of a file's safety or true contents.";
    case "security":
      return "This security-focused tool performs the inspection or transformation described in its interface. Its result applies to that operation and should not be interpreted as a complete security assessment.";
    case "creator":
      return "This creator-focused workflow supports the specific calculation, preparation, or generation described above. Where the result is an estimate, it depends on the values and assumptions supplied to the form.";
    case "business":
      return "This business workflow creates or evaluates the specific business information described above. Confirm the source values and review any generated document or estimate before using it outside the tool.";
    case "audio":
      return "This audio workflow processes or analyzes audio according to the controls offered by the tool. Source compatibility, available processing options, and whether a connected service is needed depend on this specific operation.";
    case "network":
      return "This network utility performs the network-related lookup or calculation described by the tool. Results can depend on the available information, network access, and the environment from which the request is made.";
    case "text":
      return "This tool transforms, inspects, or generates text according to the operation described above. The treatment of whitespace, line breaks, punctuation, casing, and special characters depends on the specific operation.";
    case "generator":
      return "This generator creates output from the information and options available in its form. Generated output should be reviewed before it is published, submitted, or used as authoritative data.";
    case "codec":
      return "This tool encodes, decodes, or transforms data using the operation described in its interface. Encoding changes representation; it does not by itself encrypt data or make sensitive content secure.";
    case "color":
      return "This tool works with color values or visual color settings. Interpret values using the selected color model and inspect the rendered result when appearance matters.";
    case "qr":
      return "This tool creates or handles QR-code content. The encoded payload and any visual or export settings must be checked before the code is shared or printed.";
    case "barcode":
      return "This tool creates or handles barcode content. Supported standards, payload constraints, and export formats are determined by the active form and must match the intended scanner or downstream system.";
    case "image":
      return "This tool processes or analyzes images according to its available controls. The resulting dimensions, quality, transparency, metadata, and format depend on the operation and settings selected.";
    case "cssgen":
      return "This tool generates CSS or related styling output from the options it exposes. Review the generated declarations and test them in the target layout and browser environment before shipping them.";
    case "mockup":
    case "post":
    case "device":
      return "This tool produces a visual or interface mockup for demonstration or prototyping. Review all displayed content and retain the fictional or demonstration context when sharing the result.";
    case "datetime":
      return "This tool calculates or formats dates, times, time zones, timestamps, or durations according to the fields and units shown.";
    case "seo":
      return "This tool prepares or inspects SEO-related values or previews. Its output can help with implementation and validation, but it cannot guarantee how a search engine will crawl, index, display, or rank a page.";
    case "document":
    case "document-backend":
      return "This document workflow creates, reads, converts, or modifies document content as described by the tool. Supported formats and processing requirements are defined by the form and any service notice shown before processing.";
    case "pdf":
      return "This tool works with PDF or document pages according to its controls. Check page order, page count, rotation, and legibility in the output instead of relying only on a success message.";
    case "ai":
      return "This AI-assisted utility follows the operation described by the tool. The exact behavior depends on the exposed inputs and, where applicable, the configured model or service; generated content must be reviewed.";
    case "video":
      return "This tool processes or analyzes video according to the operation described above. Source compatibility, output details, processing time, and connected-service requirements depend on the available workflow.";
    case "url-media":
      return "This workflow accepts a media URL from a supported source when the configured processing path permits it. A valid URL does not guarantee that the source is accessible, that processing is available, or that reuse is authorized.";
    case "url-media-info":
      return "This workflow retrieves or interprets information about a media URL when the configured service and source allow it. Returned information can be incomplete or unavailable when the source restricts access.";
    case "developer":
      return "This developer utility inspects, validates, formats, compares, or transforms technical input according to the operation shown. Confirm that the result is compatible with the language, protocol, or system where it will be used.";
    case "custom":
      return "This tool uses a dedicated workflow. The actual controls and behavior shown by its page are the authoritative reference for the current implementation.";
  }
}

function inputAdvice(tool: ToolMeta): string {
  switch (tool.engine.type) {
    case "calculator":
      return "Enter only the values requested by the calculator and follow every displayed unit label. Check whether the form expects a percentage, decimal fraction, rate, duration, or dimension before interpreting the result.";
    case "converter":
      return "Provide a source value and select the source and target units or mode exposed by the tool. Use the displayed unit choices rather than typing an unlisted unit into a field that expects a value.";
    case "file-converter":
    case "document":
    case "document-backend":
    case "pdf":
    case "image":
    case "audio":
    case "video":
      return "Use a source file or input type explicitly accepted by the form. Review the listed file types and options before processing, and keep an untouched source copy if the original must be preserved.";
    case "text":
    case "codec":
    case "developer":
      return "Enter or paste the value in the format requested by the tool. For structured data, confirm the expected syntax and preserve a separate copy of any original input that you may need to restore.";
    case "qr":
    case "barcode":
      return "Enter the exact payload or identifier required by the tool. Check the selected code type and any constraints explained by the form before generating the image.";
    case "url-media":
    case "url-media-info":
      return "Use a URL from a supported source and check that it is complete and accessible. A URL that opens in a browser may still be restricted to automated or third-party processing.";
    case "ai":
      return "Provide the context and constraints requested by the form. Do not include private information unless the tool's processing disclosure and your data-handling policy permit it.";
    default:
      return "Use the labels, help text, placeholders, and validation messages in the tool itself to identify required values and optional settings. Do not assume a field, format, or option exists unless the interface provides it.";
  }
}

function usageSteps(tool: ToolMeta): string[] {
  switch (tool.engine.type) {
    case "calculator":
      return [
        "Open the tool and read the field labels, units, and any assumptions shown beside the calculation.",
        "Enter the requested values and select any calculation options that the form actually provides.",
        "Review the result and any intermediate figures. Correct the inputs if a unit, sign, decimal, or percentage convention was misunderstood.",
        "Copy or record the result only after confirming that it answers the intended question.",
      ];
    case "converter":
      return [
        "Open the converter and identify the source value and source unit.",
        "Select the target unit or conversion mode from the options displayed by the tool.",
        "Enter the value and inspect the converted result, paying attention to units and rounding.",
        "Test a known value or an independent reference when the conversion will be used in a consequential workflow.",
      ];
    case "file-converter":
    case "document":
    case "document-backend":
    case "pdf":
    case "image":
    case "audio":
    case "video":
      return [
        "Open the tool and read its supported input types and processing notice.",
        "Choose or provide the source item using the control offered by the page.",
        "Set only the available output or processing options required for your task, then start the operation.",
        "Wait for the tool to report completion or an actionable error, then inspect the output before saving or sharing it.",
        "Keep the original source until you have verified that the output is complete and usable.",
      ];
    case "text":
    case "codec":
    case "developer":
      return [
        "Open the tool and read the accepted input format or syntax.",
        "Paste or enter the value you want to process, then choose the available operation or settings.",
        "Run the operation and review the complete output, including errors, whitespace, special characters, and formatting.",
        "Validate the result in the downstream application or protocol that will consume it.",
      ];
    case "qr":
    case "barcode":
      return [
        "Open the generator and choose the payload or code type that matches your use case.",
        "Enter the exact value that should be encoded and configure only the options provided.",
        "Generate the code, then scan it with a real device or the intended scanner.",
        "Confirm that the decoded value is correct before you print, distribute, or embed the code.",
      ];
    case "url-media":
    case "url-media-info":
      return [
        "Open the tool and review the supported sources and service notice.",
        "Enter a complete URL from an allowed source and select any available action or output options.",
        "Start the request and follow the status or error message returned by the page.",
        "Check the resulting file or information and confirm your rights to use the source content.",
      ];
    case "ai":
      return [
        "Read the tool's purpose and any disclosure about connected AI services before entering content.",
        "Provide the requested prompt, source text, or constraints in the fields shown.",
        "Run the operation and review the generated result for factual accuracy, relevance, tone, and missing context.",
        "Edit or verify the result before using it in a public, professional, academic, or consequential setting.",
      ];
    default:
      return [
        "Open the tool and confirm that its displayed purpose matches the task you want to complete.",
        "Read the field labels, examples, and notices to identify the required information.",
        "Enter the inputs and choose among the options actually available in the interface.",
        "Run the tool, inspect the complete result, and correct any validation errors reported by the page.",
        "Copy, download, or reuse the result only through the controls provided and after checking it.",
      ];
  }
}

function outputAdvice(tool: ToolMeta): string {
  switch (tool.engine.type) {
    case "calculator":
      return "The result is the calculation exposed by this tool for the supplied inputs and settings. If the form displays rounded values, intermediate values, or a formula note, use those details to understand the output; do not infer greater precision than is shown.";
    case "converter":
      return "The output is a converted representation of the supplied value. Preserve the displayed target unit and any precision information when copying the result into another system.";
    case "image":
    case "pdf":
    case "file-converter":
    case "document":
    case "document-backend":
    case "audio":
    case "video":
      return "The result may be a processed file, preview, extracted information, or a status message, depending on the tool. Check the content and the file's actual properties before treating it as complete.";
    case "qr":
    case "barcode":
      return "The result is a visual code for the selected payload and format. The code must be readable by the intended scanner and must decode to the expected value.";
    case "codec":
    case "developer":
      return "The result is technical output in the representation produced by the selected operation. Syntax validity, application compatibility, and security properties are separate checks.";
    case "ai":
      return "The result is generated content, not verified evidence. Check names, numbers, claims, links, references, and any instructions that could have been misunderstood before reuse.";
    case "url-media":
    case "url-media-info":
      return "The output depends on whether the source and configured media service allow the requested operation. Verify that the returned content or metadata matches the intended URL and is complete.";
    default:
      return "The available result, preview, or download is defined by the selected tool and its current interface. Review the content, units, formatting, and relevant details before relying on it.";
  }
}

function processingAdvice(tool: ToolMeta): string {
  if (tool.clientSide && tool.requiresBackend) {
    return "The catalogue marks this tool as both client-side capable and backend-dependent. Its workflow may combine browser-side interaction or processing with a connected service. Read the tool's own notice for the exact data path of the operation you are about to run; do not assume every step stays on the device.";
  }
  if (tool.requiresBackend) {
    return "The catalogue marks this tool as requiring a backend. The backend-dependent part needs network access and a configured service to be available. Before submitting sensitive input, review the notice shown by the tool and the enV Privacy page for the applicable processing path.";
  }
  if (tool.clientSide) {
    return "The catalogue marks this tool as client-side. Its intended primary operation runs in the browser, but browser permissions, device resources, and supported APIs can affect what is possible. Follow any operation-specific notice in the interface; do not treat this general label as a substitute for the page's current disclosure.";
  }
  return "The catalogue does not classify this tool as strictly client-side or explicitly backend-required. Review the processing notice displayed by the active tool before providing private or confidential information. If the page reports that a connected service is unavailable, follow that message rather than assuming an offline fallback exists.";
}

function disclaimerAdvice(tool: ToolMeta): string[] {
  const notes: string[] = [];
  switch (tool.disclaimer) {
    case "health":
      notes.push("This tool provides informational estimates and is not a diagnosis or a substitute for advice from a qualified healthcare professional.");
      break;
    case "finance":
      notes.push("Financial outputs depend on supplied assumptions and are not a guarantee, personalized financial recommendation, or promise of future results.");
      break;
    case "earnings":
      notes.push("Earnings values are estimates, not guaranteed revenue. Actual outcomes depend on eligibility, audience, location, platform rules, rates, fees, and other factors that may change.");
      break;
    case "mockup":
      notes.push("Keep the output clearly labeled as a mockup or fictional demonstration. Do not use simulated content to impersonate a real person, service, transaction, or record.");
      break;
    case "estimate":
      notes.push("Treat the result as an estimate based on the supplied inputs and documented assumptions, not as a measured or guaranteed outcome.");
      break;
  }
  const categoryNote = CATEGORY_ADVICE[tool.category]?.responsibleUse;
  if (categoryNote && !notes.includes(categoryNote)) notes.push(categoryNote);
  if (tool.category === "security" && !notes.some((note) => note.includes("authorized"))) {
    notes.push("Use the tool only for data and systems you own or are authorized to assess.");
  }
  if (tool.category === "testdata" && !notes.some((note) => note.includes("fictional"))) {
    notes.push("Treat generated example data as fictional and keep it separate from real customer or production records.");
  }
  if (notes.length === 0) {
    notes.push("Use the result within the scope described by this tool. Confirm material facts and follow relevant platform, organizational, legal, and safety requirements before using the output in a consequential setting.");
  }
  return notes;
}

export function toolExecutionLabel(tool: ToolMeta): string {
  if (tool.clientSide && tool.requiresBackend) return "Browser + connected service";
  if (tool.requiresBackend) return "Connected service required";
  if (tool.clientSide) return "Browser-based";
  return "Execution details in tool";
}

export function toolStatusLabel(tool: ToolMeta): string {
  if (tool.status === "planned") return "Planned";
  if (tool.status === "beta") return "Beta";
  return "Active";
}

export function toolCategoryLabel(tool: ToolMeta): string {
  return CATEGORIES.find((category) => category.id === tool.category)?.name ?? tool.category;
}

export function toolDocumentationPath(tool: ToolMeta): string {
  return "/blog/tool-" + tool.id;
}

export function getToolDocumentation(tool: ToolMeta): ToolDocumentationSection[] {
  const category = CATEGORIES.find((item) => item.id === tool.category);
  const advice = CATEGORY_ADVICE[tool.category];
  const specific = toolSpecificGuidance(tool);
  const statusDescription = tool.status === "planned"
    ? "The catalogue currently marks this tool as planned. This guide documents the catalogued purpose and intended workflow, but it does not claim that the tool is already available or that its final controls and behavior have shipped."
    : tool.status === "beta"
      ? "The catalogue currently marks this tool as beta. Controls, availability, or behavior may change while the tool is being refined; review the current interface and check results carefully."
      : "The catalogue currently marks this tool as active. Its availability can still depend on deployment configuration, browser capabilities, account requirements, and any backend service described on this page.";
  const authDescription = tool.requiresAuth
    ? "The catalogue marks this tool as requiring an authenticated account. Sign in through enV's account flow before using account-gated functionality."
    : "The catalogue does not declare an account requirement for this tool. This does not remove requirements that may apply to separate account, wallet, or service features.";
  const inputLimit = tool.status === "planned"
    ? "Because this tool is planned, final input fields, validation rules, accepted formats, and hard limits must be confirmed against the shipped interface when it becomes available."
    : "The visible form is the authority for required fields, supported formats, selectable options, validation, and any size or length limits. A format or option not listed there should not be assumed to work.";
  const sections: ToolDocumentationSection[] = [
    {
      id: "purpose-and-scope",
      heading: "Purpose and scope",
      paragraphs: [
        "This section explains the tool's intended scope and execution context. Use the current tool page to confirm the exact inputs, options, limits, and service behavior.",
        (category?.description ? category.description + (category.blurb ? " " + category.blurb : "") : "This tool is part of enV's " + tool.category + " collection."),
        "This entry uses enV's " + engineLabel(tool).toLowerCase() + " workflow. " + engineOverview(tool),
      ],
    },
    {
      id: "when-to-use",
      heading: "When to use this tool",
      paragraphs: [
        specific.overview,
        specific.example,
      ],
    },
    {
      id: "before-you-begin",
      heading: "Before you begin",
      paragraphs: [
        inputAdvice(tool),
        advice?.prepare ?? "Decide what a correct result should look like before starting. Check the input requirements and any assumptions shown by the tool, and keep the original information where you may need to compare or restore it.",
      ],
    },
    {
      id: "how-to-use",
      heading: "How to use the tool",
      paragraphs: [
        tool.status === "planned"
          ? "The steps below describe how to approach this tool once its working interface is available. If the current page shows a planned or unavailable state, do not treat the catalog description as proof that the operation is live."
          : "Follow the steps in order and use the current interface as the source of truth for the controls and options available in this release.",
      ],
      steps: usageSteps(tool),
    },
    {
      id: "inputs-and-options",
      heading: "Inputs, options, and validation",
      paragraphs: [
        inputLimit,
        "Use the exact units, syntax, source type, and options requested by the form. Required fields should be completed before running the operation. If the page returns a validation message, correct the named field or format instead of trying unrelated inputs.",
        specific.validation,
        tool.keywords.length > 0
          ? "The catalogue associates this tool with these search topics: " + tool.keywords.slice(0, 12).join(", ") + ". These terms improve discovery; they are not a list of accepted input fields or supported formats."
          : "No separate keyword list is published for this tool. Use its name, description, field labels, and in-tool examples to identify the intended input.",
      ],
    },
  ];

  if (tool.formulaNote) {
    sections.push({
      id: "calculation-notes",
      heading: "Calculation or operation notes",
      paragraphs: [
        tool.formulaNote,
        "Read this note together with the field labels and displayed units. If the form does not specify an assumption, unit, rounding rule, or supported case, do not invent one when interpreting the result.",
      ],
    });
  }

  sections.push(
    {
      id: "results-and-output",
      heading: "Results and output validation",
      paragraphs: [
        outputAdvice(tool),
        advice?.verify ?? "Inspect the result against the original task. Confirm important details, units, formatting, and content; use an independent reference or downstream validation when the result will be relied on by another person or system.",
      ],
    },
    {
      id: "processing-and-privacy",
      heading: "Processing, privacy, and connectivity",
      paragraphs: [
        processingAdvice(tool),
        "Processing labels describe catalog intent, not permission to ignore the current disclosure. Avoid submitting passwords, private keys, payment data, confidential business material, or personal information unless you have verified that the processing path is appropriate for that information.",
      ],
    },
    {
      id: "availability-and-account",
      heading: "Availability and account requirements",
      paragraphs: [
        "Tool status: " + toolStatusLabel(tool) + ". " + statusDescription,
        authDescription,
        tool.requiresBackend
          ? "Backend-dependent operations may fail when the service is not configured, unavailable, rate-limited, or unable to handle the submitted input. Follow the page's error message and retry only when it is safe to do so."
          : "The catalogue does not mark this tool as requiring a backend. Browser permissions, device memory, file access, or unsupported browser APIs can still affect the result.",
      ],
    },
    {
      id: "limitations-and-responsible-use",
      heading: "Limitations and responsible use",
      paragraphs: disclaimerAdvice(tool),
    },
    {
      id: "troubleshooting",
      heading: "Troubleshooting",
      paragraphs: [
        "Start with the specific error or status displayed by the page. If a problem persists, capture the tool name, the action you attempted, the platform and browser, the approximate time, and the non-sensitive error text so the issue can be reproduced without exposing private input.",
      ],
      bullets: [
        "Input rejected or result is empty: check required fields, source format, separators, units, and any listed constraints. Try a small, non-sensitive example to determine whether the issue is with the input.",
        "Processing does not start or stops: check the connection if the workflow requires a backend, review browser permissions, and retry with a smaller or known-good input when safe.",
        "Output looks different than expected: compare the original and result, review selected options, rounding, quality, page order, or encoding settings that apply to this operation.",
        "Download, copy, or preview fails: confirm the operation completed, allow the requested browser permission if appropriate, and check whether the browser or device blocks the selected output type.",
        "You still cannot proceed: use the enV Help Center or contact support. Share the tool name and non-sensitive diagnostic details, not passwords, private keys, or confidential source files.",
      ],
    },
  );

  return sections;
}
