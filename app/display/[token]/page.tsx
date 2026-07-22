/**
 * Public token URL for TV displays (Module 2), exempt from auth by middleware
 * — the unguessable token is the credential. Module 2 resolves the token to a
 * facility schedule; Stage-1 placeholder just proves the route is reachable
 * without auth on any host.
 */
export default function DisplayPage({ params }: { params: { token: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-xs uppercase tracking-[0.3em] text-silver">
        TV display · public token URL
      </p>
      <h1 className="text-5xl font-bold">
        Display<span className="text-gold">.</span>
      </h1>
      <p className="font-mono text-silver">token: {params.token}</p>
    </main>
  );
}
