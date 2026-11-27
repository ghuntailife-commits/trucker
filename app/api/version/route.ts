// Which build is live, so an open Dispatch screen running an older one can reload itself (George, 2026-11-27).
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
