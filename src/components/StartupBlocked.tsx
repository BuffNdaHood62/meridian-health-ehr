// Shown instead of the clinical UI when a production build refuses to boot.
// Kept in its own module so main.tsx stays side-effect-only (fast refresh).
export function StartupBlocked({ problems }: { problems: string[] }) {
  return (
    <main className="mx-auto mt-24 max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-slate-900">
      <h1 className="text-lg font-bold">Application not started</h1>
      <p className="mt-1 text-sm text-slate-700">
        This build refused to boot, so no clinical screen was rendered. Mock records are never served outside demo
        mode — a mis-configured deployment must not look like a working EHR.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-800">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </main>
  );
}
