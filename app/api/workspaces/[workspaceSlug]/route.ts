import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireWorkspaceMember } from '@/lib/authMiddleware';
import { getWorkspaceBySlug } from '@/lib/getWorkspace';

// Helper to delete collections and subcollections recursively
async function deleteCollection(collectionRef: any, batchSize = 100) {
  const query = collectionRef.limit(batchSize);
  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

async function deleteQueryBatch(query: any, resolve: any, reject: any) {
  try {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
      resolve();
      return;
    }

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on next batch
    process.nextTick(() => {
      deleteQueryBatch(query, resolve, reject);
    });
  } catch (error) {
    reject(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const data = docSnap.data();

    // Strip sensitive tokens before returning to client
    const sanitizedWorkspace = {
      ...data,
      meta_access_token: data.meta_access_token ? '🕵️_encrypted_hidden_token' : '',
      google_ads_developer_token: data.google_ads_developer_token ? '🕵️_encrypted_hidden_token' : '',
      google_ads_refresh_token: data.google_ads_refresh_token ? '🕵️_encrypted_hidden_token' : '',
    };

    return NextResponse.json(sanitizedWorkspace, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching workspace:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { name, slug } = body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    
    if (slug !== undefined) {
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');
      if (cleanSlug && cleanSlug !== params.workspaceSlug) {
        // Verify slug uniqueness
        const duplicateSnap = await adminDb
          .collection('workspaces')
          .where('slug', '==', cleanSlug)
          .limit(1)
          .get();

        if (!duplicateSnap.empty) {
          return NextResponse.json(
            { error: 'Workspace slug is already taken' },
            { status: 400 }
          );
        }
        updates.slug = cleanSlug;
      }
    }

    if (Object.keys(updates).length > 0) {
      await adminDb.collection('workspaces').doc(docSnap.id).update({
        ...updates,
        updated_at: new Date(),
      });
    }

    return NextResponse.json({ success: true, updates }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating workspace:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  try {
    const docSnap = await getWorkspaceBySlug(params.workspaceSlug);
    if (!docSnap) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const auth = await requireWorkspaceMember(request, docSnap.id);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const workspaceId = docSnap.id;

    // 1. Delete all nested leads and conversions subcollections first
    const wsRef = adminDb.collection('workspaces').doc(workspaceId);
    const leadsColl = wsRef.collection('leads');
    const conversionsColl = wsRef.collection('conversions');
    const audiencesColl = wsRef.collection('audiences');

    await deleteCollection(leadsColl);
    await deleteCollection(conversionsColl);
    await deleteCollection(audiencesColl);

    // 2. Delete the workspace document itself
    await wsRef.delete();

    console.log(`[Workspace API] Purged workspace ID: ${workspaceId} completely.`);
    return NextResponse.json({ success: true, message: 'Workspace deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting workspace:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
