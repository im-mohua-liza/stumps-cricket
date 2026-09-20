// Ads service stub. Swap the bodies for a real SDK (AdMob, Unity Ads, ...) later. Callers only use this interface.
export const ads = {
  enabled: false,
  async showInterstitial() { return { shown: false }; },
  async showRewarded() { return { rewarded: true, simulated: true }; },
};
