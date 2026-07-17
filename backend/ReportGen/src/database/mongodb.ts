import { MongoClient } from 'mongodb';

/**
 * Lightweight MongoDB client implementation for ReportGen service.
 * - Connects using MONGODB_URI and MONGODB_DATABASE env vars
 * - Exposes helpers used by controllers: getAllResultsForScan, saveReport, getReportById, getAllReports, getScanInfo, updateScanStage
 */

class MongoDBClient {
  private client: MongoClient | null = null;
  private db: any = null;
  private _connected = false;

  isConnected() {
    return this._connected;
  }

  async connect() {
    if (this._connected) return true;
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DATABASE || 'security_platform';

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    this._connected = true;
    return true;
  }

  async saveReport(scanId: string, payload: any) {
    await this.connect();
    const coll = this.db.collection('reports');

    // Always upsert by report_id (unique per generation) to avoid duplicate key errors
    // on the scan_id_1 index when a scan has multiple report generations.
    if (payload.reportId) {
      const doc = {
        ...payload,
        report_id: payload.reportId,
        scan_id: scanId,
        updated_at: new Date(),
      };
      await coll.updateOne(
        { report_id: payload.reportId },
        {
          $set: doc,
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true }
      );
    } else {
      // No reportId — fall back to upsert by scan_id, update only (no insert if conflict)
      try {
        await coll.updateOne(
          { scan_id: scanId },
          {
            $set: { ...payload, scan_id: scanId, updated_at: new Date() },
            $setOnInsert: { created_at: new Date() },
          },
          { upsert: true }
        );
      } catch (err: any) {
        // If duplicate key on scan_id, try updateOne without upsert to update the existing doc
        if (err && err.code === 11000) {
          await coll.updateOne(
            { scan_id: scanId },
            { $set: { ...payload, scan_id: scanId, updated_at: new Date() } }
          );
        } else {
          throw err;
        }
      }
    }
    return true;
  }

  async getAllResultsForScan(scanId: string): Promise<any> {
    await this.connect();
    const scansColl = this.db.collection('scans');
    const apkColl = this.db.collection('apk_results');
    const secretsColl = this.db.collection('secret_results');
    const cryptoColl = this.db.collection('crypto_results');
    const networkColl = this.db.collection('network_results');

    const [scanDoc, apkDoc, secretsDoc, cryptoDoc, networkDoc] = await Promise.all([
      scansColl.findOne({ scan_id: scanId }),
      apkColl.findOne({ scan_id: scanId }),
      secretsColl.findOne({ scan_id: scanId }),
      cryptoColl.findOne({ scan_id: scanId }),
      networkColl.findOne({ scan_id: scanId })
    ]);

    // Normalize to the shapes expected by controllers
    const result: any = {};
    if (apkDoc) result.apk = apkDoc;
    if (secretsDoc) result.secrets = secretsDoc;
    if (cryptoDoc) result.crypto = cryptoDoc;
    if (networkDoc) result.network = networkDoc;

    // Include basic scan metadata if available
    if (scanDoc) {
      result.scan = scanDoc;
    }

    return result;
  }

  async getScanInfo(scanId: string): Promise<any> {
    await this.connect();
    const scansColl = this.db.collection('scans');
    return scansColl.findOne({ scan_id: scanId });
  }

  async saveScanPartial(scanId: string, data: any) {
    await this.connect();
    const coll = this.db.collection('scans');
    await coll.updateOne({ scan_id: scanId }, { $set: data }, { upsert: true });
    return true;
  }

  async getReportById(id: string) {
    await this.connect();
    const coll = this.db.collection('reports');
    const doc = await coll.findOne({ $or: [{ report_id: id }, { _id: id }] });
    return doc;
  }

  async getAllReports(limit = 100): Promise<any[]> {
    await this.connect();
    const coll = this.db.collection('reports');
    const docs = await coll.find({}).sort({ created_at: -1 }).limit(limit).toArray();
    return docs;
  }

  async updateScanStage(scanId: string, stage: string) {
    await this.connect();
    const coll = this.db.collection('scans');
    await coll.updateOne({ scan_id: scanId }, { $set: { 'stages.report_gen': stage, updated_at: new Date() } }, { upsert: false });
    return true;
  }
}

export const mongoClient = new MongoDBClient();
