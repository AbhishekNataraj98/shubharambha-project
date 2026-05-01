'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BottomNav from '@/components/shared/bottom-nav'
import ProjectChat from '@/components/chat/ProjectChat'
import UpdatesFeed from '@/components/updates/UpdatesFeed'
import PaymentPanel from '@/components/payments/PaymentPanel'
import ProjectReports from '@/components/reports/ProjectReports'

type ProjectDetailTabsProps = {
  projectId: string
  currentUserId: string
  currentUserName: string
  currentUserRole: string
  contractorName: string
  contractorId: string | null
  customerId: string
  hideReportsTab?: boolean
}

export default function ProjectDetailTabs({
  projectId,
  currentUserId,
  currentUserName,
  currentUserRole,
  contractorName,
  contractorId,
  customerId,
  hideReportsTab = false,
}: ProjectDetailTabsProps) {
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab =
    requestedTab === 'updates' ||
    requestedTab === 'payments' ||
    requestedTab === 'chat' ||
    (!hideReportsTab && requestedTab === 'reports')
      ? requestedTab
      : 'updates'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)

  return (
    <>
      <div className="mx-4 mt-1.5 bg-[#F2EDE8]">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          defaultValue="updates"
          className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden"
        >
          <TabsList
            className="sticky top-0 z-10 h-auto shrink-0 gap-0 rounded-none border-b border-[#E8DDD4] bg-white p-0"
          >
            <TabsTrigger
              value="updates"
              className="flex-1 flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2.5 text-[#A8A29E] data-[state=active]:border-[#D85A30] data-[state=active]:text-[#D85A30]"
            >
              <span className="text-sm">📸</span>
              <span className="text-[9px] font-semibold">Updates</span>
            </TabsTrigger>
            <TabsTrigger
              value="payments"
              className="flex-1 flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2.5 text-[#A8A29E] data-[state=active]:border-[#D85A30] data-[state=active]:text-[#D85A30]"
            >
              <span className="text-sm">💰</span>
              <span className="text-[9px] font-semibold">Payments</span>
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="flex-1 flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2.5 text-[#A8A29E] data-[state=active]:border-[#D85A30] data-[state=active]:text-[#D85A30]"
            >
              <span className="inline-flex flex-col items-center gap-0.5">
                <span className="text-sm">💬</span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-[9px] font-semibold">Chat</span>
                {chatUnreadCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold text-white">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                ) : null}
                </span>
              </span>
            </TabsTrigger>
            {!hideReportsTab ? (
              <TabsTrigger
                value="reports"
                className="flex-1 flex-col items-center gap-0.5 rounded-none border-b-2 border-transparent py-2.5 text-[#A8A29E] data-[state=active]:border-[#D85A30] data-[state=active]:text-[#D85A30]"
              >
                <span className="text-sm">📊</span>
                <span className="text-[9px] font-semibold">Reports</span>
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="updates" className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 pb-24">
              <UpdatesFeed
                projectId={projectId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                contractorName={contractorName}
              />
          </TabsContent>

          <TabsContent value="payments" className="mt-2 min-h-0 flex-1 overflow-y-auto pb-24 pr-1">
              <PaymentPanel
                projectId={projectId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole as 'customer' | 'contractor' | 'worker'}
                contractorId={contractorId}
                customerId={customerId}
              />
          </TabsContent>

          <TabsContent value="chat" className="mt-2 min-h-0 flex-1">
            <ProjectChat
              projectId={projectId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              active={activeTab === 'chat'}
              onUnreadCountChange={setChatUnreadCount}
            />
          </TabsContent>
          {!hideReportsTab ? (
            <TabsContent value="reports" className="mt-2 min-h-0 flex-1 overflow-y-auto pb-24 pr-1">
              <ProjectReports projectId={projectId} currentUserRole={currentUserRole} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      <BottomNav />
    </>
  )
}
