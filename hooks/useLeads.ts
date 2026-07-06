'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Lead } from '@/types';

export function useLeads(workspaceId: string | undefined) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!workspaceId) {
      setLeads([]);
      setLoading(false);
      return;
    }

    if (workspaceId === 'mock-workspace-id') {
      setLeads([
        {
          id: 'lead-1',
          workspace_id: 'mock-workspace-id',
          source_crm: 'zoho',
          external_id: '1004829',
          name: 'Jane Smith',
          email: 'jane.smith@gmail.com',
          phone: '9876543210',
          email_sha256: '887d1aa75083cfc0934661858546522c011e4df6661a35515cb6b38c234a1796',
          phone_sha256: '9f048d08404a11c0f4f9db564c76b9117cfbd9bd228f41151cb6b38c234a1796',
          lead_status: 'interested',
          status_history: [
            { status: 'new', changed_at: Date.now() - 3600000, source: 'webhook', ei_event_fired: 'EI_New' },
            { status: 'interested', changed_at: Date.now(), source: 'manual', ei_event_fired: 'EI_Interested' },
          ],
          meta_event_fired: 'EI_Interested',
          google_event_fired: 'EI_Interested',
          created_at: new Date(Date.now() - 3600000),
          updated_at: new Date(),
        },
        {
          id: 'lead-2',
          workspace_id: 'mock-workspace-id',
          source_crm: 'custom',
          external_id: '1004830',
          name: 'John Doe',
          email: 'john.doe@yahoo.com',
          phone: '9988776655',
          email_sha256: 'fd5afb258c7058cf0934661858546522c011e4df6661a35515cb6b38c234a1796',
          phone_sha256: '0a4e5c8404a11c0f4f9db564c76b9117cfbd9bd228f41151cb6b38c234a1796',
          lead_status: 'new',
          status_history: [{ status: 'new', changed_at: Date.now() - 7200000, source: 'webhook', ei_event_fired: 'EI_New' }],
          meta_event_fired: 'EI_New',
          google_event_fired: 'EI_New',
          created_at: new Date(Date.now() - 7200000),
          updated_at: new Date(Date.now() - 7200000),
        },
      ] as any);
      setLoading(false);
      return;
    }

    setLoading(true);
    const leadsRef = collection(db, 'workspaces', workspaceId, 'leads');
    const q = query(leadsRef, orderBy('created_at', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Lead[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Lead);
        });
        setLeads(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to leads:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [workspaceId]);

  return { leads, loading };
}
export default useLeads;
