import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getAdminUser } from '@/lib/supabase/server';
import { sellableServices } from '@/lib/services/queries';
export async function GET(request: Request) {
  const session = await getAdminUser(); if (!session) return NextResponse.json({error:'Not authorized'},{status:401});
  const channel = new URL(request.url).searchParams.get('channel') === 'invoice' ? 'manual_invoice_enabled' : 'proposal_enabled';
  try { return NextResponse.json({services:await sellableServices(await createSupabaseServerClient(),channel),canOverride:['owner','admin'].includes(session.admin.role)},{headers:{'Cache-Control':'no-store'}}); }
  catch { return NextResponse.json({error:'Service choices are unavailable. Please retry.'},{status:503}); }
}
