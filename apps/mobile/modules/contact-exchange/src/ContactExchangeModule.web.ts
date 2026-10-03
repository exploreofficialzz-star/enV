import { registerWebModule, NativeModule } from "expo";
import type { ContactExchangeEvent } from "./ContactExchangeModule";

class ContactExchangeModule extends NativeModule<{
  onContactExchangeEvent: (event: ContactExchangeEvent) => void;
}> {
  async getPermissionState(): Promise<boolean> { return false; }
  async requestPermissions(): Promise<boolean> { return false; }
  async startExchange(): Promise<boolean> { return false; }
  async stopExchange(): Promise<boolean> { return true; }
}

export default registerWebModule(ContactExchangeModule, "ContactExchange");
