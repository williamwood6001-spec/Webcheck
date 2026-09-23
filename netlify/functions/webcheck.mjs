import { getStore } from "@netlify/blobs";
import dns from "node:dns/promises";
import tls from "node:tls";
import crypto from "node:crypto";

/* =========================================================
   WEBCheck Configuration
   ========================================================= */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = String(
  process.env.ADMIN_USER_ID || ""
);

const MOMO_NAME =
  process.env.MOMO_NAME || "WEBCheck";

const MOMO_NUMBER =
  process.env.MOMO_NUMBER || "0000000000";

/* =========================================================
   Netlify Blobs
   ========================================================= */

const store = getStore("webcheck-data");

/* =========================================================
   Basic Helpers
   ========================================================= */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function randomId(prefix = "WC") {
  return (
    prefix +
    "-" +
    crypto.randomBytes(4)
      .toString("hex")
      .toUpperCase()
  );
}

/* =========================================================
   Telegram API
   ========================================================= */

async function telegram(method, body = {}) {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  return response.json();
}

async function sendMessage(
  chatId,
  text,
  extra = {}
) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function answerCallback(
  callbackId,
  text = ""
) {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackId,
    text
  });
}

/* =========================================================
   Admin
   ========================================================= */

function isAdmin(userId) {
  return String(userId) === ADMIN_USER_ID;
}

/* =========================================================
   Database Helpers
   ========================================================= */

async function getJSON(key, fallback) {
  const value = await store.get(key, {
    type: "json"
  });

  return value ?? fallback;
}

async function saveJSON(key, value) {
  await store.setJSON(key, value);
}

/* =========================================================
   Users
   ========================================================= */

async function getUsers() {
  return getJSON("users", {});
}

async function saveUsers(users) {
  await saveJSON("users", users);
}

async function registerUser(user) {
  const users = await getUsers();

  const id = String(user.id);

  if (!users[id]) {
    users[id] = {
      id,
      username: user.username || "",
      firstName: user.first_name || "",
      lastName: user.last_name || "",

      credits: 0,

      totalChecks: 0,

      pendingType: null,

      joinedAt:
        new Date().toISOString()
    };
  } else {
    users[id].username =
      user.username ||
      users[id].username;

    users[id].firstName =
      user.first_name ||
      users[id].firstName;

    users[id].lastName =
      user.last_name ||
      users[id].lastName;
  }

  await saveUsers(users);

  return users[id];
}

async function addCredits(
  userId,
  credits
) {
  const users = await getUsers();

  const id = String(userId);

  if (!users[id]) {
    return false;
  }

  users[id].credits =
    Number(users[id].credits || 0) +
    Number(credits);

  await saveUsers(users);

  return true;
}

async function useCredit(userId) {
  const users = await getUsers();

  const id = String(userId);

  if (!users[id]) {
    return false;
  }

  if (
    Number(users[id].credits || 0) <
    1
  ) {
    return false;
  }

  users[id].credits -= 1;

  users[id].totalChecks =
    Number(users[id].totalChecks || 0) +
    1;

  await saveUsers(users);

  return true;
}

/* =========================================================
   Payments
   ========================================================= */

async function getPayments() {
  return getJSON("payments", {});
}

async function savePayments(payments) {
  await saveJSON("payments", payments);
}

/* =========================================================
   Reports
   ========================================================= */

async function getReports() {
  return getJSON("reports", {});
}

async function saveReports(reports) {
  await saveJSON("reports", reports);
}

/* =========================================================
   Main Keyboard
   ========================================================= */

function mainKeyboard() {
  return {
    inline_keyboard: [

      [
        {
          text: "🌐 Website Check",
          callback_data: "website"
        },

        {
          text: "📱 Phone Check",
          callback_data: "phone"
        }
      ],

      [
        {
          text: "💳 Buy Checks",
          callback_data: "buy"
        },

        {
          text: "📊 My Account",
          callback_data: "account"
        }
      ],

      [
        {
          text: "❓ Help",
          callback_data: "help"
        }
      ]

    ]
  };
}

/* =========================================================
   START
   ========================================================= */

