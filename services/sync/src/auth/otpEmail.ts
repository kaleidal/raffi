const CODE_LIFETIME_MINUTES = 10;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const LIGHT = {
  canvas: "#f4f4f4",
  card: "#ffffff",
  well: "#efefef",
  ink: "#111111",
  inkSoft: "#555555",
  inkMuted: "#777777",
};

const DARK: typeof LIGHT = {
  canvas: "#090909",
  card: "#161616",
  well: "#252525",
  ink: "#ffffff",
  inkSoft: "#a8a8a8",
  inkMuted: "#7d7d7d",
};

const darkRules = (scope: string) =>
  [
    `${scope} .canvas { background-color: ${DARK.canvas} !important; }`,
    `${scope} .card { background-color: ${DARK.card} !important; }`,
    `${scope} .well { background-color: ${DARK.well} !important; }`,
    `${scope} .ink { color: ${DARK.ink} !important; }`,
    `${scope} .ink-soft { color: ${DARK.inkSoft} !important; }`,
    `${scope} .ink-muted { color: ${DARK.inkMuted} !important; }`,
  ].join("\n");

const renderHtml = (code: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media (prefers-color-scheme: dark) {
${darkRules(":root")}
      }
    </style>
    <style>
${darkRules("[data-ogsc]")}
    </style>
  </head>
  <body class="canvas" style="margin:0;background-color:${LIGHT.canvas}">
    <table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT.canvas}" style="background-color:${LIGHT.canvas};font-family:${FONT}">
      <tr>
        <td align="center" style="padding:48px 16px">
          <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT.card}" style="max-width:440px;background-color:${LIGHT.card};border-radius:28px">
            <tr><td class="ink" style="font-size:22px;font-weight:600;color:${LIGHT.ink};padding:36px 36px 12px">Your Raffi sign-in code</td></tr>
            <tr><td class="ink-soft" style="font-size:15px;line-height:22px;color:${LIGHT.inkSoft};padding:0 36px 28px">Enter this code in Raffi to sign in. It expires in ${CODE_LIFETIME_MINUTES} minutes.</td></tr>
            <tr>
              <td style="padding:0 36px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td class="well ink" align="center" bgcolor="${LIGHT.well}" style="font-size:36px;font-weight:600;letter-spacing:10px;color:${LIGHT.ink};background-color:${LIGHT.well};border-radius:20px;padding:20px 0">${code}</td></tr>
                </table>
              </td>
            </tr>
            <tr><td class="ink-muted" style="font-size:13px;line-height:20px;color:${LIGHT.inkMuted};padding:28px 36px 36px">If you didn't try to sign in, you can ignore this email.</td></tr>
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
