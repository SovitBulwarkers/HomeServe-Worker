import { DisputeReason, DisputeStatus } from '../api/endpoints';

export const DISPUTE_REASONS: { value: DisputeReason; label: string; description: string; icon: string }[] = [
  {
    value: 'EXTRA_CHARGE_UNJUSTIFIED',
    label: 'Extra charge rejected unfairly',
    description: "Customer refused a legitimate extra-charge request",
    icon: 'cash-outline',
  },
  {
    value: 'UNAUTHORIZED_CHARGE',
    label: 'Unauthorized charge',
    description: 'A charge on this booking that was never agreed to',
    icon: 'card-outline',
  },
  {
    value: 'OVERCHARGED',
    label: 'Overcharged',
    description: 'The amount charged is higher than it should be',
    icon: 'trending-up-outline',
  },
  {
    value: 'DUPLICATE_CHARGE',
    label: 'Duplicate charge',
    description: 'The same payment was charged more than once',
    icon: 'copy-outline',
  },
  {
    value: 'REFUND_NOT_RECEIVED',
    label: 'Refund not received',
    description: 'An approved refund or payout never arrived',
    icon: 'return-down-back-outline',
  },
  {
    value: 'DAMAGE_OR_LOSS',
    label: 'Damage or loss claim',
    description: 'A claim of damage or loss you disagree with',
    icon: 'warning-outline',
  },
  {
    value: 'SERVICE_NOT_AS_DESCRIBED',
    label: 'Service dispute',
    description: 'Disagreement over what the job actually required',
    icon: 'construct-outline',
  },
  {
    value: 'WORKER_NO_SHOW',
    label: 'No-show dispute',
    description: 'You were marked as a no-show but were present',
    icon: 'person-remove-outline',
  },
  {
    value: 'OTHER',
    label: 'Something else',
    description: 'Any other payment or booking issue',
    icon: 'help-circle-outline',
  },
];

export function disputeReasonLabel(reason: DisputeReason): string {
  return DISPUTE_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export function disputeStatusLabel(status: DisputeStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'UNDER_REVIEW':
      return 'Under Review';
    case 'RESOLVED_REFUNDED':
      return 'Resolved · Refunded';
    case 'RESOLVED_PARTIAL_REFUND':
      return 'Resolved · Partial Refund';
    case 'RESOLVED_UPHELD':
      return 'Resolved · Upheld';
    case 'RESOLVED_NO_ACTION':
      return 'Resolved · No Action';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return status;
  }
}

export function disputeStatusTone(status: DisputeStatus): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'OPEN':
      return 'warning';
    case 'UNDER_REVIEW':
      return 'info';
    case 'RESOLVED_REFUNDED':
    case 'RESOLVED_PARTIAL_REFUND':
      return 'success';
    case 'RESOLVED_UPHELD':
    case 'RESOLVED_NO_ACTION':
      return 'info';
    case 'WITHDRAWN':
      return 'danger';
    default:
      return 'info';
  }
}

export const OPEN_DISPUTE_STATUSES: DisputeStatus[] = ['OPEN', 'UNDER_REVIEW'];
