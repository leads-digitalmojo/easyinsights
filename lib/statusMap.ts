// Maps internal lead statuses to Meta standard events.
// Standard events require zero confirmation in Meta Events Manager —
// Meta immediately uses them for ad optimization across all client pixels.
export const STATUS_MAP: Record<string, string> = {
  new:                'Lead',
  fresh:              'Lead',
  interested:         'Lead',
  positive_stage:     'Lead',
  in_call_center:     'Contact',
  visit_done:         'Schedule',
  final_negotiation:  'InitiateCheckout',
  booking_done:       'Purchase',
  claimed:            'Purchase',
  converted:          'Purchase',
  junk:               'EI_Junk',    // no standard equivalent — still fires for audience exclusion
  failed:             'EI_Failed',  // no standard equivalent
};

// Statuses that represent a final business conversion (for dashboard metrics)
export const CONVERSION_STATUSES = new Set(['claimed', 'booking_done', 'converted']);

// Audience segmentation — which lead statuses seed each audience tag.
// Positive Stage = engaged/warm leads (retarget + lookalike seed).
// Negative Stage = dead leads (suppression / exclusion list).
// 'new' / 'fresh' are intentionally neutral — they haven't engaged yet.
export const POSITIVE_STATUSES = new Set([
  'interested',
  'positive_stage',
  'in_call_center',
  'visit_done',
  'final_negotiation',
  'booking_done',
  'claimed',
  'converted',
]);

export const NEGATIVE_STATUSES = new Set(['junk', 'failed']);

export type AudienceTag = 'Positive Stage' | 'Negative Stage';

/** Returns true if a lead's status qualifies it for the given audience tag. */
export function statusMatchesTag(status: string, tag: AudienceTag): boolean {
  const s = (status || '').toLowerCase().trim();
  return tag === 'Positive Stage' ? POSITIVE_STATUSES.has(s) : NEGATIVE_STATUSES.has(s);
}

export function getEIEventName(status: string, customEventMap?: Record<string, string>): string | null {
  if (!status) return null;
  const normalizedStatus = status.toLowerCase().trim();
  const override = customEventMap?.[normalizedStatus];
  if (override && override.trim()) return override.trim();
  return STATUS_MAP[normalizedStatus] || null;
}

export function isConversionStatus(status: string): boolean {
  return CONVERSION_STATUSES.has(status.toLowerCase().trim());
}
