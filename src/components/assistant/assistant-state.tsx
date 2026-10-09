import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from "react";
import type { ToolMeta } from "@/types/tool";

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };
export type ChatTurn = ChatMessage & { recommendedToolIds?: string[] };
export type ToolCandidate = Pick<ToolMeta, "id" | "name" | "description" | "category">;
export type AssistantRequest = { messages: ChatMessage[]; candidates: ToolCandidate[] };

export type AssistantState = {
  messages: ChatTurn[];
  setMessages: Dispatch<SetStateAction<ChatTurn[]>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  retryRequest: AssistantRequest | null;
  setRetryRequest: Dispatch<SetStateAction<AssistantRequest | null>>;
  activeRequest: MutableRefObject<AbortController | null>;
};

const AssistantStateContext = createContext<AssistantState | null>(null);

export function AssistantStateProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<AssistantRequest | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const value: AssistantState = {
    messages,
    setMessages,
    draft,
    setDraft,
    busy,
    setBusy,
    error,
    setError,
    retryRequest,
    setRetryRequest,
    activeRequest,
  };

  return <AssistantStateContext.Provider value={value}>{children}</AssistantStateContext.Provider>;
}

export function useAssistantState() {
  const state = useContext(AssistantStateContext);
  if (!state) throw new Error("useAssistantState must be used within AssistantStateProvider.");
  return state;
}
