import { NextRequest, NextResponse } from 'next/server';
import { ask } from '@/lib/site/ask';

export const dynamic = 'force-dynamic';

/**
 * Ask <Brand> (Module 23 §3.4). Public, rate-keyed by IP. Answers only from
 * the site's own published content; anything else hands off to the contact
 * email, never a guess.
 */
export async function POST(req: NextRequest) {
  let body: { brandKey?: string; question?: string } = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  const brandKey = String(body.brandKey ?? '').trim();
  const question = String(body.question ?? '').trim().slice(0, 500);
  if (!brandKey || question.length < 3) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anon';
  const result = await ask(brandKey, question, ip);
  return NextResponse.json(result);
}
