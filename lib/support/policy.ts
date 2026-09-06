export const SUPPORT_ISSUE_TYPES = [
  'missing_item',
  'wrong_order',
  'damaged_item',
  'quality_issue',
  'late_delivery',
  'payment_issue',
  'account_issue',
  'technical_issue',
  'safety_issue',
  'other',
] as const;

export type SupportIssueType = (typeof SUPPORT_ISSUE_TYPES)[number];
export type SupportNextAction =
  | 'waiting_support'
  | 'waiting_customer'
  | 'refund_review'
  | 'merchant_review'
  | 'driver_review'
  | 'resolved';

export const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments';
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_RETENTION_DAYS = 180;

const ISSUE_POLICY: Record<SupportIssueType, {
  category: string;
  priority: 'normal' | 'high' | 'urgent';
  slaMinutes: number;
  nextAction: SupportNextAction;
  requiresOrder: boolean;
  allowsAttachment: boolean;
}> = {
  missing_item: { category: 'order_issue', priority: 'high', slaMinutes: 120, nextAction: 'refund_review', requiresOrder: true, allowsAttachment: false },
  wrong_order: { category: 'order_issue', priority: 'high', slaMinutes: 120, nextAction: 'merchant_review', requiresOrder: true, allowsAttachment: true },
  damaged_item: { category: 'order_issue', priority: 'high', slaMinutes: 120, nextAction: 'refund_review', requiresOrder: true, allowsAttachment: true },
  quality_issue: { category: 'order_issue', priority: 'high', slaMinutes: 240, nextAction: 'merchant_review', requiresOrder: true, allowsAttachment: true },
  late_delivery: { category: 'order_issue', priority: 'high', slaMinutes: 60, nextAction: 'driver_review', requiresOrder: true, allowsAttachment: false },
  payment_issue: { category: 'payment', priority: 'high', slaMinutes: 120, nextAction: 'waiting_support', requiresOrder: false, allowsAttachment: true },
  account_issue: { category: 'account', priority: 'normal', slaMinutes: 720, nextAction: 'waiting_support', requiresOrder: false, allowsAttachment: true },
  technical_issue: { category: 'technical', priority: 'normal', slaMinutes: 720, nextAction: 'waiting_support', requiresOrder: false, allowsAttachment: true },
  safety_issue: { category: 'order_issue', priority: 'urgent', slaMinutes: 15, nextAction: 'waiting_support', requiresOrder: false, allowsAttachment: true },
  other: { category: 'other', priority: 'normal', slaMinutes: 720, nextAction: 'waiting_support', requiresOrder: false, allowsAttachment: true },
};

export function supportPolicy(issueType: SupportIssueType) {
  return ISSUE_POLICY[issueType];
}

export function supportReference(ticketId: string): string {
  return `BG-${ticketId.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
}

export function supportSlaDueAt(issueType: SupportIssueType, now = new Date()): string {
  return new Date(now.getTime() + supportPolicy(issueType).slaMinutes * 60_000).toISOString();
}

export function isSupportIssueType(value: unknown): value is SupportIssueType {
  return typeof value === 'string' && SUPPORT_ISSUE_TYPES.includes(value as SupportIssueType);
}
