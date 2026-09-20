// In-app purchase service stub with a catalog. Replace `purchase` with a store SDK / payment backend.
import { storage } from '../core/storage.js';
export const CATALOG = [
  { id: 'coins_small', name: '500 Coins', coins: 500, price: '$0.99' },
  { id: 'coins_large', name: '3000 Coins', coins: 3000, price: '$4.99' },
  { id: 'no_ads', name: 'Remove Ads', price: '$2.99' },
];
export const iap = {
  catalog: CATALOG,
  async purchase(id) { return { ok: false, reason: 'Store not connected in this build' }; },
  grant(coins) { const c = storage.get().career; c.coins += coins; storage.save(); },
};
