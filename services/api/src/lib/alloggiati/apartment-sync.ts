import { padApartmentId } from "./schedina.js";
import type { AlloggiatiApartment } from "./types.js";

export type ExistingProperty = {
  id: string;
  name: string;
  alloggiatiApartmentId: string | null;
};

export type ApartmentCreate = {
  name: string;
  address: string;
  alloggiatiApartmentId: string;
};

export type ApartmentLink = {
  propertyId: string;
  alloggiatiApartmentId: string;
};

export type ApartmentSyncPlan = {
  create: ApartmentCreate[];
  link: ApartmentLink[];
  unmatched: AlloggiatiApartment[];
};

export function planApartmentSync(
  existing: ExistingProperty[],
  remote: AlloggiatiApartment[],
): ApartmentSyncPlan {
  const paddedRemote = remote.map((item) => ({
    ...item,
    paddedId: padApartmentId(item.id),
  }));

  if (existing.length === 0) {
    return {
      create: paddedRemote.map((item) => ({
        name: item.description.trim() || `Appartamento ${item.paddedId}`,
        address: (item.indirizzo ?? item.description).trim() || item.paddedId,
        alloggiatiApartmentId: item.paddedId,
      })),
      link: [],
      unmatched: [],
    };
  }

  const byId = new Map<string, ExistingProperty>();
  for (const property of existing) {
    if (property.alloggiatiApartmentId?.trim()) {
      byId.set(padApartmentId(property.alloggiatiApartmentId), property);
    }
  }

  const link: ApartmentLink[] = [];
  const unmatched: AlloggiatiApartment[] = [];
  for (const item of paddedRemote) {
    const match = byId.get(item.paddedId);
    if (match) {
      link.push({ propertyId: match.id, alloggiatiApartmentId: item.paddedId });
    } else {
      unmatched.push(item);
    }
  }

  return { create: [], link, unmatched };
}
