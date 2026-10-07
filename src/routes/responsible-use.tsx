import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/responsible-use")({ component: ResponsibleUse });

function ResponsibleUse() {
  return (
    <InfoPage title="Responsible Use">
      <p>Use enV lawfully, respectfully, and with appropriate human judgment. These rules apply to every platform and to content created, transformed, analyzed, or shared through the service.</p>
      <p>enV is for people aged 13 or older. If you are under the age of majority where you live, follow any local parent or guardian permission requirements that apply to you.</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Do not use enV to</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>break the law, facilitate fraud, or infringe another person’s copyright, privacy, or other rights;</li>
          <li>harass, threaten, exploit, impersonate, deceive, or target people without their consent;</li>
          <li>create or distribute malware, credentials-stealing material, spam, or instructions intended to cause harm;</li>
          <li>share someone else’s contact details or personal information without a lawful basis and appropriate permission;</li>
          <li>bypass security, access systems or data without authorization, or disrupt enV or third-party services; or</li>
          <li>treat a generated or calculated result as verified professional advice or as the sole basis for a high-stakes decision.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Your responsibilities</h2>
        <p>Only submit material you are allowed to use. Review connected-tool notices before sending text or files to a server or AI provider. In Contact Exchange, activate sharing only when you intend to exchange information and enable only fields you are comfortable sending to nearby participants.</p>
        <p>Keep a human in control: review outputs, verify important facts, and use qualified professionals for legal, medical, financial, tax, and safety-critical matters.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Reporting a concern</h2>
        <p>If you believe enV is being used unlawfully or encounter a safety or privacy issue, contact <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>. Company-related correspondence may be sent to <a className="text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">chastechnologiesllc@gmail.com</a>.</p>
      </section>
    </InfoPage>
  );
}
