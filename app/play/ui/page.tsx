'use client';

import { useState } from 'react';
import { resolveBrand, brandCssVars } from '@ai/foundation';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Select,
  Badge,
  Tabs,
  Modal,
  ToastProvider,
  useToast,
  TopNav,
  WeekGridShell,
  DayColumnShell,
  GanttShell,
} from '@/components/ui';

/**
 * UI-kit gallery (Stage-8 verification). Renders every component; the brand
 * switcher re-themes the whole page via --accent to prove the kit is brand-
 * aware. Becomes living documentation for the modules that build on it.
 */
export default function UiGallery({ searchParams }: { searchParams: { brand?: string } }) {
  const brand = resolveBrand(searchParams.brand);
  const vars = brandCssVars(brand) as React.CSSProperties;

  return (
    <ToastProvider>
      <div style={vars}>
        <TopNav
          brandName={brand.name}
          tabs={[
            { label: 'Programs', href: '#', active: true },
            { label: 'Rentals', href: '#' },
            { label: 'Schedule', href: '#' },
            { label: 'Camps', href: '#' },
          ]}
          right={<Button size="sm">Sign in</Button>}
        />

        <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
          <header className="flex flex-col gap-2">
            <p className="label text-[11px]">Module 0 · Stage 8 · UI kit</p>
            <h1 className="text-5xl">Components<span style={{ color: 'var(--accent)' }}>.</span></h1>
            <p className="text-body">
              Themed to <span className="mono" style={{ color: 'var(--accent)' }}>{brand.name}</span>.
              Append <code className="mono">?brand=bears</code> etc. to re-theme.
            </p>
          </header>

          <Section title="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button size="sm">Small</Button>
              <Badge>tag</Badge>
              <Badge tone="pos">active</Badge>
              <Badge tone="neg">overdue</Badge>
            </div>
          </Section>

          <Section title="Form">
            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <Field label="Full name" hint="As it appears on ID">
                <Input placeholder="Jordan Smith" />
              </Field>
              <Field label="Program">
                <Select>
                  <option>U14 Skills</option>
                  <option>Summer Camp</option>
                </Select>
              </Field>
              <Field label="Email" error="Enter a valid email">
                <Input placeholder="you@example.ca" />
              </Field>
            </div>
          </Section>

          <Section title="Interactive">
            <InteractiveDemo />
          </Section>

          <Section title="Tabs">
            <Tabs
              items={[
                { key: 'a', label: 'Overview', content: <p className="text-body">Overview panel.</p> },
                { key: 'b', label: 'Roster', content: <p className="text-body">Roster panel.</p> },
                { key: 'c', label: 'Schedule', content: <p className="text-body">Schedule panel.</p> },
              ]}
            />
          </Section>

          <Section title="Card + table">
            <Card>
              <CardHeader>
                <h3 className="text-lg">Registrations</h3>
                <Badge>3</Badge>
              </CardHeader>
              <CardBody>
                <table className="data-table">
                  <thead>
                    <tr><th>Athlete</th><th>Program</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    <tr className="clickable"><td>A. Smith</td><td>U14 Skills</td><td><Badge tone="pos">Paid</Badge></td></tr>
                    <tr className="clickable"><td>B. Jones</td><td>Summer Camp</td><td><Badge tone="neg">Owing</Badge></td></tr>
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </Section>

          <Section title="Schedule shells (Modules 2 / 6)">
            <div className="flex flex-col gap-6">
              <GanttShell
                rows={[
                  { label: 'Court 1', bars: [{ start: 0.05, end: 0.3, label: 'U14' }, { start: 0.4, end: 0.7, label: 'Rental' }] },
                  { label: 'Court 2', bars: [{ start: 0.2, end: 0.55, label: 'Camp' }] },
                  { label: 'Turf', bars: [{ start: 0.6, end: 0.95, label: 'League' }] },
                ]}
              />
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <WeekGridShell />
                <DayColumnShell label="Court 1 · Mon" />
              </div>
            </div>
          </Section>
        </main>
      </div>
    </ToastProvider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="label text-[11px]">{title}</h2>
      {children}
    </section>
  );
}

function InteractiveDemo() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Button variant="ghost" onClick={() => toast('Saved to your account.', 'pos')}>Toast success</Button>
      <Button variant="ghost" onClick={() => toast('Payment failed.', 'neg')}>Toast error</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm registration"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { setOpen(false); toast('Registered!', 'pos'); }}>Confirm</Button>
          </>
        }
      >
        <p className="text-body">This is a hard-cornered modal themed by the active brand accent.</p>
      </Modal>
    </div>
  );
}
