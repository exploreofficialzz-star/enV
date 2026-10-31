import { createContext } from "react";

export type ToolExecutionOutcome = "success" | "failure" | "cancelled";
export type ToolExecutionTelemetry = {
  finish: (outcome: ToolExecutionOutcome, errorCode?: string) => void;
};

export const ToolExecutionTelemetryContext = createContext<ToolExecutionTelemetry | null>(null);
