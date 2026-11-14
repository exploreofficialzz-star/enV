/**
 * Refine legacy programme-generated catalogue descriptions.
 * Human-reviewed descriptions pass through unchanged.
 */

/** @typedef {{id?: string, name: string, category: string, description?: string}} CatalogueCopyInput */

const SUFFIXES = [
  "Audio File Size Calculator", "Thumbnail Size Helper", "Content Calendar",
  "Posting Time Helper", "Revenue Calculator", "Engagement Calculator",
  "Growth Calculator", "Content Planner", "Caption Generator", "Title Generator",
  "Description Generator", "Hashtag Generator", "Bio Generator",
  "Profile Image Resizer", "Post Image Resizer", "Story Image Resizer",
  "Image Resizer", "Image Compressor", "Banner Resizer", "Thumbnail Resizer",
  "Cover Image Resizer", "Square Image Maker", "Portrait Image Maker",
  "Landscape Image Maker", "Quick Converter", "Page Extractor",
  "Page Reorder Tool", "Page Numbering Tool", "Watermark Tool", "Metadata Tool",
  "Text Extractor", "Image Extractor", "Screenshot Tool", "Comparison Tool",
  "Print Layout Helper", "Bracket Generator", "Page Generator",
  "Invitation Generator", "Experience Builder", "Page Builder", "Shareable Page",
  "Interactive Page", "Message Builder", "Reveal Page", "Countdown Page",
  "Quiz Generator", "RSVP Page", "Schedule Builder", "Agenda Generator",
  "Event QR Generator", "Ticket Mockup", "Check-In Page", "Brief Generator",
  "Headline Helper", "CTA Generator", "Snippet Generator", "Token Generator",
  "CSS Generator", "SVG Generator", "Preset Maker", "Post Size Guide",
  "Story Size Guide", "Profile Size Guide", "Banner Size Guide",
  "Caption Helper", "Hashtag Helper", "Bio Helper", "Username Generator",
  "Post Mockup", "Profile Mockup", "List Generator", "Format Guide",
  "Export Preset", "Resolution Helper", "Stream Schedule", "Overlay Planner",
  "Stream Checklist", "Aspect Ratio Helper", "Frame Calculator", "FPS Calculator",
  "Subtitle Helper", "Size Calculator", "Depth of Field", "Passport Photo",
  "Social Photo", "ID Photo", "Aspect Ratio", "Print Size", "Field of View",
  "Calculator", "Estimator", "Generator", "Planner", "Template", "Builder",
  "Checker", "Guide", "Helper", "Formatter", "Validator", "Beautifier",
  "Minifier", "Parser", "Converter", "Table", "Comparison", "Reference",
  "Diff", "Inspector", "Preview", "Tester", "Decoder", "Encoder", "Explainer",
  "Merger", "Splitter", "Compressor", "Mockup", "Randomizer", "Tracker",
  "Picker", "Wheel", "Scaler", "Checklist", "Crop", "Exposure", "Lens",
  "Sensor", "Photo", "FOV", "Schedule", "Calendar"
].sort((a, b) => b.length - a.length);

function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function splitName(name) {
  for (const suffix of SUFFIXES) {
    if (name.toLowerCase().endsWith(" " + suffix.toLowerCase())) {
      return { prefix: name.slice(0, -suffix.length).trim(), operation: suffix };
    }
  }
  return { prefix: "", operation: name };
}

