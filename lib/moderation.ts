// Lightweight, offline content moderation for chat messages.
//
// Runs on EVERY message (client-side, $0, zero latency) as the always-on
// "objectionable content" filter required by App Store Guideline 1.2.
// Deeper AI moderation (Gemini) runs only on reported content, server-side,
// to stay within the Gemini free tier — see the report-triage edge function.

export type ModerationCategory =
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'self_harm'
  | 'contact_info';

export interface ModerationResult {
  ok: boolean;
  category?: ModerationCategory;
  reason?: string;
}

// Normalize to defeat trivial evasion: lowercase, strip zero-width chars,
// collapse common leet substitutions and repeated chars/separators.
function normalize(input: string): string {
  let s = input.toLowerCase();
  s = s.replace(/[​-‍﻿]/g, ''); // zero-width
  s = s.replace(/[1!|]/g, 'i').replace(/[3]/g, 'e').replace(/[4@]/g, 'a')
       .replace(/[0]/g, 'o').replace(/[5$]/g, 's').replace(/[7]/g, 't');
  s = s.replace(/(.)\1{2,}/g, '$1$1'); // squash 3+ repeats: "fuuuuck" -> "fuuck"->"fuck" handled by word match
  return s;
}

// Hard-blocked terms by category. Kept intentionally compact and high-signal;
// expand over time. Matching is whole-word where it matters to avoid the
// "Scunthorpe problem" (e.g. don't flag "assistant" for "ass").
const RULES: { category: ModerationCategory; reason: string; patterns: RegExp[] }[] = [
  {
    category: 'hate',
    reason: 'Hate speech or slurs are not allowed.',
    patterns: [
      /\bn[ i]?gg(?:er|a)\b/i,
      /\bf[ a]?gg?(?:ot|ots)?\b/i,
      /\bk[ i]?ke\b/i,
      /\bsp[ i]?c\b/i,
      /\bch[ i]?nk\b/i,
      /\btr[ a]?nny\b/i,
      /\bret[ a]?rd(?:ed)?\b/i,
    ],
  },
  {
    category: 'sexual',
    reason: 'Sexual content is not allowed.',
    patterns: [
      /\b(?:nudes?|sext(?:ing)?|horny|p[ o]?rn|blowjob|handjob)\b/i,
      /\b(?:dick pic|send pics?|naked pic)\b/i,
      /\bra?pe\b/i,
      /\bpedo(?:phile)?\b/i,
      /\b(?:cum|jerk off|masturbat)/i,
    ],
  },
  {
    category: 'violence',
    reason: 'Threats or violent content are not allowed.',
    patterns: [
      /\b(?:kill|hurt|stab|shoot|beat)\s+(?:you|u|him|her|them|yourself)\b/i,
      /\bi(?:'?m| am)\s+going to\s+(?:kill|hurt|find)\b/i,
      /\b(?:rape|murder)\s+(?:you|u|them)\b/i,
    ],
  },
  {
    category: 'self_harm',
    reason: 'For your safety this can’t be sent here. If you’re struggling, please reach out to a trusted adult or a crisis line (e.g. dial or text 988 in the US).',
    patterns: [
      /\b(?:kill myself|kms|end my life|suicid)/i,
      /\bi want to die\b/i,
      /\bcut myself\b/i,
    ],
  },
  {
    category: 'contact_info',
    reason: 'For safety, keep the conversation in Mentara — sharing phone numbers or outside accounts isn’t allowed.',
    patterns: [
      // phone numbers (US + loose intl)
      /\b(?:\+?\d[\s.-]?){7,15}\b/,
      // "add/dm/text me on/at <platform>" or bare platform handles
      /\b(?:add|dm|text|message|find|follow)\s+me\s+(?:on|at|@)/i,
      /\b(?:snap(?:chat)?|insta(?:gram)?|whats?app|telegram|discord|kik|tiktok|signal)\b\s*[:@]?\s*[\w.\-]+/i,
      /\bmy\s+(?:number|cell|phone|snap|insta|handle)\s+is\b/i,
    ],
  },
];

/**
 * Screen a chat message before it is sent.
 * Returns { ok:false, reason } if it should be blocked.
 * Meeting links (https://) are allowed — scheduling shares those legitimately.
 */
export function moderateMessage(raw: string): ModerationResult {
  const text = raw ?? '';
  if (!text.trim()) return { ok: true };

  // Allow https links through the phone-number heuristic (zoom ids etc.)
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, ' ');
  const norm = normalize(withoutUrls);

  for (const rule of RULES) {
    for (const re of rule.patterns) {
      if (re.test(withoutUrls) || re.test(norm)) {
        return { ok: false, category: rule.category, reason: rule.reason };
      }
    }
  }
  return { ok: true };
}

export type SanitizeResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Validate and screen ANY free-text field a user can save and that other users
 * may see (names, bios, mentoring style, goals, meeting notes, action items).
 * Trims, enforces a max length, and runs the same always-on moderation as chat.
 *
 * Use this in every lib write helper that persists user-authored text so the
 * "objectionable content" filter (App Store Guideline 1.2) covers the whole app,
 * not just direct messages.
 */
export function sanitizeUserText(
  raw: string | null | undefined,
  maxLen: number,
): SanitizeResult {
  const value = (raw ?? '').trim();
  if (value.length > maxLen) {
    return { ok: false, reason: `Please keep this under ${maxLen.toLocaleString()} characters.` };
  }
  if (value.length === 0) return { ok: true, value };
  const mod = moderateMessage(value);
  if (!mod.ok) {
    return { ok: false, reason: mod.reason ?? 'This text may violate our community guidelines.' };
  }
  return { ok: true, value };
}
