'use client'

import { useState } from 'react'

type PortfolioProject = {
  id: string
  name: string
  city: string
  thumbnail: string | null
  images: string[]
}

type PortfolioGalleryProps = {
  projects: PortfolioProject[]
}

export default function PortfolioGallery({ projects }: PortfolioGalleryProps) {
  const [activeProject, setActiveProject] = useState<PortfolioProject | null>(null)

  if (projects.length === 0) {
    return <p className="text-sm text-gray-500">No completed projects yet.</p>
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => setActiveProject(project)}
            className="overflow-hidden rounded-xl border border-gray-200 text-left"
          >
            <div className="h-24 bg-gray-100">
              {project.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.thumbnail} alt={project.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-gray-500">No photo</div>
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-sm font-medium text-gray-900">{project.name}</p>
              <p className="text-xs text-gray-500">{project.city}</p>
            </div>
          </button>
        ))}
      </div>

      {activeProject ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50 p-4 sm:items-center sm:justify-center">
          <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{activeProject.name}</h3>
              <button
                type="button"
                onClick={() => setActiveProject(null)}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close gallery"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {activeProject.images.length > 0 ? (
                activeProject.images.map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={image} src={image} alt={activeProject.name} className="w-full rounded-lg object-cover" />
                ))
              ) : (
                <p className="text-sm text-gray-500">No photos available.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
