'use client';

import { useState } from 'react';

/**
 * The public forms (ALL CAN §4.2–4.11): interest ("notify me when registration
 * opens"), request a location / host a program, a training request and the
 * confidential assistance request. Posts to /api/site/lead, which stores the
 * exact consent wording (CASL). Never labelled as registration; never holds
 * a spot.
 */
export type LeadVariant = 'interest' | 'location' | 'training' | 'assistance' | 'contact';

export interface LeadFormProps {
  brandKey: string;
  variant: LeadVariant;
  context?: string;
  programOptions?: string[];
  sportOptions?: string[];
  initialSport?: string;
  initialMode?: 'request' | 'host';
  heading?: string;
  note?: string;
  siteName: string;
}

export default function LeadForm(p: LeadFormProps) {
  const [mode, setMode] = useState<'request' | 'host'>(p.initialMode ?? 'request');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const id = `lf-${p.variant}-${(p.context ?? 'x').replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const fields: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && !['email', 'name', 'phone', 'consent'].includes(k)) fields[k] = v;
    const consentText = form.querySelector<HTMLElement>('[data-consent-text]')?.textContent ?? '';
    const kind = p.variant === 'interest' ? 'interest' : p.variant === 'location' ? (mode === 'host' ? 'host' : 'request') : p.variant === 'assistance' ? 'assistance' : 'contact';
    setState('busy');
    try {
      const res = await fetch('/api/site/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandKey: p.brandKey, kind, email: fd.get('email'), name: fd.get('name'), phone: fd.get('phone'), fields: { ...fields, context: p.context ?? '' }, consent: fd.get('consent') === 'on', consentText, sourcePath: window.location.pathname }) });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) { setState('done'); setMsg(p.variant === 'interest' ? "You're on the list. We'll email you the moment registration opens." : p.variant === 'assistance' ? 'Sent. Only the reviewer sees this.' : 'Sent. We\'ll be in touch.'); }
      else { setState('error'); setMsg(json.error ?? 'Something went wrong.'); }
    } catch {
      setState('error'); setMsg('Something went wrong. Please try again.');
    }
  }

  if (state === 'done') return <p className="done">{msg}</p>;

  const consent = p.variant === 'interest'
    ? `Email me about ${p.context ?? p.siteName} registration and launch updates. I can unsubscribe at any time.`
    : p.variant === 'assistance' ? `${p.siteName} may contact me about this request.` : `${p.siteName} may email or call me about this ${p.variant === 'location' ? (mode === 'host' ? 'hosting enquiry' : 'request') : 'request'}.`;

  return (
    <form className="form" onSubmit={submit} noValidate>
      {p.heading && <h3>{p.heading}</h3>}
      {p.variant === 'interest' && <p className="note">Registration isn&apos;t open yet. Leave your details and we&apos;ll email you when it opens. This doesn&apos;t hold a spot.</p>}
      {p.variant === 'location' && (
        <fieldset className="rq-switch">
          <legend className="sr">I am</legend>
          <label><input type="radio" name="mode" value="request" checked={mode === 'request'} onChange={() => setMode('request')} /><span>Request ALL CAN near me</span></label>
          <label><input type="radio" name="mode" value="host" checked={mode === 'host'} onChange={() => setMode('host')} /><span>Host a program</span></label>
        </fieldset>
      )}
      {p.variant === 'location' && (
        <>
          {mode === 'host' && <label className="field" htmlFor={`${id}-org`}><span>Organization</span><input id={`${id}-org`} name="organization" required /></label>}
          {mode === 'host' && <label className="field" htmlFor={`${id}-role`}><span>Your role</span><input id={`${id}-role`} name="role" /></label>}
          <label className="field" htmlFor={`${id}-area`}><span>{mode === 'host' ? 'Facility address' : 'Area or city'}</span><input id={`${id}-area`} name={mode === 'host' ? 'facility_address' : 'area'} required placeholder={mode === 'host' ? '' : 'e.g. Toronto West'} /></label>
          {mode === 'host' && <label className="field" htmlFor={`${id}-ft`}><span>Facility type</span><select id={`${id}-ft`} name="facility_type"><option>School gym</option><option>Community centre</option><option>Private facility</option><option>Outdoor field</option></select></label>}
          {mode === 'host' && <label className="field" htmlFor={`${id}-courts`}><span>Courts or fields available</span><input id={`${id}-courts`} name="courts" /></label>}
          {mode === 'host' && <label className="field" htmlFor={`${id}-when`}><span>When the space is available</span><input id={`${id}-when`} name="availability" placeholder="e.g. weeknights after 6, Saturday mornings" /></label>}
          <label className="field" htmlFor={`${id}-sport`}><span>Sport</span><select id={`${id}-sport`} name="sport" defaultValue={p.initialSport ?? ''}>{(p.sportOptions ?? ['Basketball', 'Volleyball', 'Soccer', 'Flag Football']).map((s) => <option key={s} value={s.toLowerCase().replace(/\s+/g, '-')}>{s}</option>)}<option value="several">More than one</option></select></label>
        </>
      )}
      {p.variant === 'training' && (
        <>
          <label className="field" htmlFor={`${id}-fmt`}><span>Format</span><select id={`${id}-fmt`} name="format"><option>1:1</option><option>Partner (2)</option><option>Small group (3–4)</option></select></label>
          <label className="field" htmlFor={`${id}-goals`}><span>Goals</span><textarea id={`${id}-goals`} name="goals" /></label>
        </>
      )}
      {p.variant === 'assistance' && (
        <>
          <label className="field" htmlFor={`${id}-prog`}><span>Program</span><select id={`${id}-prog`} name="program">{(p.programOptions ?? []).map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="field" htmlFor={`${id}-note`}><span>Anything we should know (optional)</span><textarea id={`${id}-note`} name="note" /></label>
        </>
      )}
      {p.variant === 'contact' && <label className="field" htmlFor={`${id}-msg`}><span>Message</span><textarea id={`${id}-msg`} name="message" required /></label>}
      {p.variant !== 'interest' && <label className="field" htmlFor={`${id}-name`}><span>{p.variant === 'assistance' ? 'Parent or guardian name' : 'Name'}</span><input id={`${id}-name`} name="name" autoComplete="name" required /></label>}
      <label className="field" htmlFor={`${id}-email`}><span>{p.variant === 'interest' || p.variant === 'assistance' ? 'Parent or guardian email' : 'Email'}</span><input id={`${id}-email`} name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></label>
      {p.variant === 'interest' && (
        <label className="field" htmlFor={`${id}-age`}><span>Child&apos;s age group</span><select id={`${id}-age`} name="age_group"><option>Under 8</option><option>8–10</option><option>11–13</option><option>14–17</option><option>Adult</option></select></label>
      )}
      {(p.variant === 'location' && mode === 'host') || p.variant === 'training' ? <label className="field" htmlFor={`${id}-phone`}><span>Phone (optional)</span><input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" /></label> : null}
      <label className="check" htmlFor={`${id}-ok`}><input id={`${id}-ok`} name="consent" type="checkbox" required /><span data-consent-text>{consent}</span> <a href="/privacy-policy">Privacy policy</a></label>
      <div><button className={`pill ${p.variant === 'interest' ? 'pill--red' : 'pill--ink'}`} type="submit" disabled={state === 'busy'}>{p.variant === 'interest' ? 'Notify me' : p.variant === 'location' ? (mode === 'host' ? 'Send hosting enquiry' : 'Send request') : p.variant === 'assistance' ? 'Send request' : 'Send'}</button></div>
      {p.note && <p className="note">{p.note}</p>}
      {state === 'error' && <p className="note" role="alert">{msg}</p>}
    </form>
  );
}
