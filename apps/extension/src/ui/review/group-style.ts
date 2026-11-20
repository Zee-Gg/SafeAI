/*
  Colours and names for the four category groups in the review panel. Written out as full class
  names (not built from pieces) so Tailwind can find them when it scans the code.
*/
import type { CategoryGroup } from '@safeai/shared';

export const GROUP_STYLE: Readonly<
  Record<
    CategoryGroup,
    { name: string; text: string; dot: string; mark: string; decoration: string }
  >
> = {
  secrets: {
    name: 'Secrets',
    text: 'text-secrets',
    dot: 'bg-secrets',
    mark: 'bg-secrets-subtle text-secrets',
    decoration: 'decoration-secrets',
  },
  personal: {
    name: 'Personal',
    text: 'text-personal',
    dot: 'bg-personal',
    mark: 'bg-personal-subtle text-personal',
    decoration: 'decoration-personal',
  },
  financial: {
    name: 'Financial',
    text: 'text-financial',
    dot: 'bg-financial',
    mark: 'bg-financial-subtle text-financial',
    decoration: 'decoration-financial',
  },
  business: {
    name: 'Business',
    text: 'text-business',
    dot: 'bg-business',
    mark: 'bg-business-subtle text-business',
    decoration: 'decoration-business',
  },
};
