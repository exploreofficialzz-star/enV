import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/disclaimer")({ component: Disclaimer });

function Disclaimer() {
  return (
    <InfoPage title="Disclaimer">
      <p>enV is a general-purpose toolkit developed by chAs Technologies LLC. It is provided for convenience and informational use; it is not a substitute for professional judgment or advice.</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Verify every result</h2>
        <p>Calculations, conversions, generated text, extracted data, and other results can be incomplete, inaccurate, outdated, or affected by the information you provide. Check inputs, assumptions, units, and outputs against reliable sources before relying on them or sharing them with others.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Not professional advice</h2>
        <p>enV does not provide legal, medical, mental-health, financial, investment, tax, accounting, engineering, or safety-critical advice. Do not use a tool result as the sole basis for a decision that could affect someone’s health, rights, finances, safety, or legal obligations. Consult a qualified professional when appropriate.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">AI and third-party services</h2>
        <p>AI-generated content may be wrong, biased, incomplete, or unsuitable. It may not be unique and may require human review. Connected features may depend on third-party providers, whose outputs, availability, and policies are outside enV’s control. Review the Privacy and Terms pages before sending sensitive information to a connected feature.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">No guarantee</h2>
        <p>enV and its results are provided without a guarantee of fitness for a particular purpose or error-free operation, except for rights that cannot be limited under applicable law. You are responsible for deciding whether a tool and its result are appropriate for your situation.</p>
      </section>
    </InfoPage>
  );
}
