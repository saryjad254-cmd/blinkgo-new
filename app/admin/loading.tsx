export default function AdminLoading() {
  return (
    <main
      className="min-h-screen bg-bg px-4 py-6 text-text-primary sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading admin workspace"
    >
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="h-8 w-48 rounded-xl bg-surface-2" />
            <div className="h-4 w-64 max-w-[65vw] rounded-lg bg-surface-2" />
          </div>
          <div className="h-11 w-28 rounded-2xl bg-surface-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-3xl border border-border bg-surface" />
          ))}
        </div>
        <div className="h-[28rem] rounded-3xl border border-border bg-surface" />
      </div>
      <span className="sr-only">Loading admin workspace</span>
    </main>
  );
}
