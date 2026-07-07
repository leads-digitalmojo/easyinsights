import { NextResponse } from 'next/server';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

// Debug endpoint — fetches first page from Sell.do and returns raw response (no auth required)
export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const workspace = docSnap.data() as any;
    if (!workspace.selldo_api_key) return NextResponse.json({ error: 'No API key configured' }, { status: 400 });

    const apiKey = workspace.selldo_api_key;

    // Try multiple known Sell.do API endpoint + auth combinations
    const attempts = [
      { url: `https://app.sell.do/api/v2/leads?api_key=${apiKey}&page=1&per_page=5`, headers: { Accept: 'application/json' } },
      { url: `https://app.sell.do/api/v1/leads?api_key=${apiKey}&page=1&per_page=5`, headers: { Accept: 'application/json' } },
      { url: `https://app.sell.do/api/v2/leads?page=1&per_page=5`, headers: { Accept: 'application/json', 'Authorization': `Token token=${apiKey}` } },
      { url: `https://app.sell.do/api/v2/leads?page=1&per_page=5`, headers: { Accept: 'application/json', 'X-Api-Key': apiKey } },
    ];

    const results: any[] = [];

    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, { headers: attempt.headers });
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        results.push({
          url: attempt.url.replace(apiKey, '***KEY***'),
          auth_method: Object.keys(attempt.headers).find(k => k !== 'Accept') ?? 'query_param',
          status: res.status,
          ok: res.ok,
          body_preview: text.slice(0, 800),
          parsed_keys: json ? Object.keys(json) : null,
          lead_count: json?.leads?.length ?? json?.data?.length ?? (Array.isArray(json) ? json.length : 'unknown'),
        });
        if (res.ok) break; // stop at first success
      } catch (e: any) {
        results.push({ url: attempt.url.replace(apiKey, '***KEY***'), error: e.message });
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
