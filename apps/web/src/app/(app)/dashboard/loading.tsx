export default function DashboardLoading() {
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F2EDE8' }}>
      <div className="mx-auto w-full max-w-md px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="h-9 w-36 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
        </div>

        <div className="mt-6 space-y-3">
          <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-orange-100" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
        </div>

        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-6 w-28 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-24 animate-pulse rounded-lg bg-orange-100" />
          </div>

          <div className="space-y-3">
            <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  )
}
