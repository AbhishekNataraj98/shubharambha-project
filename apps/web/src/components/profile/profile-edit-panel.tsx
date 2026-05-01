'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import ProfileEditForm from '@/components/profile-edit-form'

type PanelCtx = {
  open: boolean
  setOpen: (next: boolean) => void
  toggle: () => void
}

const ProfileEditPanelContext = createContext<PanelCtx | null>(null)

export function ProfileEditPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((prev) => !prev), [])
  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle])
  return <ProfileEditPanelContext.Provider value={value}>{children}</ProfileEditPanelContext.Provider>
}

export function useProfileEditPanel(): PanelCtx {
  const ctx = useContext(ProfileEditPanelContext)
  if (!ctx) throw new Error('ProfileEditPanelProvider is required')
  return ctx
}

type FormProps = Omit<ComponentProps<typeof ProfileEditForm>, 'hideToggleButton' | 'panelOpen' | 'onPanelOpenChange'>

/** Links ProfileEditForm to hero Edit/Cancel pills (matches mobile tab profile). */
export function ProfileEditFormWithPanel(props: FormProps) {
  const { open, setOpen } = useProfileEditPanel()
  return (
    <ProfileEditForm
      {...props}
      hideToggleButton
      panelOpen={open}
      onPanelOpenChange={setOpen}
    />
  )
}
