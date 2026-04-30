'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

type TabsProps = {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

function Tabs({ defaultValue, value: controlledValue, onValueChange, className, children }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '')
  const value = controlledValue ?? uncontrolledValue
  const setValue = React.useCallback(
    (nextValue: string) => {
      if (controlledValue === undefined) {
        setUncontrolledValue(nextValue)
      }
      onValueChange?.(nextValue)
    },
    [controlledValue, onValueChange]
  )

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={cn(className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="tablist"
      data-slot="tabs-list"
      className={cn('inline-flex w-full items-center border-b border-gray-200', className)}
      {...props}
    />
  )
}

type TabsTriggerProps = React.ComponentProps<'button'> & {
  value: string
}

function TabsTrigger({ className, value, children, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext)
  if (!context) return null
  const active = context.value === value

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => context.setValue(value)}
      data-state={active ? 'active' : 'inactive'}
      className={cn(
        'relative flex-1 pb-2 text-sm font-medium transition-colors',
        active ? 'text-[#D85A30]' : 'text-gray-500',
        className
      )}
      {...props}
    >
      {children}
      {active ? <span className="absolute right-3 bottom-0 left-3 h-0.5 rounded-full bg-[#D85A30]" /> : null}
    </button>
  )
}

type TabsContentProps = React.ComponentProps<'div'> & {
  value: string
}

function TabsContent({ className, value, children, ...props }: TabsContentProps) {
  const context = React.useContext(TabsContext)
  if (!context || context.value !== value) return null

  return (
    <div role="tabpanel" data-slot="tabs-content" className={cn('outline-none', className)} {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
