import { NativeModule, requireNativeModule } from "expo";

export type ContactExchangeEvent = {
  type: "active" | "permission-needed" | "connected" | "contact-received" | "participant-left" | "stopped" | "error";
  data?: {
    participantId?: string;
    endpointId?: string;
    peer?: string;
    card?: string | Record<string, string>;
    message?: string;
  };
};

declare class ContactExchangeModule extends NativeModule<{
  onContactExchangeEvent: (event: ContactExchangeEvent) => void;
}> {
  getPermissionState(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startExchange(profileJson: string, fields: string[]): Promise<boolean>;
  stopExchange(): Promise<boolean>;
}

export default requireNativeModule<ContactExchangeModule>("ContactExchange");
