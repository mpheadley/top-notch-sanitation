
// ─── Form Guard v2 (Nov 20 2026) — plain-JS twin for /api/*.js Vercel functions.
// The leading underscore keeps Vercel from deploying this file as its own route.
// ─────────────────────────────────────────────
// Every public form route (contact, inquiry, tour, subscribe, waitlist, RSVP,
// registration) runs this BEFORE it sends an email, writes a row, or pings anyone.
//
//   1. per-IP rate limit            → 429, visible (a person may have double-clicked)
//   2. honeypot `_gotcha` filled     → silent 200, nothing sent
//   3. junkReason() (gibberish names/messages, dotted-gmail aliases, 1970 dates)
//                                    → silent 200, nothing sent
//   4. email domain: disposable/test → silent 200; typo ("gmial.com") → 400 so a
//      real person can fix it
//   5. hCaptcha verify, only when HCAPTCHA_SECRET_KEY is set AND the route's form
//      sends a widget token (opts.captcha !== false)
//
// Junk always gets a fake success so bots don't learn and retry.
// Env names only: HCAPTCHA_SECRET_KEY (server), NEXT_PUBLIC_HCAPTCHA_SITE_KEY (widget).
// Junk rules match gather/packages/shared/src/junk-registration.ts (keep in sync).
// Canonical copy: heatherflorals/src/lib/form-guard.ts.
// ─────────────────────────────────────────────────────────────────────────────

const ipBuckets = new Map();

export function getClientIp(req) {
  const h = req.headers || {};
  const xff = typeof h.get === "function" ? h.get("x-forwarded-for") : h["x-forwarded-for"];
  return String(xff || "").split(",")[0].trim() || "unknown";
}

export function checkRateLimit(ip, key = "default", max = 5, windowMs = 60_000) {
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const hits = (ipBuckets.get(bucketKey) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  ipBuckets.set(bucketKey, hits);
  return hits.length <= max;
}

/** True when the hidden honeypot field is filled (bots fill every input). */
export function isBot(body){
  const gotcha = body["_gotcha"];
  return typeof gotcha === "string" && gotcha.length > 0;
}

export function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
}

export async function verifyHCaptcha(token){
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return true; // not configured
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json());
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Junk submissions (Nov 2026) ──────────────────────────────────────────────
// Bots fill every field with random mixed-case strings ("VToLyuUmInPPxvoPN"),
// use dotted-gmail aliases ("ik.iduti.3.50@gmail.com") and dates like 1970.
// The honeypot misses them because they skip hidden fields.

function isGibberish(s){
  const n = String(s ?? "").trim();
  if (!n || /\s/.test(n) || n.length < 10) return false;
  if (!/^[A-Za-z]+$/.test(n)) return false;
  if ((n.slice(1).match(/[A-Z]/g) ?? []).length >= 3) return true;
  return !/[aeiouyAEIOUY]/.test(n);
}

function isDottedGmailAlias(email){
  const e = String(email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain !== "gmail.com" && domain !== "googlemail.com") return false;
  const dots = (local.match(/\./g) ?? []).length;
  return dots >= 3 || (dots === 2 && /(^|\.)[a-z0-9]\./.test(local));
}

/** Returns a reason when the submission looks like a bot, else null. */
export function junkReason(body){
  const nameFields = ["name", "firstName", "first_name", "lastName", "last_name", "partnerName", "partner_name", "fullName", "full_name"];
  if (nameFields.some((k) => isGibberish(body[k]))) return "gibberish name";
  const textFields = ["message", "notes", "details", "tourTimes", "vision", "comments", "subject", "question"];
  if (textFields.some((k) => isGibberish(body[k]))) return "gibberish message";
  if (isDottedGmailAlias(body["email"])) return "dotted gmail alias";
  const date = String(body["date"] ?? body["eventDate"] ?? body["weddingDate"] ?? body["event_date"] ?? body["wedding_date"] ?? "");
  const y = /^(\d{4})-/.exec(date)?.[1];
  if (y && Number(y) < 2000) return "impossible date";
  return null;
}

// ── Email domain checks ──────────────────────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "grr.la",
  "10minutemail.com", "temp-mail.org", "tempmail.com", "tempmail.net", "tempail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "nada.email", "dispostable.com",
  "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mohmal.com", "emailondeck.com",
  "mintemail.com", "spamgourmet.com", "burnermail.io", "moakt.com", "inboxkitten.com",
  "mailnesia.com", "mailcatch.com", "tmpmail.org", "tmail.ws", "spam4.me",
  // test-only domains seen in bot runs (same list as junk-registration.ts)
  "example.com", "test.com", "sagemindai.io", "ioud.co", "xwf.google.com",
]);

const TYPO_DOMAINS = new Set([
  "gamil.com", "gmial.com", "gmai.com", "gmil.com", "gnail.com", "gmail.co", "gmail.con", "gmaill.com",
  "yahooo.com", "yaho.com", "yahoo.co", "yahoo.con", "hotmial.com", "hotmail.co", "hotmail.con",
  "outlok.com", "outloo.com", "outlook.co", "outlook.con", "iclod.com", "icloud.co", "icloud.con",
]);

/** "disposable" (silent drop), "typo" (ask the person to fix it), or null. */
export function emailDomainProblem(email){
  const e = String(email ?? "").trim().toLowerCase();
  const domain = e.slice(e.lastIndexOf("@") + 1);
  if (!domain || !e.includes("@")) return null;
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";
  if (TYPO_DOMAINS.has(domain)) return "typo";
  return null;
}

// ── The guard ────────────────────────────────────────────────────────────────
// opts: { key, rateMax, windowMs, captcha } — captcha:false for a form with no widget yet.

export async function guardForm(
  req,
  body,
  opts = {}
){
  const key = opts.key ?? "form";
  const ip = getClientIp(req);

  // 1. Rate limit
  if (!checkRateLimit(ip, key, opts.rateMax ?? 5, opts.windowMs ?? 60_000)) {
    return { ok: false, status: 429, error: "Too many requests. Please wait a minute and try again." };
  }

  // 2. Honeypot: silent
  if (isBot(body)) {
    console.warn(`[form-guard] honeypot on ${key}`);
    return { ok: false, status: 200, error: "", silent: true, reason: "honeypot" };
  }

  // 3. Junk content: silent
  const junk = junkReason(body);
  if (junk) {
    console.warn(`[form-guard] blocked junk (${junk}) on ${key}`);
    return { ok: false, status: 200, error: "", silent: true, reason: junk };
  }

  // 4. Email domain
  const dom = emailDomainProblem(body["email"]);
  if (dom === "disposable") {
    console.warn(`[form-guard] disposable email domain on ${key}`);
    return { ok: false, status: 200, error: "", silent: true, reason: "disposable email" };
  }
  if (dom === "typo") {
    return { ok: false, status: 400, error: "That email address looks mistyped. Please check it and try again." };
  }

  // 5. hCaptcha
  if (opts.captcha !== false && process.env.HCAPTCHA_SECRET_KEY) {
    const token = body["h-captcha-response"];
    if (typeof token !== "string" || !token) {
      return { ok: false, status: 400, error: "Please complete the security check." };
    }
    if (!(await verifyHCaptcha(token))) {
      return { ok: false, status: 400, error: "Security check failed. Please try again." };
    }
  }

  return { ok: true };
}

/** Send the response for a blocked submission (Vercel Node res). Silent → fake 200. */
export function sendBlocked(res, guard, okBody = { ok: true, success: true }) {
  if (guard.silent) return res.status(200).json(okBody);
  return res.status(guard.status).json({ error: guard.error });
}
