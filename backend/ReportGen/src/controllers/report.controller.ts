import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import logger from '../utils/logger';
import puppeteer from 'puppeteer';
import { mongoClient } from '../database/mongodb';
import {
  GenerateReportRequest,
  GenerateReportRequestSchema,
  Report,
  ReportOptions,
  ReportOptionsSchema,
  ReportStatus
} from '../models';
// Additional schema for generic POST /api/reports
import { GenerateReportSchema } from '../models/generate-report.model';
import {
  aggregatorService,
  deduplicatorService,
  metricsService,
  jsonExporterService,
  sarifExporterService,
  fileWatcherService,
  pdfGeneratorService,
  jsonToPdfService
} from '../services';

// Store des rapports en mémoire (en production, utiliser Redis ou une BDD)
const reportsStore = new Map<string, Report>();

// Configuration de Multer pour l'upload de fichiers JSON
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.TEMP_DIR || './tmp';
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['application/json', 'application/octet-stream', 'text/plain', 'text/json', 'application/x-json'];
  const ok = allowed.includes(file.mimetype) || (file.originalname && file.originalname.toLowerCase().endsWith('.json'));
  if (ok) cb(null, true);
  else cb(new Error('Only JSON files are allowed'));
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

export class ReportController {
  private tempDir: string;

  constructor() {
    this.tempDir = process.env.TEMP_DIR || './tmp';
    this.ensureTempDir();
  }

  // Use shared normalizer for various tool output shapes
  // Deprecated local method - preference is to import `normalizeFinding` from utils
  // Kept for backward compatibility as thin wrapper
  private normalizeFinding(f: any, svc?: string) {
    // Lazy import to avoid circular reference problems in some build setups
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { normalizeFinding: nf } = require('../utils/normalizeFinding');
    return nf(f, svc);
  }

  /**
   * Normalize the overall incoming request body to match GenerateReportSchema expectations
   */
  private normalizeRequestForValidation(body: any) {
    const normalized = { ...body };

    // Normalize results object if present
    if (normalized.results && typeof normalized.results === 'object') {
      const nextResults: Record<string, any[]> = {};
      for (const [k, v] of Object.entries(normalized.results)) {
        if (Array.isArray(v)) {
          nextResults[k] = v.map(item => this.normalizeFinding(item));
        } else {
          // If someone sent a single object, wrap it
          nextResults[k] = [this.normalizeFinding(v)];
        }
      }
      normalized.results = nextResults;
    }

    // If scanResults is provided with raw service outputs, keep as-is (used downstream)
    // But ensure options/template/format are present
    normalized.format = normalized.format || 'pdf';
    normalized.template = normalized.template || 'security_report';

    return normalized;
  }

  /**
   * S'assure que le dossier temporaire existe
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', { error });
    }
  }

  /**
   * POST /api/reports/generate
   * Génère un nouveau rapport
   */
  generateReport = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    let reportId: string | null = null;