function describe(category, prefix, operation) {
  const subject = lower(prefix || "this task");
  const label = prefix || "this task";
  const action = lower(operation);
  const is = (value) => action === value;
  const has = (value) => action.includes(value);

  if (category === "converters") {
    if (is("converter") || is("quick converter")) return "Convert " + subject + " values between the units supported by this tool. Check source and destination units before using the result.";
    if (is("table") || is("reference")) return "Look up common " + subject + " units and conversion values in a reference you can use while working.";
    if (is("comparison")) return "Compare " + subject + " measurements across the available units and review the values side by side.";
  }
  if (category === "developer") {
    if (is("formatter") || is("beautifier")) return "Format " + label + " content into a more readable structure. Review the output before using it in your project.";
    if (is("validator") || is("tester")) return "Check " + label + " input against the validation or test rules provided by this tool. Review any reported issues before relying on it.";
    if (is("minifier")) return "Reduce unnecessary whitespace in " + label + " content where supported, then check the result in the application that will use it.";
    if (is("parser")) return "Parse " + label + " input and inspect the structure returned by the tool.";
    if (is("converter")) return "Convert " + label + " data using the input and output representations supported by this tool.";
    if (is("generator")) return "Generate " + label + " data or a code snippet from the options provided. Review the output before adding it to a project.";
    if (is("diff")) return "Compare two " + label + " inputs and review the differences reported by the tool.";
    if (is("inspector") || is("preview")) return "Inspect " + label + " content and review the details or preview provided by the tool.";
    if (is("decoder")) return "Decode " + label + " input into the representation supported by this tool. Check the result before using it.";
    if (is("encoder")) return "Encode input as " + label + " data using the format and options available in this tool.";
    if (is("explainer")) return "Understand the structure or meaning of " + label + " content with the explanation provided by this tool.";
  }
  if (category === "image") {
    if (has("resizer")) return "Resize images for use on " + label + ". Check dimensions and crop before exporting or publishing.";
    if (has("compressor")) return "Reduce image file size for use on " + label + ". Review output dimensions and quality before publishing.";
    if (has("thumbnail")) return "Prepare a thumbnail image for " + label + ". Check crop, dimensions and readability at display size.";
    if (has("profile image")) return "Prepare a profile image for " + label + ". Review its crop and dimensions before uploading it.";
    if (has("banner")) return "Prepare a banner image for " + label + ". Check the visible area and final dimensions before publishing.";
    if (has("story")) return "Prepare a portrait image for a story on " + label + ". Review crop and safe areas before publishing.";
    if (has("post image")) return "Prepare an image for a post on " + label + ". Check layout and crop before sharing it.";
    if (has("cover")) return "Prepare a cover image for " + label + ". Review dimensions and visible content before publishing.";
    return "Prepare an image for " + label + " using the operation available in this tool. Check the result before publishing.";
  }
  if (category === "design") {
    if (is("generator") || is("preset maker")) return "Create a " + subject + " style or value using the options provided, then review it before applying it to an interface.";
    if (is("builder")) return "Build a " + subject + " style by adjusting the controls available in this tool.";
    if (is("preview")) return "Preview a " + subject + " style and inspect how it appears before using it in an interface.";
    if (is("css generator")) return "Generate CSS for a " + subject + " style. Review the code in your target browser before shipping it.";
    if (is("svg generator")) return "Create an SVG representation of a " + subject + " graphic or effect using the available settings.";
    if (is("token generator")) return "Create reusable design-token values for a " + subject + " style and review them before adding them to your design system.";
  }
  if (category === "webdesign") {
    if (is("generator") || is("snippet generator")) return "Generate a " + subject + " starting point for a web interface. Review the output and adapt it to your layout and accessibility requirements.";
    if (is("builder")) return "Build a " + subject + " interface element with the options available in this tool, then review its layout and behavior.";
    if (is("preview")) return "Preview a " + subject + " interface element and inspect its appearance before using it on a website.";
    if (is("checklist")) return "Review a " + subject + " implementation against the practical checks provided by this tool.";
  }
  if (category === "pdf") {
    if (has("merger")) return "Combine selected " + subject + " files into one document. Check file order and the merged pages before saving.";
    if (has("splitter")) return "Separate a " + subject + " file into smaller files or page ranges using the options available in this tool.";
    if (has("compressor")) return "Reduce the size of a supported " + subject + " file and inspect the result before sharing it.";
    if (has("page extractor")) return "Extract selected pages from a supported " + subject + " file into a separate output.";
    if (has("page reorder")) return "Change page order in a supported " + subject + " file, then review the document before saving.";
    if (has("page numbering")) return "Add page numbers to a supported " + subject + " file using the available placement and formatting options.";
    if (has("watermark")) return "Add a visible watermark to a supported " + subject + " file and review its placement on the pages.";
    if (has("metadata")) return "Inspect or edit metadata supported by this " + subject + " workflow. Check the saved file after processing.";
    if (has("text extractor")) return "Extract readable text from a supported " + subject + " file and review the output for missing or misread content.";
    if (has("image extractor")) return "Extract supported images embedded in a " + subject + " file and review the saved image files.";
    if (has("screenshot")) return "Create a visual capture of a supported " + subject + " page for review or presentation.";
    if (has("comparison")) return "Compare supported " + subject + " files and review the differences reported by the tool.";
    if (has("print layout")) return "Prepare a " + subject + " layout for printing and review page size, orientation and margins before printing.";
  }
  if (category === "creators") {
    if (has("revenue calculator")) return "Estimate potential " + label + " creator revenue from the figures and assumptions you enter. This is an estimate, not a platform payout statement.";
    if (has("engagement calculator")) return "Calculate an engagement measure for " + label + " from the metrics you provide. Use consistent definitions when comparing results.";
    if (has("growth calculator")) return "Calculate audience or content growth for " + label + " from the starting and ending values you enter.";
    if (has("content planner")) return "Plan content for " + label + " by organizing topics and publishing details in the fields provided.";
    if (has("caption generator")) return "Draft a " + label + " caption from the topic and details you provide. Review wording and platform requirements before publishing.";
    if (has("title generator")) return "Draft a title for " + label + " content from the subject and details you enter.";
    if (has("description generator")) return "Draft a description for " + label + " content. Check names, claims and links before publishing.";
    if (has("hashtag generator")) return "Prepare hashtag ideas for " + label + " content. Review relevance and current platform conventions before using them.";
    if (has("bio generator")) return "Draft a creator bio for " + label + " using the information you provide.";
    if (has("posting time helper")) return "Plan a publishing time for " + label + ". Confirm the timing with your own audience analytics before scheduling.";
    if (has("content calendar")) return "Organize " + label + " content in a publishing calendar so planned posts and dates are easier to review.";
    if (has("thumbnail size helper")) return "Check thumbnail dimensions for " + label + " and review current platform specifications before publishing.";
  }
  if (category === "social") {
    if (has("size guide")) return "Review image dimensions for " + label + " profile, post, story or banner placements. Confirm current platform specifications before publishing.";
    if (has("caption helper")) return "Draft or refine a caption for " + label + " using the context you provide.";
    if (has("hashtag helper")) return "Prepare relevant hashtag ideas for " + label + ". Check current topic and platform usage before publishing.";
    if (has("bio helper")) return "Draft a profile bio for " + label + " using the details and length requirements you provide.";
    if (has("username generator")) return "Generate username ideas for " + label + " from the words or preferences you enter.";
    if (has("post mockup")) return "Create a sample " + label + " post layout for planning or presentation. Keep mockups clearly identified as examples.";
    if (has("profile mockup")) return "Create a sample " + label + " profile layout for planning or presentation. It does not represent a live account.";
    if (has("engagement calculator")) return "Calculate an engagement measure for " + label + " from the metrics you enter. Use consistent definitions when comparing accounts.";
  }
  if (category === "business") {
    const topic = {
      "break-even": "Find the sales level at which revenue covers fixed and variable costs.",
      "cash flow": "Review cash entering and leaving a business over the period you select.",
      "commission": "Calculate commission from the rate and eligible sales amount you enter.",
      "customer acquisition cost": "Calculate customer acquisition cost from acquisition spending and the number of customers gained.",
      "customer lifetime value": "Estimate customer lifetime value from revenue, margin and retention assumptions.",
      "expense": "Organize or total business expenses using the amounts and categories you provide.",
      "inventory": "Review stock quantities and inventory values from the details you enter.",
      "invoice": "Prepare or review an invoice using customer, item, quantity, price and payment details.",
      "margin": "Calculate a profit margin from the revenue and cost values you enter.",
      "markup": "Calculate a selling-price markup from product cost and the rate you select.",
      "payslip": "Prepare a payslip-style record using the pay and deduction details you provide.",
      "pricing": "Review a product or service price using the costs and margin assumptions you enter.",
      "profit": "Calculate profit from the revenue and cost figures you provide.",
      "purchase order": "Prepare a purchase order with supplier, item, quantity and price details.",
      "quotation": "Prepare a quotation with the products or services, quantities and prices you enter.",
      "receipt": "Prepare a receipt showing the transaction details and amounts you provide.",
      "recurring revenue": "Review recurring revenue using the subscription or billing figures you enter.",
      "roi": "Calculate return on investment from the cost and return figures you provide.",
      "salary": "Calculate or review salary figures using the pay period and amounts you enter.",
      "estimate": "Prepare a business estimate from the items, quantities and prices you provide."
    }[subject] || "Work with " + subject + " details for a business task.";
    if (is("calculator")) return topic + " Check the inputs and assumptions before using the result.";
    if (is("estimator")) return "Estimate " + subject + " from the figures and assumptions you provide. Review the estimate before making a business decision.";
    if (is("generator")) return "Create " + subject + " content from the details you enter, then review the generated result.";
    if (is("planner")) return "Plan " + subject + " activity by organizing the relevant details and figures in the tool.";
    if (is("template")) return "Prepare a reusable " + subject + " template and complete the fields needed for your situation.";
  }
  if (category === "ecommerce") {
    if (is("generator")) return "Generate " + subject + " information for an online store from the details you provide.";
    if (is("calculator")) return "Calculate " + subject + " values using the quantities, prices or rates you enter. Check currency and units before using the result.";
    if (is("planner")) return "Plan " + subject + " tasks for an online store and organize the details required for the workflow.";
    if (is("template")) return "Prepare a reusable " + subject + " template for an online-store workflow.";
    if (is("mockup")) return "Create a clearly labeled sample " + subject + " layout for store planning or demonstration.";
    if (is("helper")) return "Work through a " + subject + " task with the guidance and options available in this tool.";
  }
  if (category === "marketing") {
    if (is("planner") || is("checklist")) return "Plan a " + subject + " activity and organize the tasks or decisions needed before launch.";
    if (is("generator") || is("brief generator") || is("headline helper") || is("cta generator")) return "Draft " + subject + " content from the audience, goal and details you provide. Review claims and links before publishing.";
    if (is("calculator")) return "Calculate " + subject + " metrics from the figures you enter. Check assumptions and measurement period.";
    if (is("template")) return "Prepare a reusable " + subject + " template and adapt it to your campaign or audience.";
  }
  if (category === "random") {
    if (is("wheel")) return "Add " + subject + " options to a wheel and use it to make a random selection.";
    if (is("picker")) return "Choose a random " + subject + " from the options you provide.";
    if (is("randomizer")) return "Randomize " + subject + " choices using the settings available in the tool.";
    if (is("list generator")) return "Generate a list of random " + subject + " ideas or values using the options you select.";
    if (is("generator")) return "Generate random " + subject + " ideas from the options available in the tool.";
  }
  if (category === "gaming") {
    if (is("bracket generator")) return "Create a tournament bracket for " + subject + " and review the match structure before sharing it.";
    if (is("calculator")) return "Calculate " + subject + " values from the game statistics you enter.";
    if (is("randomizer")) return "Randomize " + subject + " choices for a game or session using the available settings.";
    if (is("planner")) return "Plan a " + subject + " game activity and organize the details needed for the session.";
    if (is("tracker")) return "Track " + subject + " details for a game or session using the fields provided.";
    if (is("generator")) return "Generate " + subject + " game content from the options you select.";
  }
  if (["interactive", "relationships", "celebrations"].includes(category)) {
    if (has("countdown")) return "Create a countdown for " + subject + " using the date and message details you provide.";
    if (has("quiz")) return "Create a short " + subject + " quiz with the questions and choices available in the tool.";
    if (has("invitation")) return "Prepare a shareable " + subject + " invitation and add event details before sending it.";
    if (has("message") || has("letter")) return "Draft a " + subject + " message using the details and tone you choose.";
    if (has("reveal")) return "Build a " + subject + " reveal page with the content you choose to share.";
    if (has("page") || has("experience") || has("generator") || has("card")) return "Create a shareable " + subject + " page or experience using the content and layout options provided.";
  }
  if (category === "events") {
    if (has("invitation")) return "Create an invitation for a " + subject + " event and add date, location and other details before sharing.";
    if (has("rsvp")) return "Prepare an RSVP page for a " + subject + " event and collect responses through the options provided.";
    if (has("countdown")) return "Create a countdown for a " + subject + " event using its date and details.";
    if (has("schedule") || has("agenda")) return "Organize the schedule or agenda for a " + subject + " event using the details you enter.";
    if (has("event qr")) return "Create a QR code for a " + subject + " event using the event information you provide.";
    if (has("ticket mockup")) return "Create a clearly labeled sample ticket for a " + subject + " event; it is a design mockup, not a valid admission ticket.";
    if (has("check-in")) return "Prepare a check-in page for a " + subject + " event using the fields available in the tool.";
  }
  if (category === "photography") {
    if (has("print size")) return "Calculate or review print dimensions for a photograph using the image size and resolution you enter.";
    if (has("aspect ratio")) return "Calculate and compare photo aspect ratios for the dimensions you provide.";
    if (has("exposure")) return "Work through exposure values using the camera settings requested by the tool.";
    if (has("depth of field")) return "Estimate depth of field from the camera, lens and distance values you enter.";
    if (has("field of view") || subject === "fov") return "Estimate a camera's field of view from the sensor, lens and settings available in the tool.";
    if (has("lens") || has("sensor")) return "Review " + subject + " values used in photography planning and check the units shown by the tool.";
    if (has("passport") || has("id photo")) return "Prepare a photo layout for the selected identity-document use. Check the issuing authority's current photo rules before submitting it.";
    if (has("crop")) return "Review image crop dimensions and framing for the photograph you provide.";
    return "Work with " + subject + " details for photo planning using the inputs and options provided.";
  }
  if (category === "travel") {
    if (has("budget")) return "Estimate a travel budget from the costs, dates and currency you enter. Confirm prices with current providers before booking.";
    if (has("fuel")) return "Estimate fuel use or cost for a trip using the distance, efficiency and price values you provide.";
    if (has("distance")) return "Calculate or compare travel distances from the route values you enter.";
    if (has("timezone") || has("flight time") || has("jet lag")) return "Compare travel times or local times using the locations and dates you provide.";
    if (has("packing")) return "Prepare a packing list for a trip using the destination, duration and preferences you enter.";
    if (has("itinerary")) return "Organize trip stops and activities into an itinerary using the details you provide.";
    if (has("currency")) return "Work with travel currency amounts using the exchange values or rates supplied by the tool. Verify live rates before a transaction.";
    if (has("checklist")) return "Prepare a travel checklist for the trip details you enter.";
    return "Plan " + subject + " details for a trip using the options available in the tool.";
  }
  if (category === "food") {
    if (has("recipe") || has("serving") || has("scaler")) return "Scale recipe ingredients for the number of servings you select and review the adjusted quantities.";
    if (has("unit") || has("converter")) return "Convert kitchen measurements between the units supported by this tool.";
    if (has("oven") || has("temperature")) return "Convert or calculate cooking temperatures using the values and units you provide.";
    if (has("food cost")) return "Estimate meal or ingredient cost from the quantities and prices you enter.";
    if (has("meal")) return "Plan meals and organize the ingredients or servings you provide.";
    if (has("cooking time")) return "Estimate cooking time from the food and preparation details requested by the tool; check doneness safely.";
    if (has("nutrition")) return "Review nutrition estimates using the ingredients and quantities you enter. Treat results as estimates.";
    return "Work with " + subject + " details for recipe planning or cooking using the inputs provided.";
  }
  if (category === "career") {
    if (has("resume") || has("cv")) return "Prepare or review resume content using the experience and role details you provide.";
    if (has("cover letter")) return "Draft a cover letter for a role using your experience and the job details you enter.";
    if (has("interview")) return "Prepare for an interview with practice questions or planning prompts related to the role you select.";
    if (has("salary")) return "Calculate or compare salary figures using the pay amounts and period you provide.";
    if (has("job")) return "Organize job-search details and application tasks using the options available in the tool.";
    if (has("portfolio")) return "Organize portfolio content around the work and experience you want to present.";
    return "Prepare " + subject + " material for career planning using the details you provide.";
  }
  if (category === "personal") {
    if (has("budget")) return "Plan a personal budget from the income, expenses and period you enter.";
    if (has("habit")) return "Set up a habit plan and organize the schedule or progress details available in the tool.";
    if (has("goal")) return "Turn a personal goal into steps and milestones using the details you provide.";
    if (has("decision")) return "Compare options for a personal decision using the criteria you choose.";
    if (has("routine")) return "Organize a daily or weekly routine from the activities and times you enter.";
    if (has("checklist")) return "Create a checklist for the personal task or event you are planning.";
    if (has("countdown")) return "Set a countdown for a personal date or event.";
    return "Organize " + subject + " details for an everyday personal task.";
  }
  if (category === "accessibility") {
    if (has("contrast")) return "Check color contrast for the values you provide and review the applicable text or interface thresholds.";
    if (has("alt text")) return "Review image alternative text for clarity and relevance to the image's purpose.";
    if (has("keyboard")) return "Review keyboard access for the interface or controls checked by this tool.";
    if (has("form")) return "Review form labels and input guidance against the accessibility checks available in the tool.";
    if (has("motion")) return "Review motion-related interface settings and identify the checks provided by the tool.";
    if (has("checker") || has("simulator")) return "Check " + subject + " using the accessibility criteria or simulation available in the tool. Review limitations before treating the result as an audit.";
    return "Review " + subject + " accessibility guidance and checks for the interface you are working on.";
  }
  if (category === "communication") {
    if (has("agenda")) return "Prepare a meeting agenda with the topics and timing you provide.";
    if (has("minutes")) return "Organize meeting notes into minutes using the details you enter.";
    if (has("email")) return "Draft an email for the purpose and audience you specify.";
    if (has("message") || has("sms")) return "Draft a message using the recipient, purpose and tone you choose.";
    if (has("signature")) return "Prepare an email signature using the contact and role details you provide.";
    if (has("invitation")) return "Prepare an invitation message and add the date and event details before sending.";
    if (has("reminder")) return "Draft a reminder with the date, action and details you provide.";
    return "Prepare " + subject + " content for clear everyday communication.";
  }
  if (category === "streaming") {
    if (has("bitrate")) return "Calculate a streaming bitrate estimate from the resolution, frame rate and other values requested by the tool. Check current platform recommendations before going live.";
    if (has("resolution")) return "Review stream resolution settings for " + label + " and confirm current platform requirements before broadcasting.";
    if (has("schedule")) return "Plan a " + label + " stream schedule with the dates and times you provide.";
    if (has("title generator")) return "Draft a title for a " + label + " livestream based on its topic and audience.";
    if (has("description generator")) return "Draft a description for a " + label + " livestream. Check links and claims before publishing.";
    if (has("overlay")) return "Plan overlay content for a " + label + " stream and review what viewers will see.";
    if (has("checklist")) return "Prepare a pre-stream checklist for " + label + " so you can review setup before broadcasting.";
    if (has("revenue")) return "Estimate potential " + label + " streaming revenue from the assumptions you enter; actual earnings depend on platform terms and eligibility.";
    if (has("aspect ratio")) return "Calculate or review stream aspect ratios for " + label + " using the values you provide.";
  }
  if (category === "video") {
    if (has("size calculator")) return "Estimate video file size for " + label + " from duration, bitrate and other values you enter.";
    if (has("aspect ratio")) return "Calculate video aspect ratios for " + label + " using the frame dimensions you provide.";
    if (has("bitrate")) return "Estimate a video bitrate for " + label + " from the output settings you enter. Check target platform recommendations.";
    if (has("fps") || has("frame calculator")) return "Calculate frame or frame-rate values for " + label + " from the timing and video settings you provide.";
    if (has("thumbnail")) return "Review thumbnail dimensions for " + label + " and verify current platform specifications before publishing.";
    if (has("caption") || has("subtitle")) return "Prepare caption or subtitle content for " + label + "; review timing and text before publishing.";
    if (has("duration")) return "Calculate or convert video duration values for " + label + " using the inputs provided.";
    if (has("export preset")) return "Review export settings for " + label + " and check target platform requirements before exporting.";
  }
  if (category === "audio") {
    if (has("file size")) return "Estimate audio file size for " + label + " from duration, bitrate and other settings you provide.";
    if (has("bitrate")) return "Calculate or compare audio bitrate settings for " + label + " using the values entered.";
    if (has("sample rate")) return "Review audio sample-rate settings for " + label + " and check the requirements of the intended playback or editing system.";
    if (has("loudness")) return "Review audio loudness settings for " + label + " using the measurements or targets requested by the tool.";
    if (has("bpm")) return "Calculate or review tempo information for " + label + " using the values you provide.";
    if (has("metadata")) return "Review audio metadata fields for " + label + " and check the details before exporting or sharing the file.";
    if (has("export preset")) return "Review export settings for " + label + " and match them to the intended destination.";
    if (has("format guide")) return "Compare audio format guidance for " + label + " and confirm compatibility with your intended playback or publishing service.";
  }
  if (category === "mockups" && has("mockup")) return "Create a clearly labeled fictional " + subject + " mockup for a story, presentation or interface concept. It is not a real conversation or notification.";
  if (category === "screenshots") {
    if (has("annotation")) return "Add notes or visual callouts to a screenshot for review or presentation.";
    if (has("redaction")) return "Cover selected sensitive areas in a screenshot before sharing it. Check the exported file to confirm the information is concealed.";
    if (has("frame") || has("mockup") || has("presentation")) return "Place a screenshot in a " + subject + " frame for a clearer presentation. Review crop and sizing before exporting.";
    if (has("beautifier")) return "Improve the presentation of a screenshot with the layout options available in the tool.";
    if (has("collage")) return "Arrange screenshots into a presentation collage and review the layout before exporting.";
  }

  if (has("calculator")) return "Calculate " + subject + " from the values you enter. Review displayed units and assumptions before using the result.";
  if (has("estimator")) return "Estimate " + subject + " from the information and assumptions you provide.";
  if (has("generator")) return "Generate " + subject + " content using the options available in this tool. Review the result before using it.";
  if (has("planner")) return "Plan " + subject + " tasks by organizing the details and choices you provide.";
  if (has("template")) return "Prepare a reusable " + subject + " template and complete the fields required for your use.";
  if (has("builder")) return "Build " + subject + " content using the fields and options available in this tool.";
  if (has("checker")) return "Check " + subject + " using the criteria provided by this tool and review any reported issues.";
  if (has("helper")) return "Work with " + subject + " using the guidance and options available in this tool.";
  if (has("guide")) return "Review guidance for " + subject + " and verify current requirements before acting on it.";
  if (has("mockup")) return "Create a clearly labeled sample " + subject + " for demonstration or design review.";
  if (has("preview")) return "Preview " + subject + " and inspect the result before using it.";
  if (has("checklist")) return "Review the main steps for " + subject + " using the checklist provided.";
  if (has("tracker")) return "Track " + subject + " details using the fields available in this tool.";
  return "Work with " + subject + " using the inputs and options provided by this tool.";
}

