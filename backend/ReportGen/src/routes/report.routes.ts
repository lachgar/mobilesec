import { Router } from 'express';
import { reportController, uploadMiddleware } from '../controllers/report.controller';

const router = Router();

/**
 * @swagger
 * /api/reports/generate:
 *   post:
 *     summary: Génère un nouveau rapport de sécurité
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectName
 *               - scanResults
 *             properties:
 *               projectName:
 *                 type: string
 *                 example: "MonApplication"
 *               scanId:
 *                 type: string
 *                 example: "38d1e1e8-7fdc-408f-b8c8-08edf12f04ae"
 *               format:
 *                 type: string
 *                 enum: [pdf, json, sarif]
 *                 default: json
 *               scanResults:
 *                 type: object
 *                 properties:
 *                   sast:
 *                     type: array
 *                     items:
 *                       type: object
 *                   secrets:
 *                     type: array
 *                     items:
 *                       type: object
 *                   sca:
 *                     type: array
 *                     items:
 *                       type: object
 *                   dast:
 *                     type: array
 *                     items:
 *                       type: object
 *     responses:
 *       200:
 *         description: Rapport en cours de génération
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reportId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Erreur de validation
 */
router.post('/generate', reportController.generateReport);

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Génère un rapport (PDF / JSON / SARIF) à partir de résultats fournis
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateReportRequest'
 *     responses:
 *       200:
 *         description: Rapport généré (PDF binary for format=pdf, JSON for json/sarif)
 */
router.post('/', reportController.createReport);

/**
 * @swagger
 * /api/reports/pdf:
 *   post:
 *     summary: Génère ou retourne un PDF à la demande (accepts reportId, requestData or report in body)
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reportId:
 *                 type: string
 *               requestData:
 *                 type: object
 *               report:
 *                 type: object
 *               options:
 *                 type: object
 *     responses:
 *       200:
 *         description: PDF generated or returned
 */
router.post('/pdf', reportController.generatePdf);

/**
 * @swagger
 * /api/reports/upload:
 *   post:
 *     summary: Génère un rapport à partir d'un fichier JSON uploadé
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Rapport généré avec succès
 */
router.post('/upload', uploadMiddleware.single('file'), reportController.generateFromFile);

/**
 * @swagger
 * /api/reports/generate-from-folder:
 *   post:
 *     summary: Génère un rapport à partir des fichiers JSON dans le dossier input
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectName
 *             properties:
 *               projectName:
 *                 type: string
 *               format:
 *                 type: string
 *                 enum: [pdf, json, sarif]
 *               clearAfterGeneration:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Rapport généré avec succès
 */
router.post('/generate-from-folder', reportController.generateFromFolder);

/**
 * @swagger
 * /api/reports/generate-from-scan:
 *   post:
 *     summary: Génère un rapport à partir des données MongoDB pour un scan_id
 *     tags: [Reports]
 *     description: Lit automatiquement les résultats de CryptoCheck, SecretHunter, NetworkInspector depuis MongoDB
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scanId
 *             properties:
 *               scanId:
 *                 type: string
 *                 example: "38d1e1e8-7fdc-408f-b8c8-08edf12f04ae"
 *               format:
 *                 type: string
 *                 enum: [pdf, json, sarif]
 *                 default: json
 *     responses:
 *       200:
 *         description: Rapport généré avec succès
 *       404:
 *         description: Scan non trouvé
 */
router.post('/generate-from-scan', reportController.generateFromScan);

// Synchronous JSON generation endpoint
router.post('/generate-json-from-scan', reportController.generateJsonNow);

// Puppeteer health check
router.get('/status/puppeteer', reportController.puppeteerStatus);

/**
 * @swagger
 * /api/reports/input-files:
 *   get:
 *     summary: Liste les fichiers présents dans le dossier input
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Liste des fichiers
 */
router.get('/input-files', reportController.listInputFiles);

/**
 * @swagger
 * /api/reports/input-files:
 *   delete:
 *     summary: Vide le dossier input
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Dossier vidé
 */
router.delete('/input-files', reportController.clearInputFiles);

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Liste tous les rapports générés
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Numéro de page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Nombre de résultats par page
 *     responses:
 *       200:
 *         description: Liste des rapports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 data:
 *                   type: array
 */
router.get('/', reportController.listReports);

/**
 * @swagger
 * /api/reports/{reportId}:
 *   get:
 *     summary: Récupère les informations d'un rapport
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Informations du rapport
 *       404:
 *         description: Rapport non trouvé
 */
router.get('/:reportId', reportController.getReportInfo);

// Summary JSON endpoint (including per-service details when available)
router.get('/:reportId/summary', reportController.getReportSummary);

/**
 * @swagger
 * /api/reports/{reportId}/download:
 *   get:
 *     summary: Télécharge le fichier du rapport
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fichier du rapport
 *       404:
 *         description: Rapport non trouvé
 */
router.get('/:reportId/download', reportController.downloadReport);

/**
 * @swagger
 * /api/reports/{reportId}/view:
 *   get:
 *     summary: Affiche le rapport HTML directement dans le navigateur (sans Puppeteer)
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: HTML report page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       404:
 *         description: Rapport non trouvé
 */
router.get('/:reportId/view', reportController.viewReportHtml);


/**
 * @swagger
 * /api/reports/{reportId}/vulnerabilities:
 *   get:
 *     summary: Récupère les vulnérabilités d'un rapport avec pagination
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [critical, high, medium, low, info]
 *     responses:
 *       200:
 *         description: Liste des vulnérabilités
 *       404:
 *         description: Rapport non trouvé
 */
router.get('/:reportId/vulnerabilities', reportController.getVulnerabilities);

/**
 * @swagger
 * /api/reports/{reportId}:
 *   delete:
 *     summary: Supprime un rapport
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Rapport supprimé
 *       404:
 *         description: Rapport non trouvé
 */
router.delete('/:reportId', reportController.deleteReport);

export default router;
