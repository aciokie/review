/**
 * Settings Manager using browser localStorage
 */
const Settings = {
  STORAGE_KEY: "chess_review_settings",

  defaults: {
    engineProvider: "colab", // 'colab' or 'local'
    colabUrl: "",
    depth: 20,
    threads: 4,
    hashMb: 512,
    multiPv: 1
  },

  load() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...this.defaults, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("Error reading settings from localStorage:", e);
    }
    return { ...this.defaults };
  },

  save(settingsObj) {
    try {
      const current = this.load();
      const updated = { ...current, ...settingsObj };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error("Error saving settings to localStorage:", e);
      return null;
    }
  },

  reset() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      console.error("Error resetting settings:", e);
    }
    return { ...this.defaults };
  }
};

window.Settings = Settings;
