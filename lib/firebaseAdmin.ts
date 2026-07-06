import * as admin from 'firebase-admin';

// In-memory store so mock updates persist for the lifetime of the server process
const mockStore: Record<string, Record<string, any>> = {};

const BASE_WORKSPACE = {
  id: 'mock-doc-id',
  name: 'Deevyashaktirealtyamara',
  slug: 'deevyashakti',
  owner_uid: 'mock-uid-123',
  members: ['mock-uid-123'],
  webhook_secret: 'mock-webhook-secret',
  meta_pixel_id: '',
  meta_access_token: '',
  meta_pixel_name: '',
  google_ads_customer_id: '',
  google_ads_developer_token: '',
  google_ads_refresh_token: '',
};

function getMockWorkspace(): Record<string, any> {
  return { ...BASE_WORKSPACE, ...(mockStore['workspaces/mock-doc-id'] ?? {}) };
}

// Local Mock Firestore implementation for sandbox resilience
const createMockDb = () => {
  console.warn('⚠️ [Firebase Admin] Initializing local mock DB — no valid Firebase credentials found.');
  return {
    collection: (colName: string): any => {
      const collectionInstance = {
        doc: (docId: string): any => {
          const storeKey = `${colName}/${docId}`;
          return {
            set: async (data: any) => {
              mockStore[storeKey] = { ...(mockStore[storeKey] ?? {}), ...data };
              console.log(`[Mock DB Set] ${storeKey}`);
              return { writeTime: new Date() };
            },
            get: async () => {
              const isWorkspace = colName === 'workspaces';
              const data = isWorkspace ? getMockWorkspace() : (mockStore[storeKey] ?? { id: docId });
              return {
                exists: true,
                id: docId,
                ref: {
                  update: async (updateData: any) => {
                    mockStore[storeKey] = { ...(mockStore[storeKey] ?? {}), ...updateData };
                    console.log(`[Mock DB Doc Update] ${storeKey}`);
                    return { writeTime: new Date() };
                  },
                  collection: (subCol: string): any => createMockDb().collection(subCol),
                },
                data: () => data,
              };
            },
            update: async (data: any) => {
              mockStore[storeKey] = { ...(mockStore[storeKey] ?? {}), ...data };
              console.log(`[Mock DB Update] ${storeKey}`);
              return { writeTime: new Date() };
            },
            delete: async () => {
              delete mockStore[storeKey];
              return {};
            },
            collection: (subCol: string): any => createMockDb().collection(subCol),
          };
        },
        where: (field: string, op: string, val: any): any => ({
          where: (f2: string, op2: string, v2: any) => collectionInstance.where(field, op, val),
          limit: (n: number) => ({
            get: async () => {
              console.log(`[Mock DB Query] ${colName} where ${field} ${op} ${val}`);
              const wsData = getMockWorkspace();
              return {
                empty: false,
                docs: [
                  {
                    id: 'mock-doc-id',
                    ref: {
                      update: async (updateData: any) => {
                        mockStore['workspaces/mock-doc-id'] = {
                          ...(mockStore['workspaces/mock-doc-id'] ?? {}),
                          ...updateData,
                        };
                        console.log(`[Mock DB Ref Update] ${colName}:`, Object.keys(updateData));
                        return { writeTime: new Date() };
                      },
                      set: async (setData: any) => {
                        mockStore['workspaces/mock-doc-id'] = {
                          ...(mockStore['workspaces/mock-doc-id'] ?? {}),
                          ...setData,
                        };
                        return { writeTime: new Date() };
                      },
                      delete: async () => {
                        delete mockStore['workspaces/mock-doc-id'];
                        return {};
                      },
                      collection: (subCol: string): any => createMockDb().collection(subCol),
                    },
                    data: () => ({ ...wsData, slug: String(val).toLowerCase() }),
                  },
                ],
              };
            },
          }),
          get: async () => {
            console.log(`[Mock DB Collection Query] ${colName} where ${field} ${op} ${val}`);
            return { empty: true, docs: [] };
          },
        }),
        add: async (data: any) => {
          const newId = `mock_add_${Date.now()}`;
          mockStore[`${colName}/${newId}`] = data;
          console.log(`[Mock DB Add] ${colName}/${newId}`);
          return { id: newId };
        },
        get: async () => {
          console.log(`[Mock DB Collection Get] ${colName}`);
          return { empty: true, docs: [] };
        },
      };
      return collectionInstance;
    },
    batch: () => ({
      delete: () => {},
      commit: async () => {},
    }),
  };
};

const createMockAuth = () => {
  return {
    verifyIdToken: async (token: string) => {
      console.log('[Mock Auth] Verifying Token:', token);
      return { uid: 'mock-uid-123', email: 'aditya@mojoinsights.co' };
    },
  };
};

// Returns true only if the parsed service account has real (non-placeholder) credentials
function isRealServiceAccount(sa: any): boolean {
  return (
    typeof sa.client_email === 'string' &&
    sa.client_email.endsWith('.iam.gserviceaccount.com') &&
    !sa.client_email.startsWith('YOUR') &&
    typeof sa.private_key === 'string' &&
    sa.private_key.startsWith('-----BEGIN PRIVATE KEY-----') &&
    sa.private_key.length > 500
  );
}

function getAdminApp() {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);

      if (!isRealServiceAccount(serviceAccount)) {
        console.warn('[Firebase Admin] Service account key contains placeholder values — using sandbox mock mode.');
        return { isMock: true, app: null };
      }

      if (admin.apps.length > 0) {
        return { isMock: false, app: admin.apps[0]! };
      }
      return {
        isMock: false,
        app: admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        }),
      };
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY — falling back to sandbox mock mode.', e);
      return { isMock: true, app: null };
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const hasGcpCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!serviceAccountKey && !hasGcpCredentials && !isProduction) {
    return { isMock: true, app: null };
  }

  if (admin.apps.length > 0) {
    return { isMock: false, app: admin.apps[0]! };
  }

  try {
    return {
      isMock: false,
      app: admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_BASE_PROJECT_ID || 'crm1-76cc4',
      }),
    };
  } catch (err) {
    console.error('Default credential loading failed, activating fallback sandbox environment', err);
    return { isMock: true, app: null };
  }
}

const adminAppInstance = getAdminApp();

export const isMockEnvironment = adminAppInstance.isMock;

export const adminDb = adminAppInstance.isMock
  ? (createMockDb() as any)
  : adminAppInstance.app!.firestore();

export const adminAuth = adminAppInstance.isMock
  ? (createMockAuth() as any)
  : adminAppInstance.app!.auth();

export default adminAppInstance.app;
