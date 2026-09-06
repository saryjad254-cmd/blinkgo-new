export default function AdminOrderDetailLoading() {
  return (
    <main
      className="min-h-screen bg-bg px-4 py-6 text-text-primary sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading order details"
    >
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-11 w-44 rounded-2xl bg-surface-2" />
        <div className="space-y-3">
          <div className="h-8 w-3/5 max-w-md rounded-xl bg-surface-2" />
          <div className="h-4 w-2/5 max-w-xs rounded-lg bg-surface-2" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2">
            <div className="h-48 rounded-3xl border border-border bg-surface" />
            <div className="h-72 rounded-3xl border border-border bg-surface" />
          </section>
          <aside className="space-y-4">
            <div className="h-52 rounded-3xl border border-border bg-surface" />
            <div className="h-64 rounded-3xl border border-border bg-surface" />
          </aside>
        </div>
      </div>
      <span className="sr-only">Loading order details</span>
    </main>
  );
}