    try {
      // Valider les données d'entrée
      const validationResult = GenerateReportRequestSchema.safeParse(req.body);

      if (!validationResult.success) {
        res.status(400).json({
          error: 'Validation error',
          details: validationResult.error.errors
        });
        return;
      }

      const requestData: GenerateReportRequest = validationResult.data;
      reportId = uuidv4();

      logger.info(`Starting report generation`, {
        reportId,
        projectName: requestData.projectName,
        format: requestData.format
      });

      const finalProjectName = (requestData.projectName && requestData.projectName.trim() && requestData.projectName !== 'Unknown App')
        ? requestData.projectName
        : (requestData.scanId ? `Scan ${requestData.scanId}` : `Report ${reportId}`);

      // Créer le rapport initial avec statut "pending"
      const initialReport: Report = {
        reportId,
        projectName: finalProjectName,
        vulnerabilities: [],
        metrics: {
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          byCategory: {},
          securityScore: 100,
          topAffectedFiles: []
        },
        scanMetadata: {
          startTime: new Date().toISOString(),
          tools: this.extractToolNames(requestData.scanResults)
        },
        generatedAt: new Date().toISOString(),
        format: requestData.format,
        status: 'pending'
      };

      reportsStore.set(reportId, initialReport);

      // Répondre immédiatement avec le statut pending
      res.status(202).json({
        reportId,
        status: 'pending',
        message: 'Report generation started'
      });

      // Continuer la génération en arrière-plan
      this.processReport(reportId, requestData).catch(error => {
        logger.error('Background report generation failed', { error, reportId });
      });

    } catch (error) {
      logger.error('Failed to start report generation', { error, reportId });
      next(error);
    }
  };

  /**
   * POST /api/reports/upload
   * Génère un rapport à partir d'un fichier JSON uploadé
   */
  generateFromFile = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    let reportId: string | null = null;
    let uploadedFilePath: string | null = null;

    try {
      // Vérifier si un fichier a été uploadé
      if (!req.file) {
        logger.warn('No file uploaded in multipart request', { headers: req.headers, contentType: req.headers['content-type'] });
        res.status(400).json({
          error: 'No file uploaded',
          message: 'Please upload a JSON file containing scan results. Check that the file field name is "file" and file is a .json'
        });
        return;
      }

      uploadedFilePath = req.file.path;
      logger.info('File uploaded', {
        filename: req.file.originalname,
        size: req.file.size,
        path: uploadedFilePath
      });

      // Lire et parser le fichier JSON
      const fileContent = await fs.readFile(uploadedFilePath, 'utf-8');
      let requestData: GenerateReportRequest;

      try {
        requestData = JSON.parse(fileContent);
      } catch (parseError) {
        res.status(400).json({
          error: 'Invalid JSON',
          message: 'The uploaded file is not valid JSON'
        });
        // Nettoyer le fichier uploadé
        await fs.unlink(uploadedFilePath).catch(() => { });
        return;
      }

      // If client passed a format override via query string (eg. ?format=pdf), prefer it
      if (req.query && req.query.format) {
        try { requestData.format = String(req.query.format).toLowerCase(); } catch (e) { /* ignore */ }
      }

      // Valider les données
      let validationResult = GenerateReportRequestSchema.safeParse(requestData);

      // If the uploaded JSON doesn't match schema, attempt to coerce common shapes into the expected request
      if (!validationResult.success) {
        logger.warn('Uploaded JSON failed validation, attempting to normalize/fallback', { filename: req.file.originalname, errors: validationResult.error.errors });

        const fallback: any = {
          projectName: requestData.projectName || requestData.metadata?.projectName || requestData.name || 'Uploaded Report',
          scanId: requestData.scanId || requestData.scan_id || requestData.id,
          format: requestData.format || 'pdf',
          results: {},
          scanResults: requestData
        };

        // Copy existing results block if present
        if (requestData.results && typeof requestData.results === 'object') {
          fallback.results = requestData.results;
        }

        // Map common top-level patterns
        if (Array.isArray(requestData.secrets)) fallback.results.secretHunter = requestData.secrets;
        if (requestData.secrets && Array.isArray(requestData.secrets.secrets)) fallback.results.secretHunter = requestData.secrets.secrets;
        if (Array.isArray(requestData.crypto)) fallback.results.cryptoCheck = requestData.crypto;
        if (requestData.crypto && Array.isArray(requestData.crypto.vulnerabilities)) fallback.results.cryptoCheck = requestData.crypto.vulnerabilities;
        if (Array.isArray(requestData.network)) fallback.results.networkInspector = requestData.network;
        if (Array.isArray(requestData.apk)) fallback.results.apk = requestData.apk;
        if (requestData.manifest_issues) fallback.results.apk = requestData.manifest_issues;

        // If the entire file is an array of findings, put it under a generic service
        if (Array.isArray(requestData)) {
          fallback.results.generic = requestData;
        }

        // Try to normalize & re-validate
        const normalizedFallback = this.normalizeRequestForValidation(fallback);
        const fallbackValidation = GenerateReportRequestSchema.safeParse(normalizedFallback);

        if (!fallbackValidation.success) {
          logger.error('Fallback normalization failed', { filename: req.file.originalname, errors: fallbackValidation.error.errors });
          res.status(400).json({
            error: 'Validation error',
            message: 'The uploaded JSON was not recognized and could not be automatically normalized',
            details: validationResult.error.errors
          });
          // Cleanup uploaded file
          await fs.unlink(uploadedFilePath).catch(() => { });
          return;
        }

        requestData = fallbackValidation.data;
      } else {
        requestData = validationResult.data;
      }
      reportId = uuidv4();

      logger.info(`Starting report generation from uploaded file`, {
        reportId,
        projectName: requestData.projectName,
        format: requestData.format,
        originalFilename: req.file.originalname
      });

      const finalProjectName = (requestData.projectName && requestData.projectName.trim() && requestData.projectName !== 'Unknown App')
        ? requestData.projectName
        : (requestData.scanId ? `Scan ${requestData.scanId}` : `Report ${reportId}`);

      // Créer le rapport initial avec statut "pending"
      const initialReport: Report = {
        reportId,
        projectName: finalProjectName,
        vulnerabilities: [],
        metrics: {
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          byCategory: {},
          securityScore: 100,
          topAffectedFiles: []
        },
        scanMetadata: {
          startTime: new Date().toISOString(),
          tools: this.extractToolNames(requestData.scanResults)
        },
        generatedAt: new Date().toISOString(),
        format: requestData.format,
        status: 'pending'
      };

      reportsStore.set(reportId, initialReport);

      // If the client requested synchronous processing (e.g., ?sync=true), process and return the file directly
      if (String(req.query.sync) === 'true') {
        try {
          await this.processReport(reportId, requestData);
          const finalReport = reportsStore.get(reportId);
          if (!finalReport || finalReport.status !== 'completed' || !finalReport.filePath) {
            res.status(500).json({ error: 'Failed to generate report synchronously', reportId, status: finalReport?.status });
            await fs.unlink(uploadedFilePath).catch(() => { });
            return;
          }

          const fileContent = await fs.readFile(finalReport.filePath);
          const mime = finalReport.format === 'pdf' ? 'application/pdf' : 'application/json';
          const ext = finalReport.format === 'pdf' ? 'pdf' : 'json';
          res.setHeader('Content-Type', mime);
          res.setHeader('Content-Disposition', `attachment; filename="${(finalReport.projectName || 'report').replace(/[^a-zA-Z0-9]/g, '-')}-security-report.${ext}"`);
          // Cleanup uploaded file
          await fs.unlink(uploadedFilePath).catch(() => { });
          return res.send(fileContent);
        } catch (syncErr) {
          logger.error('Synchronous report generation failed', { error: syncErr, reportId });
          res.status(500).json({ error: 'Synchronous generation failed', detail: String(syncErr) });
          await fs.unlink(uploadedFilePath).catch(() => { });
          return;
        }
      }

      // Répondre immédiatement avec le statut pending
      res.status(202).json({
        reportId,
        status: 'pending',
        message: 'Report generation started from uploaded file',
        uploadedFile: req.file.originalname
      });

      // Continuer la génération en arrière-plan
      this.processReport(reportId, requestData).catch(error => {
        logger.error('Background report generation failed', { error, reportId });
      });

      // Nettoyer le fichier uploadé après traitement
      await fs.unlink(uploadedFilePath).catch(() => { });

    } catch (error: any) {
      logger.error('Failed to process uploaded file', { error: String(error), stack: error?.stack, reportId });
      // Nettoyer le fichier uploadé en cas d'erreur
      if (uploadedFilePath) {
        await fs.unlink(uploadedFilePath).catch(() => { });
      }

      // If synchronous request, return a JSON error payload to client
      if (String(req.query.sync) === 'true') {
        res.status(500).json({ error: 'Failed to process uploaded file', detail: String(error) });
        return;
      }

      next(error);
    }
  };

  /**
   * POST /api/reports/generate-from-folder
   * Génère un rapport à partir de tous les fichiers JSON dans le dossier input
   */
  generateFromFolder = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    let reportId: string | null = null;

    try {
      const { projectName, format = 'pdf', options, clearAfterGeneration = false } = req.body;

      if (!projectName) {
        res.status(400).json({
          error: 'Missing projectName',
          message: 'Please provide a projectName in the request body'
        });
        return;
      }

      // Lire tous les fichiers du dossier input
      const { files, errors } = await fileWatcherService.readAllInputFiles();

      if (files.length === 0) {
        res.status(400).json({
          error: 'No valid scan files found',
          message: `No JSON files found in the input directory: ${fileWatcherService.getInputDirectory()}`,
          errors,
          hint: 'Place your scan result JSON files in the input folder and try again'
        });
        return;
      }

      // Combiner les fichiers en une requête
      const requestData = fileWatcherService.combineFilesToRequest(
        files,
        projectName,
        format,
        options
      );

      reportId = uuidv4();

      logger.info(`Starting report generation from input folder`, {
        reportId,
        projectName,
        format,
        filesCount: files.length,
        files: files.map(f => ({ filename: f.filename, type: f.type, tool: f.tool }))
      });

      const finalProjectName = (requestData.projectName && requestData.projectName.trim() && requestData.projectName !== 'Unknown App')
        ? requestData.projectName
        : (requestData.scanId ? `Scan ${requestData.scanId}` : `Report ${reportId}`);

      // Créer le rapport initial avec statut "pending"
      const initialReport: Report = {
        reportId,
        projectName: finalProjectName,
        vulnerabilities: [],
        metrics: {
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          byCategory: {},
          securityScore: 100,
          topAffectedFiles: []
        },
        scanMetadata: {
          startTime: new Date().toISOString(),
          tools: this.extractToolNames(requestData.scanResults)
        },
        generatedAt: new Date().toISOString(),
        format: requestData.format,
        status: 'pending'
      };

      reportsStore.set(reportId, initialReport);

      // Répondre immédiatement avec le statut pending
      res.status(202).json({
        reportId,
        status: 'pending',
        message: 'Report generation started from input folder',
        filesProcessed: files.map(f => ({
          filename: f.filename,
          type: f.type,
          tool: f.tool
        })),
        errors: errors.length > 0 ? errors : undefined
      });

      // Continuer la génération en arrière-plan
      this.processReport(reportId, requestData).catch(error => {
        logger.error('Background report generation failed', { error, reportId });
      });

      // Nettoyer le dossier input si demandé
      if (clearAfterGeneration) {
        const deleted = await fileWatcherService.clearInputDirectory();
        logger.info(`Cleared ${deleted} files from input directory`);
      }

    } catch (error) {
      logger.error('Failed to generate report from folder', { error, reportId });
      next(error);
    }
  };

  /**
   * GET /api/reports/input-files
   * Liste les fichiers présents dans le dossier input
   */
  listInputFiles = async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const { files, errors } = await fileWatcherService.readAllInputFiles();

      res.json({
        inputDirectory: fileWatcherService.getInputDirectory(),
        filesCount: files.length,
        files: files.map(f => ({
          filename: f.filename,
          type: f.type,
          tool: f.tool
        })),
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      logger.error('Failed to list input files', { error });
      next(error);
    }
  };

  /**
   * DELETE /api/reports/input-files
   * Vide le dossier input
   */
  clearInputFiles = async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const deleted = await fileWatcherService.clearInputDirectory();

      res.json({
        message: `Deleted ${deleted} files from input directory`,
        deletedCount: deleted
      });

    } catch (error) {
      logger.error('Failed to clear input files', { error });
      next(error);
    }
  };

  /**
   * POST /api/reports
   * Génère un rapport (PDF / JSON / SARIF) à partir d'un payload contenant `results`.
   */
  createReport = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      // Preprocess and normalize the incoming body so that the server accepts common tool result shapes
      const normalizedBody = this.normalizeRequestForValidation(req.body);

      const validation = GenerateReportSchema.safeParse(normalizedBody);
      if (!validation.success) {
        res.status(400).json({ error: 'Invalid request body', details: validation.error.errors });
        return;
      }

      const payload = validation.data;

      // Aggregate and normalize
      const aggregated = aggregatorService.aggregate(payload.results || {});
      const deduped = deduplicatorService.deduplicate(aggregated);
      const metrics = metricsService.calculateMetrics(deduped);

      const report: any = {
        reportId: `on-demand-${Date.now()}`,
        projectName: payload.metadata?.appName || payload.metadata?.projectName || 'Report Security',
        vulnerabilities: deduped,
        metrics,
        scanMetadata: { startTime: new Date().toISOString(), tools: Object.keys(payload.results || {}) },
        generatedAt: new Date().toISOString(),
        format: payload.format,
        status: 'completed'
      };

      // If caller provided per-service results, attach per-service summaries so templates can render them
      const servicesSummaryForReport: Record<string, any> = {};
      const rawServicesProvided: any = payload.results || payload.scanResults || {};
      logger.info('createReport: rawServicesProvided keys', { keys: Object.keys(rawServicesProvided || {}) });
      for (const [svcName, svcRaw] of Object.entries(rawServicesProvided || {})) {
        let findings: any[] = [];
        if (Array.isArray(svcRaw)) findings = (svcRaw as any[]).map((f: any) => this.normalizeFinding(f));
        else if (svcRaw && Array.isArray((svcRaw as any).findings)) findings = (svcRaw as any).findings.map((f: any) => this.normalizeFinding(f));
        else if (svcRaw && Array.isArray((svcRaw as any).results)) findings = (svcRaw as any).results.map((f: any) => this.normalizeFinding(f));
        else if (svcRaw && typeof svcRaw === 'object') findings = [this.normalizeFinding(svcRaw)];

        const bySeverity = findings.reduce((acc: Record<string, number>, v: any) => { const s = v.severity || 'info'; acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<string, number>);
        const counts = { total: findings.length, bySeverity: { critical: bySeverity.critical || 0, high: bySeverity.high || 0, medium: bySeverity.medium || 0, low: bySeverity.low || 0, info: bySeverity.info || 0 } };
        servicesSummaryForReport[String(svcName)] = {
          findings,
          counts,
          raw: svcRaw,
          rawString: (() => { try { return JSON.stringify(svcRaw, null, 2); } catch (e) { return String(svcRaw); } })()
        };
      }

      if (Object.keys(servicesSummaryForReport).length > 0) {
        report.services = servicesSummaryForReport;
      }

      // Persist in-memory so frontend can download by reportId
      try {
        reportsStore.set(report.reportId, report);
      } catch (e) {
        logger.warn('Failed to cache report in memory', { error: e, reportId: report.reportId });
      }

      // JSON
      if (payload.format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Report-Id', report.reportId);
        const jsonStr = await jsonExporterService.getJsonData(report, { pretty: true } as any);
        logger.info('Sending JSON report', { reportId: report.reportId, length: jsonStr ? jsonStr.length : 0 });
        return res.send(jsonStr);
      }

      // SARIF
      if (payload.format === 'sarif') {
        const sarifPath = await sarifExporterService.exportToSarif(report);
        const sarifJson = await fs.readFile(sarifPath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Report-Id', report.reportId);
        return res.send(sarifJson);
      }

      // PDF
      const templateName = payload.template || 'security_report';
      if (!(await pdfGeneratorService.templateExists(templateName))) {
        res.status(404).json({ error: 'Template not found', template: templateName });
        return;
      }

      const opts: any = payload.options || {};
      const requestedPdfPath = path.join(this.tempDir, `${report.reportId}.pdf`);

      try {
        const pdfPath = await pdfGeneratorService.generatePdf(report, { ...opts, template: templateName }, requestedPdfPath as any);
        report.filePath = pdfPath; report.format = 'pdf';
        // best-effort persist metadata
        try { await mongoClient.saveReport(report.reportId, { reportId: report.reportId, format: 'pdf', path: pdfPath, summary: report.metrics, vulnerabilitiesCount: report.metrics.total }); } catch (e) { logger.debug('Mongo saveReport failed', { error: e }); }
        const pdfBuf = await fs.readFile(pdfPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${(report.projectName || 'report').replace(/[^a-zA-Z0-9]/g, '-')}.pdf"`);
        res.setHeader('X-Report-Id', report.reportId);
        return res.send(pdfBuf);
      } catch (e) {
        logger.error('PDF generation failed (createReport)', { error: e });
        res.status(502).json({ error: 'Failed to generate PDF', detail: String(e) });
        return;
      }

    } catch (error) {
      logger.error('Failed to handle createReport', { error });
      next(error);
    }
  };

  /**
   * POST /api/reports/generate-from-scan
   * Génère un rapport à partir des données MongoDB pour un scan_id
   */
  generateFromScan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    let reportId: string | null = null;

    try {
      const { scanId, format = 'pdf', options } = req.body;

      if (!scanId) {
        res.status(400).json({
          error: 'Missing scanId',
          message: 'Please provide a scanId in the request body'
        });
        return;
      }

      // Vérifier la connexion MongoDB
      if (!mongoClient.isConnected()) {
        await mongoClient.connect();
      }

      // Récupérer toutes les données du scan depuis MongoDB
      const scanData: any = await mongoClient.getAllResultsForScan(scanId);

      // DEBUG: Log what we got from MongoDB
      logger.info('[DEBUG generateFromScan] MongoDB scanData keys:', {
        keys: Object.keys(scanData || {}),
        hasApk: !!scanData.apk,
        hasSecrets: !!scanData.secrets,
        hasCrypto: !!scanData.crypto,
        hasNetwork: !!scanData.network,
        secretsCount: scanData.secrets?.secrets?.length || 0,
        cryptoCount: scanData.crypto?.vulnerabilities?.length || 0,
        networkCount: scanData.network?.analysis?.security_issues?.length || 0
      });

      if (!scanData.apk && !scanData.secrets && !scanData.crypto && !scanData.network) {
        res.status(404).json({
          error: 'Scan not found',
          message: `No results found for scan_id: ${scanId}`
        });
        return;
      }

      // Construire les scanResults à partir des données MongoDB
      const scanResults: any = {};

      // Convertir les résultats crypto
      if (scanData.crypto?.vulnerabilities) {
        scanResults.cryptoCheck = scanData.crypto.vulnerabilities.map((v: any) => ({
          ruleId: v.vulnerability || v.type || 'CRYPTO_ISSUE',
          severity: this.mapSeverityFromCWE(v.cwe) || this.mapSeverity(v.severity) || 'high',
          message: v.vulnerability || v.description || v.message,
          file: v.file || v.filePath,
          line: v.line || v.lineNumber || 1,
          recommendation: v.recommendation,
          cwe: v.cwe
        }));
      }

      // Convertir les résultats secrets
      if (scanData.secrets?.secrets) {
        scanResults.secretHunter = scanData.secrets.secrets.map((s: any) => ({
          ruleId: s.type || s.description?.substring(0, 50) || s.rule_id || 'SECRET_EXPOSED',
          severity: this.mapSeverity(s.severity) || 'high',
          message: s.description || s.match || `Secret found: ${s.type}`,
          file: s.file_path || s.file || s.filePath,
          line: s.line_number || s.line || 1
        }));
      }

      // Convertir les résultats network
      if (scanData.network?.analysis?.security_issues) {
        scanResults.networkInspector = scanData.network.analysis.security_issues.map((i: any) => ({
          ruleId: i.type || 'NETWORK_ISSUE',
          severity: this.mapSeverity(i.severity) || 'medium',
          message: i.description || i.message,
          file: i.file || 'network-analysis',
          line: i.line || 1
        }));
      }

      // Convertir les résultats APK (manifest issues)
      if (scanData.apk?.results?.manifest_issues) {
        scanResults.apkScanner = scanData.apk.results.manifest_issues.map((m: any) => ({
          ruleId: m.type || 'MANIFEST_ISSUE',
          severity: this.mapSeverity(m.severity) || 'medium',
          message: m.message,
          file: 'AndroidManifest.xml',
          line: 1
        }));
      }

      let projectName = scanData.apk?.results?.app_name ||
        scanData.apk?.results?.package_name ||
        `Scan ${scanId}`;
      // Normalize common placeholder names coming from upstream tools
      if (!projectName || projectName.trim() === '' || projectName === 'Unknown App') {
        projectName = `Scan ${scanId}`;
      }

      reportId = uuidv4();

      logger.info(`Starting report generation from MongoDB`, {
        reportId,
        scanId,
        projectName,
        format,
        resultsFound: {
          apk: !!scanData.apk,
          secrets: !!scanData.secrets,
          crypto: !!scanData.crypto,
          network: !!scanData.network
        }
      });

      // Créer la requête de génération
      const requestData: GenerateReportRequest = {
        projectName,
        scanId,
        scanResults,
        format,
        options
      };

      // DEBUG: Log transformed scanResults
      logger.info('[DEBUG generateFromScan] Transformed scanResults:', {
        keys: Object.keys(scanResults),
        cryptoCheckCount: scanResults.cryptoCheck?.length || 0,
        secretHunterCount: scanResults.secretHunter?.length || 0,
        networkInspectorCount: scanResults.networkInspector?.length || 0,
        apkScannerCount: scanResults.apkScanner?.length || 0
      });


      // Ensure project name isn't the placeholder 'Unknown App'
      const finalProjectName = (projectName && projectName.trim() && projectName !== 'Unknown App') ? projectName : `Scan ${scanId}`;

      // Créer le rapport initial avec statut "pending"
      const initialReport: Report = {
        reportId,
        projectName: finalProjectName,
        vulnerabilities: [],
        metrics: {
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          byCategory: {},
          securityScore: 100,
          topAffectedFiles: []
        },
        scanMetadata: {
          startTime: new Date().toISOString(),
          tools: Object.keys(scanResults)
        },
        generatedAt: new Date().toISOString(),
        format,
        status: 'pending'
      };

      reportsStore.set(reportId, initialReport);

      // Répondre immédiatement avec le statut pending
      res.status(202).json({
        reportId,
        scanId,
        status: 'pending',
        message: 'Report generation started from MongoDB data',
        dataFound: {
          apk: !!scanData.apk,
          secrets: scanData.secrets?.secrets?.length || 0,
          crypto: scanData.crypto?.vulnerabilities?.length || 0,
          network: scanData.network?.analysis?.security_issues?.length || 0
        }
      });

      // Continuer la génération en arrière-plan
      this.processReport(reportId, requestData).catch(error => {
        logger.error('Background report generation failed', { error, reportId });
      });

    } catch (error) {
      logger.error('Failed to generate report from scan', { error, reportId });
      next(error);
    }
  };

  /**
   * POST /api/reports/generate-json-from-scan
   * Génère immédiatement un rapport JSON pour un `scanId` et renvoie le JSON (synchronously)
   */
  generateJsonNow = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const { scanId, options = {} } = req.body;

      if (!scanId) {
        res.status(400).json({ error: 'Missing scanId' });
        return;
      }

      // Ensure mongo connection
      if (!mongoClient.isConnected()) await mongoClient.connect();

      const scanData: any = await mongoClient.getAllResultsForScan(scanId);

      if (!scanData.apk && !scanData.secrets && !scanData.crypto && !scanData.network) {
        res.status(404).json({ error: 'Scan not found', scanId });
        return;
      }

      // Build scanResults (reuse conversion logic)
      const scanResults: any = {};

      if (scanData.crypto?.vulnerabilities) {
        scanResults.cryptoCheck = scanData.crypto.vulnerabilities.map((v: any) => ({
          ruleId: v.vulnerability || v.type || 'CRYPTO_ISSUE',
          severity: this.mapSeverityFromCWE(v.cwe) || this.mapSeverity(v.severity) || 'high',
          message: v.vulnerability || v.description || v.message,
          file: v.file || v.filePath,
          line: v.line || v.lineNumber || 1,
          recommendation: v.recommendation,
          cwe: v.cwe
        }));
      }

      if (scanData.secrets?.secrets) {
        scanResults.secretHunter = scanData.secrets.secrets.map((s: any) => ({
          ruleId: s.rule_id || s.type || 'SECRET_EXPOSED',
          severity: this.mapSeverity(s.severity) || 'high',
          message: s.description || s.match || `Secret found: ${s.type}`,
          file: s.file_path || s.file || s.filePath,
          line: s.line_number || s.line || 1
        }));
      }

      if (scanData.network?.analysis?.security_issues) {
        scanResults.networkInspector = scanData.network.analysis.security_issues.map((i: any) => ({
          ruleId: i.type || 'NETWORK_ISSUE',
          severity: this.mapSeverity(i.severity) || 'medium',
          message: i.description || i.message,
          file: i.file || 'network-analysis',
          line: i.line || 1
        }));
      }

      if (scanData.apk?.results?.manifest_issues) {
        scanResults.apkScanner = scanData.apk.results.manifest_issues.map((m: any) => ({
          ruleId: m.type || 'MANIFEST_ISSUE',
          severity: this.mapSeverity(m.severity) || 'medium',
          message: m.message,
          file: 'AndroidManifest.xml',
          line: 1
        }));
      }

      let projectName = scanData.apk?.results?.app_name ||
        scanData.apk?.results?.package_name ||
        `Scan ${scanId}`;
      if (!projectName || projectName.trim() === '' || projectName === 'Unknown App') {
        projectName = `Scan ${scanId}`;
      }

      // Aggregate, deduplicate and compute metrics using existing services
      const aggregatedVulns = aggregatorService.aggregateResults(scanResults);
      const deduplicatedVulns = deduplicatorService.deduplicate(aggregatedVulns);
      const metrics = metricsService.calculateMetrics(deduplicatedVulns);

      const report: Report = {
        reportId: `immediate-${Date.now()}`,
        projectName,
        vulnerabilities: deduplicatedVulns,
        metrics,
        scanMetadata: {
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 0,
          tools: Object.keys(scanResults)
        },
        services: scanResults,
        generatedAt: new Date().toISOString(),
        format: 'json',
        status: 'completed'
      } as Report;

      // Use json exporter to build JSON string (without writing file)
      const jsonStr = jsonExporterService.getJsonData(report, {
        pretty: options.pretty === true,
        includeRawServiceOutput: options.includeRawServiceOutput === true,
        maxFindingsPerService: typeof options.maxFindingsPerService === 'number' ? options.maxFindingsPerService : undefined
      });

      res.setHeader('Content-Type', 'application/json');
      res.send(jsonStr);

    } catch (error) {
      logger.error('Failed to generate JSON report synchronously', { error });
      next(error);
    }
  };

  /**
   * POST /api/reports/pdf
   * Génère un PDF à la demande soit à partir d'un `reportId`, d'un `requestData` (scanResults) ou d'un `report` complet fourni dans le body
   */
  generatePdf = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const { reportId, requestData, report: providedReport, options = {} } = req.body;

      // If a complete report object is provided, generate PDF directly
      if (providedReport) {
        const pdfPath = await pdfGeneratorService.generatePdf(providedReport as Report, options as ReportOptions);
        const pdfBuf = await fs.readFile(pdfPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${(providedReport as any).projectName || 'report'}-security-report.pdf"`);
        res.send(pdfBuf);
        return;
      }

      // If a requestData (same shape as generateReport) is provided, process quickly and render
      if (requestData) {
        // Accept multiple incoming shapes: scanResults | results | services
        const rawServices = requestData.scanResults || requestData.results || requestData.services || {};

        const normalizedServiceResults: Record<string, any> = {};
        // Lazy-require the normalizer to avoid circular imports
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { normalizeFinding: nf } = require('../utils/normalizeFinding');

        for (const [k, v] of Object.entries(rawServices)) {
          // Accept arrays or single objects; normalize each finding via normalizeFinding
          let findings: any[] = [];
          if (Array.isArray(v)) findings = v as any[];
          else if (v && Array.isArray((v as any).findings)) findings = (v as any).findings;
          else if (v && Array.isArray((v as any).results)) findings = (v as any).results;
          else if (v && typeof v === 'object') findings = [v];

          normalizedServiceResults[k] = { findings: (findings || []).map((item: any) => nf(item, k)) };
        }

        // If the caller provided an explicit vulnerabilities list (e.g., full report payload), use it
        let aggregatedVulns: any[] = [];
        if (Array.isArray(requestData.vulnerabilities) && requestData.vulnerabilities.length > 0) {
          // Normalize provided vulnerabilities as a best-effort
          aggregatedVulns = requestData.vulnerabilities.map((f: any) => nf(f));
        } else {
          // Turn normalized service results into a simple map of arrays for aggregation
          const serviceArrays = Object.fromEntries(Object.entries(normalizedServiceResults).map(([k, v]) => [k, v.findings || []]));
          aggregatedVulns = aggregatorService.aggregateResults(serviceArrays);
        }

        const deduplicatedVulns = deduplicatorService.deduplicate(aggregatedVulns);

        // Prefer provided metrics when present, else compute
        const metrics = requestData.metrics || metricsService.calculateMetrics(deduplicatedVulns);
        logger.info('Computed metrics for on-demand request', { metrics, services: Object.keys(normalizedServiceResults) });

        const tempReport: Report = {
          reportId: `on-demand-${Date.now()}`,
          projectName: requestData.projectName || 'Report Security',
          vulnerabilities: deduplicatedVulns,
          metrics,
          scanMetadata: {
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 0,
            tools: Object.keys(normalizedServiceResults)
          },
          services: normalizedServiceResults,
          generatedAt: new Date().toISOString(),
          format: 'pdf',
          status: 'completed'
        } as Report;

        const pdfPath = await pdfGeneratorService.generatePdf(tempReport, options as ReportOptions);
        const pdfBuf = await fs.readFile(pdfPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${tempReport.projectName}-security-report.pdf"`);
        res.send(pdfBuf);
        return;
      }

      // If only reportId provided, try memory, then DB and possibly on-demand conversion
      if (!reportId) {
        res.status(400).json({ error: 'Missing reportId, requestData or report in request body' });
        return;
      }

      // Try in-memory report
      const memoryReport = reportsStore.get(reportId);
      if (memoryReport) {
        // If PDF exists already, return it
        if (memoryReport.filePath && memoryReport.format === 'pdf') {
          const buf = await fs.readFile(memoryReport.filePath);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${memoryReport.projectName}-security-report.pdf"`);
          res.send(buf);
          return;
        }

        // Otherwise generate PDF on-demand from the in-memory report
        try {
          const pdfPath = await pdfGeneratorService.generatePdf(memoryReport, options as ReportOptions);
          memoryReport.filePath = pdfPath;
          memoryReport.format = 'pdf';
          reportsStore.set(reportId, memoryReport);

          // Try persisting to DB (best-effort)
          try {
            await mongoClient.saveReport(reportId, {
              reportId: memoryReport.reportId,
              format: memoryReport.format,
              path: memoryReport.filePath,
              summary: memoryReport.metrics,
              vulnerabilitiesCount: memoryReport.metrics.total
            });
          } catch (e) {
            logger.warn('Failed to save generated PDF report metadata to MongoDB', { error: e, reportId });
          }

          const pdfBuf = await fs.readFile(pdfPath);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${memoryReport.projectName}-security-report.pdf"`);
          res.send(pdfBuf);
          return;
        } catch (e) {
          logger.error('On-demand PDF generation from memory report failed', { error: e, reportId });
          res.status(500).json({ error: 'Failed to generate PDF on-demand', reportId });
          return;
        }
      }

      // Fallback: check DB doc
      if (!mongoClient.isConnected()) await mongoClient.connect();
      const doc = await mongoClient.getReportById(reportId);
      if (!doc) {
        res.status(404).json({ error: 'Report not found', reportId });
        return;
      }

      const reportPath = doc.report_path;
      const reportFormat = doc.report_format;

      if (!reportPath) {
        res.status(404).json({ error: 'Report file path not found in DB', reportId });
        return;
      }

      // If PDF already stored, send it
      if (reportPath.endsWith('.pdf')) {
        const pdfBuf = await fs.readFile(reportPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.report_name || `report-${reportId}`}-security-report.pdf"`);
        res.send(pdfBuf);
        return;
      }

      // If JSON stored on disk, convert to PDF on-demand using jsonToPdfService
      if (reportPath.endsWith('.json')) {
        try {
          const outPdf = reportPath.replace(/\.json$/i, '.pdf');
          const pdfOut = await jsonToPdfService.convert(reportPath, outPdf, { template: (options as any)?.template });
          // Update DB with new PDF path (best-effort)
          try {
            await mongoClient.saveReport(doc.scan_id || reportId, {
              reportId: doc.report_id || reportId,
              format: 'pdf',
              path: pdfOut,
              summary: doc.summary,
              vulnerabilitiesCount: doc.vulnerabilities_count
            });
          } catch (e) { logger.warn('Failed to update DB after on-demand JSON->PDF conversion', { error: e, reportId }); }

          const pdfBuf = await fs.readFile(pdfOut);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${doc.report_name || `report-${reportId}`}-security-report.pdf"`);
          res.send(pdfBuf);
          return;
        } catch (e) {
          logger.error('On-demand JSON->PDF conversion failed', { error: e, reportId });
          res.status(500).json({ error: 'Failed to convert stored JSON to PDF', reportId });
          return;
        }
      }

      res.status(415).json({ error: 'Unsupported report format for PDF generation', reportId, format: reportFormat });

    } catch (error) {
      logger.error('Failed to handle generatePdf request', { error });
      next(error);
    }
  };

  /**
   * GET /api/reports/puppeteer-status
   * Check if Puppeteer/Chromium can be launched and return version/path
   */
  puppeteerStatus = async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const launchOptions: any = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
      if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      logger.info('Puppeteer status: launching browser', { launchOptions });
      const browser = await puppeteer.launch(launchOptions);
      logger.info('Puppeteer status: launched browser');
      const version = await browser.version();
      logger.info('Puppeteer status: version', { version });
      await browser.close();
      logger.info('Puppeteer status: closed browser');
      res.json({ ok: true, version });
    } catch (error) {
      logger.warn('Puppeteer status check failed', { error });
      console.error('Puppeteer status error', error && (error.stack || error.message || error));
      res.status(500).json({ ok: false, error: String(error) });
    }
  };

  /**
   * Helper pour mapper les sévérités
   */
  private mapSeverity(severity: string): string {
    const s = (severity || 'info').toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'high';
    if (s === 'medium' || s === 'moderate') return 'medium';
    if (s === 'low') return 'low';
    return 'info';
  }

  /**
   * Helper pour mapper les sévérités depuis CWE
   */
  private mapSeverityFromCWE(cwe: string): string | null {
    if (!cwe) return null;
    // CWE-327 (Broken Crypto), CWE-330 (Weak Random) = HIGH
    // CWE-798 (Hardcoded Credentials) = CRITICAL
    // CWE-321 (Hardcoded Key) = HIGH
    const highSeverityCWEs = ['CWE-327', 'CWE-330', 'CWE-321', 'CWE-295'];
    const criticalCWEs = ['CWE-798', 'CWE-259'];

    if (criticalCWEs.includes(cwe)) return 'critical';
    if (highSeverityCWEs.includes(cwe)) return 'high';
    return null;
  }

  /**
   * Traite la génération du rapport en arrière-plan
   */
  private async processReport(reportId: string, requestData: GenerateReportRequest): Promise<any> {
    const startTime = Date.now();

    try {
      // Mettre à jour le statut
      this.updateReportStatus(reportId, 'processing');

      // DEBUG: Log what we receive in processReport
      logger.info('[DEBUG processReport] requestData keys:', {
        keys: Object.keys(requestData || {}),
        hasServices: !!(requestData as any).services,
        hasScanResults: !!(requestData as any).scanResults,
        hasResults: !!(requestData as any).results,
        scanResultsKeys: Object.keys((requestData as any).scanResults || {}),
        scanResultsCryptoCount: ((requestData as any).scanResults?.cryptoCheck)?.length || 0,
        scanResultsSecretsCount: ((requestData as any).scanResults?.secretHunter)?.length || 0
      });

      // 1. Agréger les résultats de tous les outils
      logger.debug('Aggregating scan results', { reportId });

      // Accept multiple possible shapes: services | scanResults | results
      const rawServicesAll: any = (requestData.services as any) || (requestData.scanResults as any) || (requestData.results as any) || {};

      // Normalize each service into an array for aggregation
      const normalizedServiceArrays: Record<string, any[]> = Object.fromEntries(
        Object.entries(rawServicesAll).map(([k, v]) => {
          if (Array.isArray(v)) return [k, v];
          if (v && Array.isArray((v as any).findings)) return [k, (v as any).findings];
          if (v && Array.isArray((v as any).results)) return [k, (v as any).results];
          if (v && typeof v === 'object') return [k, [v]];
          return [k, []];
        })
      );

      let aggregatedVulns = aggregatorService.aggregateResults(normalizedServiceArrays);

      // If the requestData included an explicit vulnerabilities array, include it as well
      if (Array.isArray((requestData as any).vulnerabilities) && (requestData as any).vulnerabilities.length > 0) {
        aggregatedVulns = aggregatedVulns.concat((requestData as any).vulnerabilities);
      }

      // 2. Dédupliquer les vulnérabilités
      logger.debug('Deduplicating vulnerabilities', { reportId });
      const deduplicatedVulns = deduplicatorService.deduplicate(aggregatedVulns);

      // 3. Calculer les métriques
      logger.debug('Calculating metrics', { reportId });
      const metrics = metricsService.calculateMetrics(deduplicatedVulns);

      // 4. Préparer les options
      const options: ReportOptions = ReportOptionsSchema.parse(requestData.options || {});

      // 5. Construire le rapport complet
      const finalProjectName = (requestData.projectName && requestData.projectName.trim() && requestData.projectName !== ' Report Summary')
        ? requestData.projectName
        : (requestData.scanId ? `Scan ${requestData.scanId}` : `Report ${reportId}`);

      // Build per-service summaries to match the JSON->PDF page structure expected
      const servicesSummary: Record<string, any> = {};
      const rawServices: any = rawServicesAll; // use the normalized services object (services|scanResults|results)

      for (const [svcName, svcRaw] of Object.entries(rawServices)) {
        const svcKey = String(svcName);

        // Find vulnerabilities attributed to this service
        const svcVulns = deduplicatedVulns.filter(v => {
          try {
            if (v.source && String(v.source).toLowerCase().includes(svcKey.toLowerCase())) return true;
            if (Array.isArray(v.detectedBy) && v.detectedBy.some((d: string) => String(d).toLowerCase().includes(svcKey.toLowerCase()))) return true;
          } catch (e) { }
          return false;
        });

        const bySeverity = svcVulns.reduce((acc: Record<string, number>, v) => {
          const sev = (v.severity || 'info') as string;
          acc[sev] = (acc[sev] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const topFindings = svcVulns.slice(0, options.maxFindingsPerService || 10).map(v => ({
          id: v.id,
          title: v.title,
          description: v.description,
          file: v.location?.file,
          severity: v.severity,
          recommendation: v.recommendation
        }));

        servicesSummary[svcKey] = {
          totalFindings: svcVulns.length,
          bySeverity,
          findings: topFindings,
          topFindings,
          raw: svcRaw,
          rawString: (() => { try { return JSON.stringify(svcRaw, null, 2); } catch (e) { return String(svcRaw); } })(),
          // convenience fields used by the PDF flow
          total: svcVulns.length,
          top: topFindings
        };
      }

      // priority recommendations based on computed metrics and vulnerabilities
      const priorityRecommendations = metricsService.generatePriorityRecommendations(deduplicatedVulns, metrics);

      const report: Report = {
        reportId,
        projectName: finalProjectName,
        vulnerabilities: deduplicatedVulns,
        metrics,
        scanMetadata: {
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: Math.round((Date.now() - startTime) / 1000),
          tools: this.extractToolNames(requestData.scanResults)
        },
        // Include enriched per-service summaries (for template rendering)
        services: servicesSummary,
        priorityRecommendations,
        generatedAt: new Date().toISOString(),
        format: requestData.format,
        status: 'processing'
      };

      // Debug: log what services we attached to the report
      logger.info('Constructed report, services keys', { reportId, services: Object.keys(report.services || {}) });

      // DEBUG: Log the structure of each service
      logger.info('[DEBUG processReport] Services structure:', {
        reportId,
        servicesKeys: Object.keys(report.services || {}),
        cryptoFindings: report.services?.cryptoCheck?.findings?.length || 0,
        secretsFindings: report.services?.secretHunter?.findings?.length || 0,
        networkFindings: report.services?.networkInspector?.findings?.length || 0,
        apkFindings: report.services?.apkScanner?.findings?.length || 0
      });


      // 6. Générer le fichier selon le format demandé
      let filePath: string;

      try {
        switch (requestData.format) {
          case 'pdf':
            // Attempt to generate PDF using Puppeteer/Handlebars templates
            try {
              filePath = await pdfGeneratorService.generatePdf(report, options);
              report.format = 'pdf';
            } catch (pdfErr) {
              logger.warn('PDF generation failed, falling back to JSON export', { reportId, error: String(pdfErr) });
              report.format = 'json';
              filePath = await jsonExporterService.exportToJson(report, {
                pretty: true,
                includeRawData: options.includeRawFindings,
                includeRawServiceOutput: options.includeRawServiceOutput,
                maxFindingsPerService: options.maxFindingsPerService
              });
            }
            break;
          case 'json':
            filePath = await jsonExporterService.exportToJson(report, {
              pretty: true,
              includeRawData: options.includeRawFindings,
              includeRawServiceOutput: options.includeRawServiceOutput,
              maxFindingsPerService: options.maxFindingsPerService
            });
            break;
          case 'sarif':
            filePath = await sarifExporterService.exportToSarif(report);
            break;
          default:
            throw new Error(`Unsupported format: ${requestData.format}`);
        }
      } catch (err) {
        throw err;
      }

      // 7. Mettre à jour le rapport avec le statut final
      report.status = 'completed';
      report.filePath = filePath;
      report.scanMetadata.duration = Math.round((Date.now() - startTime) / 1000);

      reportsStore.set(reportId, report);

      // 8. Sauvegarder dans MongoDB
      try {
        await mongoClient.saveReport(requestData.scanId || reportId, {
          reportId: report.reportId,
          format: report.format,
          path: report.filePath,
          summary: report.metrics,
          vulnerabilitiesCount: report.metrics.total
        });

        // Update Scan Stage to completed
        if (requestData.scanId) {
          await mongoClient.updateScanStage(requestData.scanId, 'completed');
        }

        logger.info('Report saved to MongoDB', { reportId, scanId: requestData.scanId });
      } catch (dbError) {
        logger.warn('Failed to save report to MongoDB', { error: dbError, reportId });
      }

      logger.info('Report generation completed', {
        reportId,
        format: requestData.format,
        duration: report.scanMetadata.duration,
        vulnerabilities: metrics.total
      });

    } catch (error) {
      logger.error('Report generation failed', { error, reportId });

      // Mettre à jour le statut en échec
      const existingReport = reportsStore.get(reportId);
      if (existingReport) {
        existingReport.status = 'failed';
        existingReport.error = error instanceof Error ? error.message : 'Unknown error';
        reportsStore.set(reportId, existingReport);
      }

      // Update Scan Stage to failed
      if (requestData.scanId) {
        try {
          await mongoClient.updateScanStage(requestData.scanId, 'failed');
        } catch (e) {
          logger.error('Failed to update scan stage to failed', { error: e });
        }
      }
    }
  }

  /**
   * GET /api/reports/:reportId
   * Récupère les informations d'un rapport
   */
  getReportInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;

      const report = reportsStore.get(reportId);

      if (!report) {
        res.status(404).json({
          error: 'Report not found',
          reportId
        });
        return;
      }

      // Retourner les infos sans les vulnérabilités complètes
      res.json({
        reportId: report.reportId,
        projectName: report.projectName,
        status: report.status,
        format: report.format,
        metrics: report.status === 'completed' ? report.metrics : undefined,
        scanMetadata: report.scanMetadata,
        generatedAt: report.generatedAt,
        error: report.error
      });

    } catch (error) {
      logger.error('Failed to get report info', { error });
      next(error);
    }
  };

  /**
   * GET /api/reports/:reportId/summary
   * Returns the full JSON summary (including per-service details) without forcing a download
   */
  getReportSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;
      const pretty = String(req.query.pretty) === 'true';
      const includeRawServiceOutput = String(req.query.includeRawServiceOutput) === 'true';
      const maxFindingsPerService = req.query.maxFindingsPerService ? parseInt(String(req.query.maxFindingsPerService), 10) : undefined;

      // Try memory first
      let report = reportsStore.get(reportId);

      if (!report) {
        // Fallback: try DB record and file
        if (!mongoClient.isConnected()) await mongoClient.connect();
        const doc = await mongoClient.getReportById(reportId);
        if (!doc) {
          res.status(404).json({ error: 'Report not found', reportId });
          return;
        }

        const reportPath = doc.report_path;
        if (!reportPath) {
          res.status(404).json({ error: 'Report file path not found', reportId });
          return;
        }

        // If it's JSON on disk, read and return it
        if (reportPath.endsWith('.json')) {
          const json = await fs.readFile(reportPath, 'utf-8');
          const parsed = JSON.parse(json);
          res.setHeader('Content-Type', 'application/json');
          res.send(pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed));
          return;
        }

        // otherwise, we cannot reconstruct the full JSON easily
        res.status(404).json({ error: 'Report JSON not available', reportId });
        return;
      }

      // Use exporter to build JSON summary with chosen options
      const jsonStr = jsonExporterService.getJsonData(report, {
        pretty,
        includeRawData: false,
        includeRawServiceOutput,
        maxFindingsPerService
      } as any);

      res.setHeader('Content-Type', 'application/json');
      res.send(jsonStr);

    } catch (error) {
      logger.error('Failed to get report summary', { error });
      next(error);
    }
  };

  /**
   * GET /api/reports/:reportId/download
   * Télécharge le fichier du rapport
   */
  downloadReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;
      let reportPath: string | null = null;
      let reportFormat: string = 'pdf';
      let projectName: string = 'Report Security';

      // Check memory first
      const memoryReport = reportsStore.get(reportId);
      if (memoryReport && memoryReport.filePath) {
        reportPath = memoryReport.filePath;
        reportFormat = memoryReport.format;
        projectName = memoryReport.projectName;
      } else {
        // Fallback to MongoDB
        if (!mongoClient.isConnected()) await mongoClient.connect();
        // Since getReport searches by scanId, but we need by reportId, we might need a better query
        // Actually safeReport uses upsert on scan_id. 
        // We probably stored report_id in the doc.
        // Let's rely on listReports approach or add getReportById
        // For now, let's assume valid file path check if we can find it via scan metadata?
        // Actually, let's look at listReports first.
        // If we change listReports to return mongo docs, frontend has reportId.
        // We need a way to look up specific report by reportId in Mongo.
        // The current mongoClient.getReport(scanId) is limited.
        // Let's blindly try to find the file if we can't find the record? No.
        // Let's implement a quick lookup in the collection directly here or update MongoDB class.
        // Access collection directly if possible or iterate?
        // Better: Update MongoDBClient to support getReportByReportId.
        // But for this patch, let's access collection via public getter if available?
        // mongoClient.reportsCollection is public but explicit helper is cleaner
        const doc = await mongoClient.getReportById(reportId);
        if (doc) {
          const d = doc as any; // Force cast
          // MongoDB stores path as 'path' (not 'report_path') and format as 'format' (not 'report_format')
          reportPath = d.path || d.report_path || null;
          reportFormat = d.format || d.report_format || 'json';
          projectName = d.projectName || d.project_name || `Report-${reportId}`;
        }
      }

      if (!reportPath) {
        res.status(404).json({ error: 'Report not found (Memory/DB miss)', reportId });
        return;
      }

      // If the client requests a PDF but we only have JSON, generate PDF on-demand from the JSON data
      if ((String(req.query.forcePdf) === 'true' || String(req.query.inline) === 'true') && reportFormat === 'json') {
        try {
          logger.info('On-demand PDF generation from JSON report', { reportId, reportPath });
          const jsonContent = await fs.readFile(reportPath, 'utf8');
          const reportData = JSON.parse(jsonContent) as Report;
          const pdfPath = await pdfGeneratorService.generatePdf(reportData, {});
          const pdfBuf = await fs.readFile(pdfPath);
          const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `${disposition}; filename="${reportData.projectName || projectName}-security-report.pdf"`);
          res.send(pdfBuf);
          return;
        } catch (pdfErr) {
          logger.error('On-demand PDF generation from JSON failed', { error: pdfErr, reportId });
          res.status(500).json({ error: 'Failed to generate PDF from JSON report', reportId });
          return;
        }
      }

      if (memoryReport && (memoryReport.status === 'pending' || memoryReport.status === 'processing')) {
        res.status(202).json({
          error: 'Report is still being generated',
          status: memoryReport.status,
          reportId
        });
        return;
      }

      // Skip status check if loaded from DB (assumed completed)
      if (memoryReport && memoryReport.status === 'failed') {
        res.status(500).json({
          error: 'Report generation failed',
          details: memoryReport.error,
          reportId
        });
        return;
      }

      if (!reportPath) {
        res.status(500).json({ error: 'Report file path missing', reportId });
        return;
      }
      // Vérifier que le fichier existe
      try {
        await fs.access(reportPath);
      } catch {
        res.status(404).json({
          error: 'Report file has been deleted or moved',
          reportId
        });
        return;
      }

      // Déterminer le type MIME et l'extension
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        json: 'application/json',
        sarif: 'application/json'
      };

      const contentType = mimeTypes[reportFormat] || 'application/octet-stream';
      const extension = reportFormat === 'sarif' ? 'sarif.json' : reportFormat;
      const filename = `${projectName}-security-report.${extension}`;

      // Envoyer le fichier
      const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

      const fileContent = await fs.readFile(reportPath);
      res.send(fileContent);

      logger.info('Report downloaded', { reportId, format: reportFormat });

    } catch (error) {
      logger.error('Failed to download report', { error });
      next(error);
    }
  };

  /**
   * GET /api/reports/:reportId/view
   * Serves the HTML snapshot of the report directly in the browser (no Puppeteer needed).
   * Falls back to an inline-rendered HTML page when the .html file is missing.
   */
  viewReportHtml = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;

      // 1. Try to serve the pre-generated HTML snapshot
      const htmlPath = path.join(this.tempDir, `report-${reportId}.html`);
      try {
        await fs.access(htmlPath);
        const html = await fs.readFile(htmlPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      } catch {
        // HTML file not found — fall through to rebuild from data
      }

      // 2. Try to reconstruct from memory store
      let report: Report | null = reportsStore.get(reportId) || null;

      // 3. Try MongoDB
      if (!report) {
        if (!mongoClient.isConnected()) await mongoClient.connect();
        const doc = await mongoClient.getReportById(reportId);
        if (doc) {
          const filePath: string = doc.path || doc.report_path || '';
          if (filePath && filePath.endsWith('.json')) {
            try {
              const jsonContent = await fs.readFile(filePath, 'utf8');
              report = JSON.parse(jsonContent) as Report;
            } catch {
              // Can't read JSON file
            }
          }
        }
      }

      if (!report) {
        res.status(404).send('<h1>Report not found</h1>');
        return;
      }

      // 4. Regenerate the HTML using the Handlebars template
      const templateName = 'security_report';
      const templateCandidates = [
        path.join(__dirname, '..', 'templates', `${templateName}.html`),
        path.join(process.cwd(), 'src', 'templates', `${templateName}.html`)
      ];
      const cssCandidates = [
        path.join(__dirname, '..', 'templates', 'assets', 'css', 'security_report.css'),
        path.join(process.cwd(), 'src', 'templates', 'assets', 'css', 'security_report.css')
      ];

      let templatePath: string | null = null;
      for (const p of templateCandidates) {
        try { await fs.access(p); templatePath = p; break; } catch { /* continue */ }
      }

      let cssContent = '';
      for (const c of cssCandidates) {
        try { cssContent = await fs.readFile(c, 'utf8'); break; } catch { /* continue */ }
      }

      if (!templatePath) {
        res.status(500).send('<h1>Report template not found</h1>');
        return;
      }

      const Handlebars = require('handlebars');
      const tplRaw = await fs.readFile(templatePath, 'utf8');
      const tpl = Handlebars.compile(tplRaw);

      const data = {
        projectName: report.projectName || reportId,
        generatedAt: report.generatedAt || new Date().toISOString(),
        metrics: report.metrics || {},
        vulnerabilities: report.vulnerabilities || [],
        services: report.services || {},
        riskLevel: (report.metrics?.securityScore != null && report.metrics.securityScore < 50) ? 'High' : 'Medium',
        inlineStyle: cssContent ? `<style>${cssContent}</style>` : '',
        cssUrl: undefined,
      };

      const html = tpl(data);
      // Cache the freshly generated HTML for future requests
      await fs.writeFile(htmlPath, html, 'utf8').catch(() => { /* non-fatal */ });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);

    } catch (error) {
      logger.error('Failed to view report HTML', { error });
      next(error);
    }
  };


  /**
   * GET /api/reports/:reportId/vulnerabilities
   * Récupère la liste des vulnérabilités d'un rapport
   */

  getVulnerabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;
      const { severity, category, page = '1', limit = '20' } = req.query;

      const report = reportsStore.get(reportId);

      if (!report) {
        res.status(404).json({
          error: 'Report not found',
          reportId
        });
        return;
      }

      if (report.status !== 'completed') {
        res.status(202).json({
          error: 'Report is not ready',
          status: report.status
        });
        return;
      }

      // Filtrer les vulnérabilités
      let vulnerabilities = [...report.vulnerabilities];

      if (severity && typeof severity === 'string') {
        vulnerabilities = vulnerabilities.filter(v => v.severity === severity);
      }

      if (category && typeof category === 'string') {
        vulnerabilities = vulnerabilities.filter(v => v.category === category);
      }

      // Pagination
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;

      const paginatedVulns = vulnerabilities.slice(startIndex, endIndex);

      res.json({
        total: vulnerabilities.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(vulnerabilities.length / limitNum),
        data: paginatedVulns
      });

    } catch (error) {
      logger.error('Failed to get vulnerabilities', { error });
      next(error);
    }
  };

  /**
   * DELETE /api/reports/:reportId
   * Supprime un rapport
   */
  deleteReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;

      const report = reportsStore.get(reportId);

      if (!report) {
        res.status(404).json({
          error: 'Report not found',
          reportId
        });
        return;
      }

      // Supprimer le fichier si existant
      if (report.filePath) {
        try {
          await fs.unlink(report.filePath);
        } catch (error) {
          logger.warn('Failed to delete report file', { error, filePath: report.filePath });
        }
      }

      // Supprimer du store
      reportsStore.delete(reportId);

      res.status(204).send();

      logger.info('Report deleted', { reportId });

    } catch (error) {
      logger.error('Failed to delete report', { error });
      next(error);
    }
  };

  /**
   * GET /api/reports
   * Liste tous les rapports
   */
  listReports = async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      // Fetch from MongoDB for persistence
      if (!mongoClient.isConnected()) await mongoClient.connect();
      const docs = await mongoClient.getAllReports(100);

      const reports = docs.map(doc => ({
        reportId: doc.report_id,
        // Project name might be missing in DB save, fallback or fetch scan
        projectName: doc.project_name || doc.projectName || doc.scan_id || 'Report Security',
        status: doc.status || 'completed',
        format: doc.format || doc.report_format || 'json',
        generatedAt: doc.created_at || doc.updated_at || new Date().toISOString(),
        scanId: doc.scan_id,
        metrics: {
          total: doc.vulnerabilities_count || doc.summary?.total || 0,
          securityScore: doc.summary?.securityScore || 0
        }
      }));

      // Merge with memory store for latest status on active jobs?
      // For simplicity, just return DB records as they are "completed" usually.
      // If pending, they might not be in DB yet? 
      // saveReport is called on completion.
      // So pending jobs are ONLY in memory.
      // We should append memory-only jobs.

      const memoryReports = Array.from(reportsStore.values()).filter(r => !docs.find(d => d.report_id === r.reportId));
      const memoryMapped = memoryReports.map(report => ({
        reportId: report.reportId,
        projectName: report.projectName,
        status: report.status,
        format: report.format,
        generatedAt: report.generatedAt,
        metrics: { total: report.metrics.total, securityScore: report.metrics.securityScore }
      }));

      const allReports = [...reports, ...memoryMapped];

      // Sort by date desc
      allReports.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

      res.json({
        total: allReports.length,
        data: allReports
      });

    } catch (error) {
      logger.error('Failed to list reports', { error });
      next(error);
    }
  };

  /**
   * Extrait les noms des outils depuis les résultats de scan
   */
  private extractToolNames(scanResults: GenerateReportRequest['scanResults']): string[] {
    try {
      const tools = new Set<string>();
      if (!scanResults || typeof scanResults !== 'object') return [];

      if (Array.isArray((scanResults as any).sast)) {
        (scanResults as any).sast.forEach((s: any) => s && s.tool && tools.add(s.tool));
      }
      if (Array.isArray((scanResults as any).sca)) {
        (scanResults as any).sca.forEach((s: any) => s && s.tool && tools.add(s.tool));
      }
      if (Array.isArray((scanResults as any).secrets)) {
        (scanResults as any).secrets.forEach((s: any) => s && s.tool && tools.add(s.tool));
      }
      if (Array.isArray((scanResults as any).dast)) {
        (scanResults as any).dast.forEach((s: any) => s && s.tool && tools.add(s.tool));
      }

      // Fallback: if the incoming scanResults is a map of serviceName -> array/object,
      // include those keys as inferred tool names (e.g., 'secrets', 'crypto', 'network')
      for (const k of Object.keys(scanResults)) {
        if (['sast', 'sca', 'secrets', 'dast'].includes(k)) continue;
        const v = (scanResults as any)[k];
        if (Array.isArray(v) && v.length > 0) {
          tools.add(k);
        } else if (v && typeof v === 'object' && Object.keys(v).length > 0) {
          tools.add(k);
        }
      }

      return Array.from(tools);
    } catch (e: any) {
      logger.warn('extractToolNames failed', { error: String(e), scanResults: (scanResults && typeof scanResults === 'object') ? Object.keys(scanResults) : typeof scanResults });
      return [];
    }
  }

  /**
   * Met à jour le statut d'un rapport
   */
  private updateReportStatus(reportId: string, status: ReportStatus): void {
    const report = reportsStore.get(reportId);
    if (report) {
      report.status = status;
      reportsStore.set(reportId, report);
    }
  }

  /**
   * Nettoie les rapports expirés
   */
  async cleanupExpiredReports(): Promise<number> {
    const retentionHours = parseInt(process.env.REPORT_RETENTION_HOURS || '24', 10);
    const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const [reportId, report] of reportsStore.entries()) {
      const reportTime = new Date(report.generatedAt).getTime();

      if (reportTime < cutoffTime) {
        // Supprimer le fichier
        if (report.filePath) {
          try {
            await fs.unlink(report.filePath);
          } catch {
            // Ignorer si le fichier n'existe pas
          }
        }

        // Supprimer du store
        reportsStore.delete(reportId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} expired reports`);
    }

    return deletedCount;
  }
}

export const reportController = new ReportController();
