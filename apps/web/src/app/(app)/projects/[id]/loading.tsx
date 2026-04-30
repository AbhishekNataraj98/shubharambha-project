export default function ProjectDetailLoading() {
  return (
    <div className="min-h-screen bg-[#F2EDE8] pb-24">
      <div className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <div className="mx-4 mt-4 h-36 animate-pulse rounded-xl bg-gray-100" />
        <div className="mx-4 mt-3 h-24 animate-pulse rounded-xl bg-gray-100" />
        <div className="mx-4 mt-3 h-10 animate-pulse rounded-xl bg-gray-100" />
        <div className="mx-4 mt-3 space-y-3">
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    </div>
  )
}
