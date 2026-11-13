export { EmailFooter } from "./components/EmailFooter";
export { EmailHeader } from "./components/EmailHeader";
export { emailTheme, type EmailTheme } from "./components/theme";
export { sendEmail, type SendEmailInput, type SendEmailResult } from "./send";
export { PromoEmail, type PromoEmailProps } from "./templates/Promo";
export { WelcomeEmail, type WelcomeEmailProps } from "./templates/Welcome";

import { sendEmail } from "./send";
import { WelcomeEmail, type WelcomeEmailProps } from "./templates/Welcome";

export async function sendWelcomeEmail(props: WelcomeEmailProps & { to: string }) {
  const { to, ...rest } = props;
  return sendEmail({
    to,
    subject: `Welcome to Resume Pilot, ${rest.firstName}`,
    element: WelcomeEmail(rest),
  });
}
