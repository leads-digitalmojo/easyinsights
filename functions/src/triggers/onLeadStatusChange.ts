import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendMetaEvent } from '../../../lib/meta';
import { sendGoogleEvent } from '../../../lib/google';
import { syncLeadToAudiences } from '../../../lib/audienceSync';

const STATUS_MAP: Record<string, string> = {
  new: 'EI_New',
  junk: 'EI_Junk',
  failed: 'EI_Failed',
  interested: 'EI_Interested',
  in_call_center: 'EI_InCallCenter',
  visit_done: 'EI_Visit_Done',
  final_negotiation: 'EI_Final_negotiation',
  claimed: 'EI_Claimed',
};

/**
 * Cloud Function triggered on lead document changes in Firestore.
 * Detects status changes, fires CAPI and Google Ads upload clicks,
 * records event history logs, updates workspace conversion velocity counters,
 * and synchronizes user custom audience listings dynamically.
 */
export const onLeadStatusChange = functions.firestore
  .document('workspaces/{workspaceId}/leads/{leadId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (!beforeData || !afterData) return null;

    const beforeStatus = beforeData.lead_status;
    const afterStatus = afterData.lead_status;

    // 1. If lead status is unchanged, skip execution
    if (beforeStatus === afterStatus) {
      console.log(`[Cloud Function] Lead ${context.params.leadId} status unchanged (${afterStatus}). Skipping.`);
      return null;
    }

    const { workspaceId, leadId } = context.params;
    console.log(`[Cloud Function] Lead status change detected for Lead ${leadId} in Workspace ${workspaceId}: ${beforeStatus} -> ${afterStatus}`);

    try {
      const db = admin.firestore();

      // 2. Fetch parent workspace credentials
      const workspaceRef = db.collection('workspaces').doc(workspaceId);
      const workspaceSnap = await workspaceRef.get();

      if (!workspaceSnap.exists) {
        console.error(`[Cloud Function] Parent workspace ID ${workspaceId} not found.`);
        return null;
      }

      const workspace = workspaceSnap.data() as any;

      // 3. Map status to custom EI conversion event name
      const eventName = STATUS_MAP[afterStatus.toLowerCase()];
      if (!eventName) {
        console.log(`[Cloud Function] No event mapped in STATUS_MAP for status "${afterStatus}".`);
        return null;
      }

      console.log(`[Cloud Function] Triggering conversions for mapped signal event: "${eventName}"`);

      // 4. Trigger Meta CAPI and Google Ads click uploads
      const metaResult = await sendMetaEvent(workspace, afterData as any, eventName);
      const googleResult = await sendGoogleEvent(workspace, afterData as any, eventName);

      // 5. Update Lead document status history registry and fired indicators
      const historyItem = {
        status: afterStatus,
        ei_event: eventName,
        fired_at: Date.now(),
        meta_success: metaResult.success,
        google_success: googleResult.success,
      };

      await change.after.ref.update({
        meta_event_fired: metaResult.success ? eventName : (afterData.meta_event_fired || ''),
        google_event_fired: googleResult.success ? eventName : (afterData.google_event_fired || ''),
        last_fired_at: admin.firestore.FieldValue.serverTimestamp(),
        status_history: admin.firestore.FieldValue.arrayUnion(historyItem),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 6. Increment global Workspace conversion counter log
      const convQuery = await workspaceRef
        .collection('conversions')
        .where('event_name', '==', eventName)
        .limit(1)
        .get();

      if (!convQuery.empty) {
        const convDoc = convQuery.docs[0]!;
        await convDoc.ref.update({
          count: admin.firestore.FieldValue.increment(1),
          last_fired_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Document does not exist, initialize a new conversion log record
        const newConvId = workspaceRef.collection('conversions').doc().id;
        await workspaceRef
          .collection('conversions')
          .doc(newConvId)
          .set({
            id: newConvId,
            event_name: eventName,
            name: eventName,
            platform: eventName.includes('Interested') || eventName.includes('Junk') || eventName.includes('Failed') ? 'multi' : 'meta',
            count: 1,
            account_name: 'AdSync Linked Ad Channels',
            last_fired_at: admin.firestore.FieldValue.serverTimestamp(),
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          });
      }

      // 7. Synchronize customer state inside connected ad channels audiences
      console.log(`[Cloud Function] Triggering Audience Sync Engine for Lead: ${leadId}`);
      await syncLeadToAudiences(workspace, afterData as any, afterStatus);

      console.log(`[Cloud Function] Lead status conversions and audiences successfully processed.`);
      return null;
    } catch (err: any) {
      console.error(`[Cloud Function] Execution crash on lead update triggers:`, err);
      return null;
    }
  });
