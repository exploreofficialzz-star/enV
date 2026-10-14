import { formatWithGrammarDirect, type StructuredFormatter } from "./precise-formatters.ts";

type RequestMessage = { language: "sql" | StructuredFormatter; input: string; dialect?: string };
type ResponseMessage = { ok: true; result: string } | { ok: false; error: string };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null;
  postMessage: (message: ResponseMessage) => void;
};

scope.onmessage = async (event) => {
  try {
    const { language, input, dialect } = event.data;
    const result = await formatWithGrammarDirect(input, language, dialect);
    scope.postMessage({ ok: true, result });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
