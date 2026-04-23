'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Camera, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BottomNav from '@/components/shared/bottom-nav'
import ProjectChat from '@/components/chat/ProjectChat'

type UpdateItem = {
  id: string
  postedByName: string
  postedByInitials: string
  description: string
  stageTag: string
  createdAt: string
  photoUrls: string[]
}

type PaymentItem = {
  id: string
  amount: number
  paymentMode: string
  paidToCategory: string
  description: string
  status: string
  paidToName: string
}

type ProjectDetailTabsProps = {
  projectId: string
  currentUserId: string
  currentUserName: string
  contractorId: string | null
  isContractor: boolean
  totalConfirmed: number
  pendingCount: number
  confirmedCount: number
  updates: UpdateItem[]
  payments: PaymentItem[]
}

function relativeTime(dateValue: string) {
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffMinutes = Math.max(1, Math.floor((now - then) / (1000 * 60)))
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function paymentColor(category: string) {
  const normalized = category.toLowerCase()
  if (normalized.includes('labour')) return 'bg-blue-100 text-blue-700'
  if (normalized.includes('material')) return 'bg-green-100 text-green-700'
  return 'bg-orange-100 text-orange-700'
}

function statusDotClass(status: string) {
  return status === 'confirmed' ? 'bg-green-500' : 'bg-amber-500'
}

export default function ProjectDetailTabs({
  projectId,
  currentUserId,
  currentUserName,
  contractorId,
  isContractor,
  totalConfirmed,
  pendingCount,
  confirmedCount,
  updates,
  payments,
}: ProjectDetailTabsProps) {
  const [activeTab, setActiveTab] = useState('updates')
  const [chatUnreadCount, setChatUnreadCount] = useState(0)

  return (
    <>
      <div className="mx-4 mt-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="updates">
          <TabsList>
            <TabsTrigger value="updates">Updates</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="chat">
              <span className="inline-flex items-center gap-1">
                <span>Chat</span>
                {chatUnreadCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold text-white">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                ) : null}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="updates" className="mt-3 space-y-3">
            {updates.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-6 text-center">
                <Camera className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-2 text-base font-semibold text-gray-900">No updates yet</h3>
                <p className="mt-1 text-sm text-gray-500">Contractor will post daily progress here</p>
              </div>
            ) : (
              updates.map((update) => (
                <div key={update.id} className="rounded-xl border border-gray-100 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-[#E8590C]">
                        {update.postedByInitials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{update.postedByName}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">{relativeTime(update.createdAt)}</p>
                  </div>
                  <span className="mt-2 inline-flex rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-600">
                    {update.stageTag}
                  </span>
                  <p className="mt-2 text-sm leading-relaxed text-gray-700">{update.description}</p>
                  {update.photoUrls.length > 0 ? (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {update.photoUrls.map((url, idx) => (
                        <div key={`${update.id}-${idx}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Update photo" className="h-full w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {isContractor && contractorId === currentUserId ? (
              <Link
                href={`/projects/${projectId}/updates/new`}
                className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8590C] text-white shadow-lg"
                aria-label="Add update"
              >
                <Plus className="h-6 w-6" />
              </Link>
            ) : null}
          </TabsContent>

          <TabsContent value="payments" className="mt-3 space-y-3">
            <div className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 p-4 text-white">
              <p className="text-xs text-orange-100">Total Paid</p>
              <p className="mt-1 text-2xl font-bold">
                ₹{new Intl.NumberFormat('en-IN').format(totalConfirmed)}
              </p>
              <div className="mt-3 flex gap-4 text-xs text-orange-100">
                <span>Confirmed: {confirmedCount}</span>
                <span>Pending: {pendingCount}</span>
              </div>
            </div>

            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${paymentColor(payment.paidToCategory)}`}
                  >
                    {payment.paidToCategory[0]?.toUpperCase() ?? 'P'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{payment.description}</p>
                    <p className="text-xs text-gray-500">
                      {payment.paidToName} · {payment.paymentMode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      ₹{new Intl.NumberFormat('en-IN').format(payment.amount)}
                    </p>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                      <span className={`h-2 w-2 rounded-full ${statusDotClass(payment.status)}`} />
                      <span>{payment.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {isContractor && contractorId === currentUserId ? (
              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-[#E8590C] px-4 py-2.5 text-sm font-semibold text-[#E8590C]"
              >
                Log Payment
              </button>
            ) : null}
          </TabsContent>

          <TabsContent value="chat" className="mt-3 pb-24">
            <ProjectChat
              projectId={projectId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              active={activeTab === 'chat'}
              onUnreadCountChange={setChatUnreadCount}
            />
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </>
  )
}
