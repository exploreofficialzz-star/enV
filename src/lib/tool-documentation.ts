import { CATEGORIES } from "@/data/categories";
import type { CategoryId, ToolMeta } from "@/types/tool";

export type ToolDocumentationSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
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
};

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
        tool.description,
        (category?.description ? category.description + (category.blurb ? " " + category.blurb : "") : "This tool is part of enV's " + tool.category + " collection."),
        "This entry uses enV's " + engineLabel(tool).toLowerCase() + " workflow. " + engineOverview(tool),
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
      bullets: usageSteps(tool),
    },
    {
      id: "inputs-and-options",
      heading: "Inputs, options, and validation",
      paragraphs: [
        inputLimit,
        "Use the exact units, syntax, source type, and options requested by the form. Required fields should be completed before running the operation. If the page returns a validation message, correct the named field or format instead of trying unrelated inputs.",
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
