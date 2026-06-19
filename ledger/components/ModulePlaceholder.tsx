export function ModulePlaceholder({
  title,
  description,
  posts,
}: {
  title: string;
  description: string;
  posts?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">Coming soon</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          This module is part of the manager.io-style roadmap and isn&apos;t
          built yet. The double-entry engine underneath already supports it.
        </p>
        {posts ? (
          <p className="mx-auto mt-3 max-w-md text-xs text-slate-400">
            When built, it will post: {posts}
          </p>
        ) : null}
      </div>
    </div>
  );
}
