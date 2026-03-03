import { updateSession } from '@agentbay/db/middleware'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Platform redirect — not ready yet, send to home ──
  if (pathname === '/platform' || pathname.startsWith('/platform/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // ── Public API routes — always accessible (token-authed, not session-authed) ──
  if (pathname.startsWith('/api/v1/')) {
    return updateSession(request as any)
  }

  return updateSession(request as any)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
