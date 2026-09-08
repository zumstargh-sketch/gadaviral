/**
 * Content moderation engine (server-side — never trust client filtering).
 * Layer 1: local wordlists + heuristics (always active).
 * Layer 2 (optional): external AI moderation API when configured.
 */
export type ModerationStatus = 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED';

export interface ModerationResult {
  status: ModerationStatus;
  flags: string[];
  sanitized: string;
}

const PROFANITY = [
  // hard profanity (masked below), English + common Ghanaian English/pidgin
  'fuck', 'fucking', 'motherfucker', 'shit', 'bitch', 'bastard', 'asshole',
  'dick', 'pussy', 'cunt', 'wanker', 'twat', 'bollocks', 'arsehole',
  'kwasiase', 'gyimigyimie', 'awuraa',
];

const HATE = [
  'nigger', 'nigga', 'faggot', 'kike', 'spic', 'chink', 'tranny',
  'gas the', 'kill all', 'race war', 'subhuman',
];

const THREATS = [
  'i will kill you', 'i will beat you', 'we will find you', 'you deserve to die',
  'watch your back', 'i know where you live',
];

const SEXUAL = ['onlyfans', 'escort service', 'hookup for cash', 'sugar daddy wanted', 'nudes for sale'];

const SPAM_LINK_HOSTS = [
  'bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy', 't.co', 'is.gd', 'shorturl.at',
  'adf.ly', 'rebrand.ly', 'tiny.cc',
];

const SPAM_OFFERS = [
  'make $', 'earn $', 'work from home $$$', 'crypto doubling', 'double your money',
  'click this link to win', 'you have won', 'free money now', 'whatsapp me for loans',
  'binary options profit', 'forex signal paid group',
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskWord(word: string): string {
  return word[0] + '*'.repeat(Math.max(1, word.length - 1));
}

function containsAny(text: string, list: string[]): string[] {
  const lower = text.toLowerCase();
  return list.filter((term) => lower.includes(term));
}

function countUrls(text: string): number {
  return (text.match(/https?:\/\/\S+/gi) ?? []).length;
}

function capsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 12) return 0;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length;
}

import { config } from '../config.js';

function localModerate(text: string): ModerationResult {
  const flags: string[] = [];
  let status: ModerationStatus = 'APPROVED';
  let sanitized = text;

  const profanityHits = containsAny(text, PROFANITY);
  const hateHits = containsAny(text, HATE);
  const threatHits = containsAny(text, THREATS);
  const sexualHits = containsAny(text, SEXUAL);
  const spamHits = containsAny(text, SPAM_OFFERS);
  const linkCount = countUrls(text);
  const shortLinks = SPAM_LINK_HOSTS.filter((h) => text.toLowerCase().includes(h));

  if (hateHits.length > 0) flags.push('hate_speech');
  if (threatHits.length > 0) flags.push('threats');
  if (sexualHits.length > 0) flags.push('sexual_content');
  if (profanityHits.length > 0) flags.push('profanity');
  if (spamHits.length > 0) flags.push('spam');
  if (shortLinks.length > 0) flags.push('suspicious_links');
  if (linkCount >= 5) flags.push('link_spam');
  if (capsRatio(text) > 0.7 && text.length > 30) flags.push('shouting');

  const hardBlock = hateHits.length > 0 || threatHits.length > 0 || sexualHits.length > 0;
  const spammy = spamHits.length > 0 || shortLinks.length > 0 || linkCount >= 5;

  if (hardBlock) status = 'REJECTED';
  else if (spammy || flags.length >= 2) status = 'PENDING_REVIEW';

  for (const word of [...profanityHits, ...hateHits]) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(word), 'gi'), maskWord(word));
  }
  return { status, flags, sanitized };
}

/** Async moderation with optional external AI layer. */
export async function moderateText(text: string): Promise<ModerationResult> {
  const local = localModerate(text);
  if (local.status === 'REJECTED' || !config.moderation.apiUrl || text.length === 0) return local;
  try {
    const res = await fetch(config.moderation.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.moderation.apiKey}`,
      },
      body: JSON.stringify({ input: text }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data: any = await res.json();
      const verdict = String(data?.verdict ?? 'APPROVED').toUpperCase();
      if (verdict === 'REJECTED') { local.status = 'REJECTED'; local.flags.push('ai_rejected'); }
      else if (verdict === 'FLAGGED') { local.status = 'PENDING_REVIEW'; local.flags.push('ai_flagged'); }
    }
  } catch {
    // external moderation is best-effort; local decision stands
  }
  return local;
}

/** Synchronous path (seeds/tests) — local wordlists only. */
export function moderateSync(text: string): ModerationResult {
  return localModerate(text);
}

