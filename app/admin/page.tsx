/**
 * admin.athleteinstitute.ca — staff backend root.
 * Stage-1 placeholder proving host→tree routing. Stage 2 + Module 1 add the
 * hard staff-only gate (non-staff redirect to play.*).
 */
export default function AdminHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-silver">
        admin.athleteinstitute.ca
      </p>
      <h1 className="text-4xl font-bold">
        Staff backend<span className="text-gold">.</span>
      </h1>
      <p className="text-silver">
        Staff-only admin. Access gate lands in Stage 2 (auth) + Module 1
        (roles). Module 0 · Stage 1 skeleton.
      </p>
    </main>
  );
}
