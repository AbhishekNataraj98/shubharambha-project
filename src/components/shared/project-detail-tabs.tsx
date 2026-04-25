'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BottomNav from '@/components/shared/bottom-nav'
import ProjectChat from '@/components/chat/ProjectChat'
import UpdatesFeed from '@/components/updates/UpdatesFeed'
import PaymentPanel from '@/components/payments/PaymentPanel'

type ProjectDetailTabsProps = {
  projectId: string
  currentUserId: string
  currentUserName: string
  currentUserRole: string
  contractorName: string
  contractorId: string | null
  customerId: string
}

export default function ProjectDetailTabs({
  projectId,
  currentUserId,
  currentUserName,
  currentUserRole,
  contractorName,
  contractorId,
  customerId,
}: ProjectDetailTabsProps) {
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab =
    requestedTab === 'updates' || requestedTab === 'payments' || requestedTab === 'chat'
      ? requestedTab
      : 'updates'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)

  return (
    <>
      <div className="mx-4 mt-3">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          defaultValue="updates"
          className="flex h-[68vh] min-h-[460px] flex-col"
        >
          <TabsList className="shrink-0 bg-[#FAFAFA]">
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

          <TabsContent value="updates" className="mt-3 min-h-0 flex-1">
            <div className="h-full overflow-y-auto pr-1 pb-24">
              <UpdatesFeed
                projectId={projectId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                contractorName={contractorName}
              />
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-3 min-h-0 flex-1">
            <div className="h-full overflow-y-auto pb-24 pr-1">
              <PaymentPanel
                projectId={projectId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole as 'customer' | 'contractor' | 'worker'}
                contractorId={contractorId}
                customerId={customerId}
              />
            </div>
          </TabsContent>

          <TabsContent value="chat" className="mt-3 min-h-0 flex-1">
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