/**
 * @param {CatalogueCopyInput} tool
 * @returns {string}
 */
export function refineGeneratedToolDescription(tool) {
  const current = String(tool.description ?? "").trim();
  const lowQuality =
    /utility for the enV toolkit/i.test(current) ||
    /^(?:a|an) (?:practical |e-commerce |food and cooking |travel |career |personal |accessibility |communication |streaming |fun |photography |audio |video )?.{1,55} (?:business )?utility\.$/i.test(current) ||
    /for developers and technical workflows\.$/i.test(current) ||
    /creator utility for planning and publishing\.$/i.test(current) ||
    /social-media utility\.$/i.test(current) ||
    /marketing utility\.$/i.test(current) ||
    /random utility\.$/i.test(current) ||
    /interactive .* experience\.$/i.test(current) ||
    /relationship\/social experience\.$/i.test(current) ||
    /utility for document workflows\.$/i.test(current) ||
    /design utility for modern interfaces\.$/i.test(current) ||
    /helper for web design and interface work\.$/i.test(current) ||
    /a (?:video|audio) utility\.$/i.test(current) ||
    /mockup\.$/i.test(current);
  if (!lowQuality) return current;

  if (tool.category === "calculators") {
    const base = tool.name.replace(/\s+Calculator$/i, "");
    const id = String(tool.id ?? "");
    const group = id.startsWith("finance-") ? "finance"
      : id.startsWith("construction-") ? "construction"
        : id.startsWith("science-") ? "science" : "math";
    if (group === "finance") return "Estimate " + lower(base) + " using the financial values you enter. Check rates, timing and assumptions before relying on the result.";
    if (group === "construction") return "Estimate " + lower(base) + " from the dimensions and quantities you enter. Confirm measurements and material assumptions before ordering or building.";
    if (group === "science") return "Calculate " + lower(base) + " from the scientific values you enter. Check the units and assumptions shown with the result.";
    return "Calculate " + lower(base) + " from the values you enter. Review displayed units and any calculation steps before using the result.";
  }
  if (tool.category === "converters") {
    const match = tool.name.match(/^(.+?) to (.+?) (Converter|Helper)$/i);
    if (match) return "Convert " + match[1].toUpperCase() + " to " + match[2].toUpperCase() + " using the formats supported by this tool. Review the output before using it.";
  }
  const { prefix, operation } = splitName(tool.name);
  return describe(tool.category, prefix, operation);
}
