const CODE_LIFETIME_MINUTES = 10;

const renderHtml = (code: string) => `<!doctype html>
<html>
  <body style="margin:0;background:#090909;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#161616;border-radius:28px;padding:36px">
            <tr><td style="font-size:22px;font-weight:600;padding-bottom:12px">Your Raffi sign-in code</td></tr>
            <tr><td style="font-size:15px;line-height:22px;color:rgba(255,255,255,0.62);padding-bottom:28px">Enter this code in Raffi to sign in. It expires in ${CODE_LIFETIME_MINUTES} minutes.</td></tr>
            <tr><td style="font-size:36px;font-weight:600;letter-spacing:10px;background:rgba(255,255,255,0.06);border-radius:20px;padding:20px 0;text-align:center">${code}</td></tr>
            <tr><td style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.42);padding-top:28px">If you didn't try to sign in, you can ignore this email.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const renderText = (code: string) =>
  `Your Raffi sign-in code is ${code}\n\nIt expires in ${CODE_LIFETIME_MINUTES} minutes. If you didn't try to sign in, you can ignore this email.`;

export const OTP_LIFETIME_SECONDS = CODE_LIFETIME_MINUTES * 60;

export const sendSignInCode = async (env: Env, email: string, code: string) => {
  await env.EMAIL.send({
    from: { name: "Raffi", email: env.EMAIL_FROM },
    to: email,
    subject: `${code} is your Raffi sign-in code`,
    text: renderText(code),
    html: renderHtml(code),
  });
};
