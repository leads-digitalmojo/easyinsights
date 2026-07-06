import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

// Called by Vercel Cron every 10 minutes.
// Iterates all workspaces with a selldo_api_key and triggers their sync.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snap = await adminDb
      .collection('workspaces')
      .where('selldo_api_key', '!=', '')
      .get();

    const results: any[] = [];

    for (const doc of snap.docs) {
      const ws = doc.data() as any;
      if (!ws.selldo_api_key || !ws.slug) continue;

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://easyinsights-seven.vercel.app';
        const res = await fetch(
          `${baseUrl}/api/workspaces/${ws.slug}/selldo/sync`,
          {
            method: 'POST',
            headers: {
              'x-cron-secret': process.env.CRON_SECRET ?? '',
              'Content-Type': 'application/json',
            },
          }
        );
        const data = await res.json();
        results.push({ slug: ws.slug, ...data });
      } catch (e: any) {
        results.push({ slug: ws.slug, error: e.message });
      }
    }

    return NextResponse.json({ ok: true, workspaces: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
