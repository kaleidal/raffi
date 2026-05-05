import type { Addon } from '@/lib/types';

export const getStreamAddons = (addons: Addon[]) => {
  return addons.filter((addon) => {
    const resources = addon.manifest?.resources;
    if (!Array.isArray(resources)) return false;

    return resources.some((resource) => {
      if (resource === 'stream') return true;
      return typeof resource === 'object' && resource?.name === 'stream';
    });
  });
};