async function startBot(
  chatId,
  user
) {
  const account =
    await registerUser(user);

  await sendMessage(
    chatId,

    `🤖 <b>Welcome to WEBCheck</b>

WEBCheck provides paid website and phone risk assessments.

🔎 <b>Available checks</b>

🌐 Website Risk Assessment
📱 Phone Risk Assessment

💳 <b>Packages</b>

GH₵5 → 1 check
GH₵10 → 3 checks
GH₵20 → 7 checks

🎟️ Your current balance:

<b>${account.credits}</b> check(s)

Choose an option below.`,

    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =========================================================
   BUY PACKAGES
   ========================================================= */

async function showPackages(
  chatId
) {
  await sendMessage(
    chatId,

    `💳 <b>WEBCheck Packages</b>

Choose a package:

💵 <b>GH₵5</b> → 1 check
💵 <b>GH₵10</b> → 3 checks
💵 <b>GH₵20</b> → 7 checks

You can use your credits for:

🌐 Website checks
📱 Phone checks`,

    {
      reply_markup: {
        inline_keyboard: [

          [
            {
              text:
                "💵 GH₵5 — 1 Check",

              callback_data:
                "package:5:1"
            }
          ],

          [
            {
              text:
                "💵 GH₵10 — 3 Checks",

              callback_data:
                "package:10:3"
            }
          ],

          [
            {
              text:
                "💵 GH₵20 — 7 Checks",

              callback_data:
                "package:20:7"
            }
          ],

          [
            {
              text: "❌ Cancel",

              callback_data:
                "home"
            }
          ]

        ]
      }
    }
  );
}

/* =========================================================
   CREATE PAYMENT
   ========================================================= */

async function createPayment(
  chatId,
  userId,
  amount,
  credits
) {
  const paymentId =
    randomId("WC");

  const payments =
    await getPayments();

  payments[paymentId] = {

    id: paymentId,

    userId:
      String(userId),

    amount,

    credits,

    status:
      "pending",

    createdAt:
      new Date().toISOString(),

    customerClaimedAt:
      null,

    approvedAt:
      null

  };

  await savePayments(payments);

  await sendMessage(
    chatId,

    `💳 <b>WEBCheck Payment</b>

Package:

<b>GH₵${amount} → ${credits} check${
      credits > 1 ? "s" : ""
    }</b>

━━━━━━━━━━━━━━

📱 <b>Send MoMo to:</b>

Name:
<b>${esc(MOMO_NAME)}</b>

Number:
<code>${esc(MOMO_NUMBER)}</code>

Amount:
<b>GH₵${amount}</b>

━━━━━━━━━━━━━━

🧾 <b>Payment Reference</b>

<code>${paymentId}</code>

After sending the money, tap:

<b>✅ I've Paid</b>

Your credits will only be added after the administrator manually verifies the transaction.`,

    {
      reply_markup: {
        inline_keyboard: [

          [
            {
              text:
                "✅ I've Paid",

              callback_data:
                `paid:${paymentId}`
            }
          ],

          [
            {
              text:
                "❌ Cancel",

              callback_data:
                "home"
            }
          ]

        ]
      }
    }
  );
}

/* =========================================================
   CUSTOMER CLAIMS PAYMENT
   ========================================================= */

async function customerPaid(
  chatId,
  userId,
  paymentId
) {
  const payments =
    await getPayments();

  const payment =
    payments[paymentId];

  if (!payment) {
    return sendMessage(
      chatId,
      "❌ Payment request not found."
    );
  }

  if (
    String(payment.userId) !==
    String(userId)
  ) {
    return sendMessage(
      chatId,
      "❌ This payment does not belong to your account."
    );
  }

  if (
    payment.status !==
    "pending"
  ) {
    return sendMessage(
      chatId,

      `ℹ️ This payment is already marked as <b>${payment.status}</b>.`
    );
  }

  payment.customerClaimedAt =
    new Date().toISOString();

  await savePayments(payments);

  await sendMessage(
    chatId,

    `⏳ <b>Payment submitted.</b>

Reference:

<code>${paymentId}</code>

Your payment is waiting for manual verification.

You will receive your credits after the administrator confirms the MoMo transaction.`
  );

  if (ADMIN_USER_ID) {

    await sendMessage(

      ADMIN_USER_ID,

      `🔔 <b>NEW PAYMENT TO VERIFY</b>

━━━━━━━━━━━━━━

🧾 Reference:
<code>${paymentId}</code>

👤 Customer ID:
<code>${payment.userId}</code>

💰 Amount:
<b>GH₵${payment.amount}</b>

🎟️ Credits:
<b>${payment.credits}</b>

━━━━━━━━━━━━━━

The customer says they have paid.

Check your MoMo transaction before approving.`,

      {
        reply_markup: {
          inline_keyboard: [

            [
              {
                text:
                  "✅ CONFIRM PAYMENT",

                callback_data:
                  `approve:${paymentId}`
              }
            ],

            [
              {
                text:
                  "❌ REJECT",

                callback_data:
                  `reject:${paymentId}`
              }
            ]

          ]
        }
      }
    );

  }
}

/* =========================================================
   APPROVE PAYMENT
   ========================================================= */

async function approvePayment(
  paymentId,
  adminChatId
) {
  const payments =
    await getPayments();

  const payment =
    payments[paymentId];

  if (!payment) {
    return sendMessage(
      adminChatId,
      "❌ Payment not found."
    );
  }

  if (
    payment.status !==
    "pending"
  ) {
    return sendMessage(
      adminChatId,

      `ℹ️ Payment <code>${paymentId}</code> is already ${payment.status}.`
    );
  }

  payment.status =
    "approved";

  payment.approvedAt =
    new Date().toISOString();

  payment.approvedBy =
    String(adminChatId);

  await savePayments(payments);

  await addCredits(
    payment.userId,
    payment.credits
  );

  await sendMessage(
    payment.userId,

    `✅ <b>Payment Confirmed!</b>

💰 Amount:
<b>GH₵${payment.amount}</b>

🎟️ Credits added:
<b>${payment.credits}</b>

Your WEBCheck balance has been updated.

You can now use your checks.`,

    {
      reply_markup:
        mainKeyboard()
    }
  );

  await sendMessage(
    adminChatId,

    `✅ <b>Payment Approved</b>

Reference:
<code>${paymentId}</code>

Amount:
<b>GH₵${payment.amount}</b>

Credits added:
<b>${payment.credits}</b>

Customer:
<code>${payment.userId}</code>`
  );
}

/* =========================================================
   REJECT PAYMENT
   ========================================================= */

async function rejectPayment(
  paymentId,
  adminChatId
) {
  const payments =
    await getPayments();

  const payment =
    payments[paymentId];

  if (!payment) {
    return sendMessage(
      adminChatId,
      "❌ Payment not found."
    );
  }

  if (
    payment.status !==
    "pending"
  ) {
    return sendMessage(
      adminChatId,
      `Payment is already ${payment.status}.`
    );
  }

  payment.status =
    "rejected";

  payment.rejectedAt =
    new Date().toISOString();

  await savePayments(payments);

  await sendMessage(
    payment.userId,

    `❌ <b>Payment Not Verified</b>

Reference:
<code>${paymentId}</code>

The administrator could not verify this payment.

Please contact WEBCheck support if you believe this is an error.`
  );

  await sendMessage(
    adminChatId,

    `❌ <b>Payment Rejected</b>

Reference:
<code>${paymentId}</code>`
  );
}

/* =========================================================
   ACCOUNT
   ========================================================= */

async function showAccount(
  chatId,
  userId
) {
  const users =
    await getUsers();

  const account =
    users[String(userId)];

  if (!account) {
    return sendMessage(
      chatId,
      "Account not found. Use /start."
    );
  }

  await sendMessage(
    chatId,

    `👤 <b>My WEBCheck Account</b>

Name:
<b>${esc(
      account.firstName ||
      "Customer"
    )}</b>

🎟️ Available checks:
<b>${account.credits}</b>

🔎 Completed checks:
<b>${account.totalChecks}</b>`,

    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =========================================================
   REQUEST CHECK
   ========================================================= */

async function requestCheck(
  chatId,
  userId,
  type
) {
  const users =
    await getUsers();

  const user =
    users[String(userId)];

  if (
    !user ||
    Number(user.credits || 0) <
      1
  ) {

    return sendMessage(

      chatId,

      `❌ <b>You don't have any checks.</b>

Choose a package to purchase credits.`,

      {
        reply_markup: {
          inline_keyboard: [

            [
              {
                text:
                  "💳 Buy Checks",

                callback_data:
                  "buy"
              }
            ]

          ]
        }
      }
    );
  }

  user.pendingType =
    type;

  await saveUsers(users);

  if (type === "website") {

    return sendMessage(

      chatId,

      `🌐 <b>Website Check</b>

Send the website URL.

Example:

<code>https://example.com</code>

You have:
<b>${user.credits}</b> check(s).`
    );

  }

  return sendMessage(

    chatId,

    `📱 <b>Phone Check</b>

Send the phone number with country code.

Example:

<code>+233241234567</code>

You have:
<b>${user.credits}</b> check(s).`
  );
}

/* =========================================================
   WEBSITE HELPERS
   ========================================================= */

function normalizeURL(input) {

  let value =
    String(input || "")
      .trim();

  if (!value) {
    return null;
  }

  if (
    !/^https?:\/\//i.test(value)
  ) {
    value =
      "https://" + value;
  }

  try {

    const url =
      new URL(value);

    if (
      url.protocol !==
        "https:" &&
      url.protocol !==
        "http:"
    ) {
      return null;
    }

    return url;

  } catch {

    return null;
  }
}

/* =========================================================
   DNS
   ========================================================= */

async function dnsLookup(
  hostname
) {

  const result = {

    A: [],

    AAAA: [],

    MX: [],

    NS: []

  };

  try {
    result.A =
      await dns.resolve4(
        hostname
      );
  } catch {}

  try {
    result.AAAA =
      await dns.resolve6(
        hostname
      );
  } catch {}

  try {
    result.MX =
      await dns.resolveMx(
        hostname
      );
  } catch {}

  try {
    result.NS =
      await dns.resolveNs(
        hostname
      );
  } catch {}

  return result;
}

/* =========================================================
   TLS
   ========================================================= */

async function tlsCheck(
  hostname
) {

  return new Promise(
    (resolve) => {

      const socket =
        tls.connect({

          host:
            hostname,

          port:
            443,

          servername:
            hostname,

          rejectUnauthorized:
            false,

          timeout:
            7000

        }, () => {

          const certificate =
            socket.getPeerCertificate();

          resolve({

            authorized:
              socket.authorized,

            authorizationError:
              socket.authorizationError ||
              null,

            issuer:
              certificate.issuer ||
              null,

            subject:
              certificate.subject ||
              null,

            validFrom:
              certificate.valid_from ||
              null,

            validTo:
              certificate.valid_to ||
              null

          });

          socket.end();

        });

      socket.on(
        "error",
        () => {

          resolve({

            authorized:
              false,

            authorizationError:
              "TLS connection failed"

          });

        }
      );

      socket.setTimeout(
        7000,
        () => {

          socket.destroy();

          resolve({

            authorized:
              false,

            authorizationError:
              "TLS timeout"

          });

        }
      );

    }
  );
}

/* =========================================================
   HTTP
   ========================================================= */

async function httpCheck(
  url
) {

  const result = {

    reachable:
      false,

    status:
      null,

    finalUrl:
      null,

    headers: {}

  };

  try {

    const response =
      await fetch(

        url,

        {
          method:
            "GET",

          redirect:
            "follow",

          signal:
            AbortSignal.timeout(
              10000
            ),

          headers: {

            "User-Agent":
              "WEBCheck/1.0"

          }

        }

      );

    result.reachable =
      true;

    result.status =
      response.status;

    result.finalUrl =
      response.url;

    const importantHeaders = [

      "strict-transport-security",

      "content-security-policy",

      "x-frame-options",

      "x-content-type-options",

      "referrer-policy",

      "permissions-policy"

    ];

    for (
      const header
      of importantHeaders
    ) {

      result.headers[header] =
        response.headers.get(
          header
        ) || null;

    }

  } catch (error) {

    result.error =
      error.message;

  }

  return result;
}

/* =========================================================
   WEBSITE RISK ENGINE
   ========================================================= */

function analyzeWebsite(
  url,
  dnsInfo,
  tlsInfo,
  httpInfo
) {

  let points = 0;

  const findings = [];

  if (
    url.protocol !==
    "https:"
  ) {

    points += 25;

    findings.push({

      severity:
        "high",

      text:
        "The submitted website does not use HTTPS."

    });

  } else {

    findings.push({

      severity:
        "info",

      text:
        "HTTPS is enabled."

    });

  }

  if (
    !dnsInfo.A.length &&
    !dnsInfo.AAAA.length
  ) {

    points += 20;

    findings.push({

      severity:
        "medium",

      text:
        "No public IP address was resolved."

    });

  }

  if (
    httpInfo.reachable
  ) {

    if (
      !httpInfo.headers[
        "strict-transport-security"
      ]
    ) {

      points += 5;

      findings.push({

        severity:
          "low",

        text:
          "Strict-Transport-Security was not detected."

      });

    }

    if (
      !httpInfo.headers[
        "content-security-policy"
      ]
    ) {

      points += 5;

      findings.push({

        severity:
          "low",

        text:
          "Content-Security-Policy was not detected."

      });

    }

    if (
      !httpInfo.headers[
        "x-content-type-options"
      ]
    ) {

      points += 3;

      findings.push({

        severity:
          "low",

        text:
          "X-Content-Type-Options was not detected."

      });

    }

  }

  const hostname =
    url.hostname.toLowerCase();

  const suspiciousPatterns = [

    "login-",

    "verify-",

    "secure-",

    "account-",

    "wallet-",

    "payment-",

    "update-",

    "bonus-",

    "claim-"

  ];

  for (
    const pattern
    of suspiciousPatterns
  ) {

    if (
      hostname.includes(pattern)
    ) {

      points += 8;

      findings.push({

        severity:
          "medium",

        text:
          `The hostname contains "${pattern}", a pattern sometimes seen in deceptive URLs.`

      });

      break;

    }

  }

  let risk =
    "LOW";

  if (
    points >= 45
  ) {

    risk =
      "HIGH";

  } else if (
    points >= 20
  ) {

    risk =
      "MEDIUM";

  }

  return {

    risk,

    points,

    findings

  };
}

/* =========================================================
   WEBSITE CHECK
   ========================================================= */

async function checkWebsite(
  target
) {

  const url =
    normalizeURL(target);

  if (!url) {

    throw new Error(
      "That is not a valid website URL."
    );

  }

  const hostname =
    url.hostname;

  const dnsInfo =
    await dnsLookup(
      hostname
    );

  const tlsInfo =
    await tlsCheck(
      hostname
    );

  const httpInfo =
    await httpCheck(
      url
    );

  const analysis =
    analyzeWebsite(
      url,
      dnsInfo,
      tlsInfo,
      httpInfo
    );

  return {

    id:
      randomId("REP"),

    type:
      "website",

    target:
      url.toString(),

    hostname,

    createdAt:
      new Date().toISOString(),

    dns:
      dnsInfo,

    tls:
      tlsInfo,

    http:
      httpInfo,

    analysis

  };
}

/* =========================================================
   PHONE CHECK
   ========================================================= */

function normalizePhone(
  input
) {

  const value =
    String(input || "")
      .trim()
      .replace(/[^\d+]/g, "");

  if (
    !/^\+?[1-9]\d{7,14}$/
      .test(value)
  ) {

    return null;

  }

  return value.startsWith("+")
    ? value
    : "+" + value;
}

async function checkPhone(
  target
) {

  const phone =
    normalizePhone(target);

  if (!phone) {

    throw new Error(
      "Invalid phone number. Example: +233241234567"
    );

  }

  const findings = [];

  if (
    phone.startsWith("+233")
  ) {

    findings.push(
      "The number uses Ghana's +233 country code."
    );

  }

  findings.push(
    "WEBCheck does not access private subscriber information."
  );

  findings.push(
    "A phone number alone cannot prove that its owner is fraudulent."
  );

  return {

    id:
      randomId("REP"),

    type:
      "phone",

    target:
      phone,

    createdAt:
      new Date().toISOString(),

    analysis: {

      risk:
        "UNKNOWN",

      confidence:
        "LOW",

      findings

    }

  };
}

/* =========================================================
   REPORT FORMATTING
   ========================================================= */

function websiteReport(
  report
) {

  const findings =
    report.analysis.findings
      .slice(0, 10)
      .map(
        (finding) => {

          let icon =
            "ℹ️";

          if (
            finding.severity ===
            "high"
          ) {
            icon =
              "🔴";
          }

          if (
            finding.severity ===
            "medium"
          ) {
            icon =
              "🟠";
          }

          if (
            finding.severity ===
            "low"
          ) {
            icon =
              "🟡";
          }

          return (
            icon +
            " " +
            esc(
              finding.text
            )
          );

        }
      )
      .join("\n");

  return `📊 <b>WEBCheck Report</b>

🌐 <b>Website</b>

<code>${esc(
    report.target
  )}</code>

🚦 <b>Risk:</b>
${report.analysis.risk}

━━━━━━━━━━━━━━

<b>Findings</b>

${findings}

━━━━━━━━━━━━━━

<b>DNS</b>

A records:
${report.dns.A.length}

AAAA records:
${report.dns.AAAA.length}

MX records:
${report.dns.MX.length}

NS records:
${report.dns.NS.length}

<b>TLS</b>

${
  report.tls.authorized
    ? "✅ Certificate accepted"
    : "⚠️ TLS certificate could not be verified"
}

<b>HTTP</b>

${
  report.http.reachable
    ? `Status: ${report.http.status}`
    : "⚠️ Website could not be reached"
}

━━━━━━━━━━━━━━

⚠️ <b>Important</b>

This is an automated technical risk assessment.

It is NOT proof that the website is fraudulent or legitimate.

Report ID:

<code>${report.id}</code>`;
}

function phoneReport(
  report
) {

  return `📊 <b>WEBCheck Phone Report</b>

📱 <b>Phone Number</b>

<code>${esc(
    report.target
  )}</code>

🚦 <b>Risk:</b>
${report.analysis.risk}

<b>Confidence:</b>
${report.analysis.confidence}

━━━━━━━━━━━━━━

<b>Information</b>

${report.analysis.findings
  .map(
    (x) =>
      "ℹ️ " +
      esc(x)
  )
  .join("\n")}

━━━━━━━━━━━━━━

⚠️ WEBCheck does not identify private subscribers.

A phone number alone is not proof that a person is fraudulent.

Report ID:

<code>${report.id}</code>`;
}

/* =========================================================
   SAVE REPORT
   ========================================================= */

async function saveReport(
  report,
  userId
) {

  const reports =
    await getReports();

  reports[report.id] = {

    ...report,

    userId:
      String(userId)

  };

  await saveReports(
    reports
  );
}

/* =========================================================
   PERFORM CHECK
   ========================================================= */

async function performCheck(
  chatId,
  userId,
  target,
  type
) {

  const users =
    await getUsers();

  const user =
    users[String(userId)];

  if (
    !user ||
    user.pendingType !==
      type
  ) {

    return;

  }

  if (
    Number(user.credits || 0) <
      1
  ) {

    return sendMessage(
      chatId,
      "❌ You don't have a check available."
    );

  }

  await sendMessage(
    chatId,

    `🔎 <b>WEBCheck is analyzing...</b>

Please wait.`
  );

  try {

    const report =
      type === "website"

        ? await checkWebsite(
            target
          )

        : await checkPhone(
            target
          );

    const used =
      await useCredit(
        userId
      );

    if (!used) {

      return sendMessage(
        chatId,
        "❌ Could not use your credit."
      );

    }

    await saveReport(
      report,
      userId
    );

    users[
      String(userId)
    ].pendingType =
      null;

    await saveUsers(
      users
    );

    const text =
      type === "website"

        ? websiteReport(
            report
          )

        : phoneReport(
            report
          );

    await sendMessage(
      chatId,
      text,
      {
        reply_markup: {
          inline_keyboard: [

            [
              {
                text:
                  "🔎 New Check",

                callback_data:
                  "home"
              }
            ],

            [
              {
                text:
                  "📊 My Account",

                callback_data:
                  "account"
              }
            ]

          ]
        }
      }
    );

  } catch (error) {

    await sendMessage(

      chatId,

      `❌ <b>Check Failed</b>

${esc(
        error.message
      )}`

    );

  }
}

/* =========================================================
   ADMIN PANEL
   ========================================================= */

async function adminPanel(
  chatId
) {

  const users =
    await getUsers();

  const payments =
    await getPayments();

  const reports =
    await getReports();

  const pending =
    Object.values(
      payments
    )
    .filter(
      p =>
        p.status ===
        "pending"
    )
    .length;

  await sendMessage(

    chatId,

    `🛠️ <b>WEBCheck Admin</b>

👥 Users:
<b>${Object.keys(users).length}</b>

💳 Payments:
<b>${Object.keys(payments).length}</b>

⏳ Pending:
<b>${pending}</b>

📊 Reports:
<b>${Object.keys(reports).length}</b>

━━━━━━━━━━━━━━

Commands:

/pending
/stats
/users`

  );
}

/* =========================================================
   PENDING PAYMENTS
   ========================================================= */

async function pendingPayments(
  chatId
) {

  const payments =
    await getPayments();

  const pending =
    Object.values(
      payments
    )
    .filter(
      p =>
        p.status ===
        "pending"
    );

  if (
    pending.length === 0
  ) {

    return sendMessage(
      chatId,
      "✅ No pending payments."
    );

  }

  for (
    const payment
    of pending.slice(-20)
  ) {

    await sendMessage(

      chatId,

      `💳 <b>Pending Payment</b>

Reference:

<code>${payment.id}</code>

Customer:

<code>${payment.userId}</code>

Amount:

<b>GH₵${payment.amount}</b>

Credits:

<b>${payment.credits}</b>`,

      {
        reply_markup: {
          inline_keyboard: [

            [
              {
                text:
                  "✅ Confirm",

                callback_data:
                  `approve:${payment.id}`
              },

              {
                text:
                  "❌ Reject",

                callback_data:
                  `reject:${payment.id}`
              }
            ]

          ]
        }
      }

    );

  }
}

/* =========================================================
   ADMIN STATS
   ========================================================= */

async function adminStats(
  chatId
) {

  const users =
    await getUsers();

  const payments =
    await getPayments();

  const reports =
    await getReports();

  const approved =
    Object.values(
      payments
    )
    .filter(
      p =>
        p.status ===
        "approved"
    );

  const revenue =
    approved.reduce(
      (
        total,
        payment
      ) =>
        total +
        Number(
          payment.amount ||
          0
        ),

      0
    );

  await sendMessage(

    chatId,

    `📈 <b>WEBCheck Statistics</b>

👥 Users:
<b>${Object.keys(users).length}</b>

💳 Approved payments:
<b>${approved.length}</b>

💰 Recorded revenue:
<b>GH₵${revenue}</b>

📊 Reports:
<b>${Object.keys(reports).length}</b>`

  );
}

/* =========================================================
   CALLBACK HANDLER
   ========================================================= */

async function handleCallback(
  query
) {

  const data =
    query.data || "";

  const userId =
    query.from.id;

  const chatId =
    query.message.chat.id;

  /* HOME */

  if (
    data ===
    "home"
  ) {

    await answerCallback(
      query.id
    );

    return startBot(
      chatId,
      query.from
    );

  }

  /* WEBSITE */

  if (
    data ===
    "website"
  ) {

    await answerCallback(
      query.id
    );

    return requestCheck(
      chatId,
      userId,
      "website"
    );

  }

  /* PHONE */

  if (
    data ===
    "phone"
  ) {

    await answerCallback(
      query.id
    );

    return requestCheck(
      chatId,
      userId,
      "phone"
    );

  }

  /* BUY */

  if (
    data ===
    "buy"
  ) {

    await answerCallback(
      query.id
    );

    return showPackages(
      chatId
    );

  }

  /* ACCOUNT */

  if (
    data ===
    "account"
  ) {

    await answerCallback(
      query.id
    );

    return showAccount(
      chatId,
      userId
    );

  }

  /* HELP */

  if (
    data ===
    "help"
  ) {

    await answerCallback(
      query.id
    );

    return sendMessage(

      chatId,

      `❓ <b>WEBCheck Help</b>

WEBCheck provides paid risk assessments.

💳 Packages:

GH₵5 → 1 check
GH₵10 → 3 checks
GH₵20 → 7 checks

🌐 Website checks analyze technical indicators.

📱 Phone checks provide responsible assessments based on available information.

⚠️ Reports are assessments, not proof of criminal activity.`

    );

  }

  /* PACKAGE */

  if (
    data.startsWith(
      "package:"
    )
  ) {

    await answerCallback(
      query.id
    );

    const parts =
      data.split(":");

    const amount =
      Number(parts[1]);

    const credits =
      Number(parts[2]);

    const valid =
      (
        amount === 5 &&
        credits === 1
      ) ||
      (
        amount === 10 &&
        credits === 3
      ) ||
      (
        amount === 20 &&
        credits === 7
      );

    if (!valid) {

      return sendMessage(
        chatId,
        "❌ Invalid package."
      );

    }

    return createPayment(
      chatId,
      userId,
      amount,
      credits
    );

  }

  /* CUSTOMER PAID */

  if (
    data.startsWith(
      "paid:"
    )
  ) {

    await answerCallback(
      query.id
    );

    return customerPaid(
      chatId,
      userId,
      data.slice(5)
    );

  }

  /* APPROVE */

  if (
    data.startsWith(
      "approve:"
    )
  ) {

    if (
      !isAdmin(userId)
    ) {

      return answerCallback(
        query.id,
        "Not authorized."
      );

    }

    await answerCallback(
      query.id,
      "Payment approved."
    );

    return approvePayment(
      data.slice(8),
      chatId
    );

  }

  /* REJECT */

  if (
    data.startsWith(
      "reject:"
    )
  ) {

    if (
      !isAdmin(userId)
    ) {

      return answerCallback(
        query.id,
        "Not authorized."
      );

    }

    await answerCallback(
      query.id,
      "Payment rejected."
    );

    return rejectPayment(
      data.slice(7),
      chatId
    );

  }

}

/* =========================================================
   MESSAGE HANDLER
   ========================================================= */

async function handleMessage(
  message
) {

  const chatId =
    message.chat.id;

  const user =
    message.from;

  await registerUser(
    user
  );

  const text =
    (
      message.text ||
      ""
    ).trim();

  /* START */

  if (
    text ===
    "/start"
  ) {

    return startBot(
      chatId,
      user
    );

  }

  /* HELP */

  if (
    text ===
    "/help"
  ) {

    return sendMessage(

      chatId,

      `❓ <b>WEBCheck Commands</b>

/start
/help
/account

<b>Admin</b>

/admin
/pending
/stats
/users`

    );

  }

  /* ACCOUNT */

  if (
    text ===
    "/account"
  ) {

    return showAccount(
      chatId,
      user.id
    );

  }

  /* ADMIN */

  if (
    text ===
    "/admin"
  ) {

    if (
      !isAdmin(
        user.id
      )
    ) {

      return sendMessage(
        chatId,
        "❌ Admin access denied."
      );

    }

    return adminPanel(
      chatId
    );

  }

  /* PENDING */

  if (
    text ===
    "/pending"
  ) {

    if (
      !isAdmin(
        user.id
      )
    ) {

      return sendMessage(
        chatId,
        "❌ Admin access denied."
      );

    }

    return pendingPayments(
      chatId
    );

  }

  /* STATS */

  if (
    text ===
    "/stats"
  ) {

    if (
      !isAdmin(
        user.id
      )
    ) {

      return sendMessage(
        chatId,
        "❌ Admin access denied."
      );

    }

    return adminStats(
      chatId
    );

  }

  /* USERS */

  if (
    text ===
    "/users"
  ) {

    if (
      !isAdmin(
        user.id
      )
    ) {

      return sendMessage(
        chatId,
        "❌ Admin access denied."
      );

    }

    const users =
      await getUsers();

    return sendMessage(

      chatId,

      `👥 <b>WEBCheck Users</b>

Total:

<b>${Object.keys(users).length}</b>`

    );

  }

  /* CHECK INPUT */

  const users =
    await getUsers();

  const account =
    users[String(user.id)];

  if (
    account &&
    account.pendingType &&
    text
  ) {

    return performCheck(

      chatId,

      user.id,

      text,

      account.pendingType

    );

  }

  /* DEFAULT */

  return sendMessage(

    chatId,

    `Choose what you want to do:`,

    {
      reply_markup:
        mainKeyboard()
    }

  );
}

/* =========================================================
   NETLIFY FUNCTION
   ========================================================= */

export default async function handler(
  request
) {

  try {

    /* HEALTH CHECK */

    if (
      request.method ===
      "GET"
    ) {

      return new Response(
        "WEBCheck is online.",
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/plain"
          }
        }
      );

    }

    /* ONLY POST */

    if (
      request.method !==
      "POST"
    ) {

      return new Response(
        "Method not allowed",
        {
          status: 405
        }
      );

    }

    const update =
      await request.json();

    /* TELEGRAM CALLBACK */

    if (
      update.callback_query
    ) {

      await handleCallback(
        update.callback_query
      );

    }

    /* TELEGRAM MESSAGE */

    if (
      update.message
    ) {

      await handleMessage(
        update.message
      );

    }

    return new Response(

      JSON.stringify({
        ok: true
      }),

      {
        status: 200,

        headers: {
          "Content-Type":
            "application/json"
        }

      }

    );

  } catch (error) {

    console.error(
      "WEBCheck error:",
      error
    );

    return new Response(

      JSON.stringify({
        ok: false,
        error:
          error.message
      }),

      {
        status: 500,

        headers: {
          "Content-Type":
            "application/json"
        }

      }

    );

  }

}
