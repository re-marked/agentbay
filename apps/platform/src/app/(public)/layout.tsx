import { PublicSiteHeader } from '@/components/public-site-header'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden">
      <PublicSiteHeader />
      {children}
    </div>
  )
}
