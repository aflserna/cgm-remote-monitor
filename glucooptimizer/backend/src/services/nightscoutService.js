const axios = require('axios');
const crypto = require('crypto');

class NightscoutService {
  constructor(nsUrl, apiSecret) {
    this.baseUrl = nsUrl.replace(/\/$/, '');
    this.headers = {
      'api-secret': crypto.createHash('sha1').update(apiSecret).digest('hex'),
      'Content-Type': 'application/json',
    };
  }

  async get(endpoint, params = {}) {
    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
      headers: this.headers,
      params,
      timeout: 10000,
    });
    return response.data;
  }

  // Test connection
  async testConnection() {
    try {
      const status = await this.get('/api/v1/status.json');
      return { ok: true, name: status.name, version: status.version };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Get recent CGM entries (default: last 3 hours = 36 readings)
  async getEntries(count = 36, from = null) {
    const params = { count, find: {} };
    if (from) params['find[date][$gte]'] = from;
    const entries = await this.get('/api/v1/entries.json', { count });
    return entries.map((e) => ({
      time: new Date(e.date),
      glucose: e.sgv,
      direction: e.direction,
      delta: e.delta,
      noise: e.noise,
    }));
  }

  // Get current glucose (latest entry)
  async getCurrentGlucose() {
    const entries = await this.getEntries(1);
    return entries[0] || null;
  }

  // Get treatments (boluses, temp basals, carbs)
  async getTreatments(hours = 3) {
    const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const treatments = await this.get('/api/v1/treatments.json', {
      'find[created_at][$gte]': from,
      count: 200,
    });
    return treatments;
  }

  // Get device status (IOB, COB, basal from AndroidAPS)
  async getDeviceStatus() {
    const statuses = await this.get('/api/v1/devicestatus.json', { count: 1 });
    const latest = statuses[0];
    if (!latest) return null;

    return {
      time: new Date(latest.created_at),
      iob: latest.openaps?.iob?.iob ?? latest.loop?.iob?.iobWithPredictions ?? null,
      cob: latest.openaps?.meal?.mealCOB ?? latest.loop?.cob ?? null,
      basalRate: latest.openaps?.suggested?.rate ?? null,
      tempBasalPercent: latest.openaps?.enacted?.percent ?? null,
      reservoir: latest.pump?.reservoir ?? null,
      batteryPercent: latest.pump?.battery?.percent ?? null,
      lastLoop: latest.openaps?.lastEnacted ?? null,
    };
  }

  // Get CGM + treatments for ML feature building (last N hours)
  async getMLFeatures(hours = 3) {
    const [entries, treatments, deviceStatus] = await Promise.all([
      this.getEntries(Math.ceil((hours * 60) / 5) + 5),
      this.getTreatments(hours),
      this.getDeviceStatus(),
    ]);

    const boluses = treatments.filter((t) => t.eventType === 'Bolus' || t.insulin > 0);
    const carbs = treatments.filter((t) => t.carbs > 0);
    const tempBasals = treatments.filter((t) => t.eventType === 'Temp Basal');

    return {
      cgmSeries: entries,
      boluses,
      carbs,
      tempBasals,
      currentStatus: deviceStatus,
    };
  }

  // Get historical data for model training (last N days)
  async getHistoricalData(days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const count = days * 288 + 100; // 288 readings/day at 5min intervals

    const [entries, treatments] = await Promise.all([
      this.get('/api/v1/entries.json', { count, 'find[date][$gte]': new Date(from).getTime() }),
      this.get('/api/v1/treatments.json', { count: days * 100, 'find[created_at][$gte]': from }),
    ]);

    return { entries, treatments };
  }
}

module.exports = NightscoutService;
