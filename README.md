🛡️ MobileSec — Android APK Vulnerability Analysis and Remediation Platform
MobileSec is a microservices-based platform for static security analysis of Android APK files. It combines specialized vulnerability detectors, a LightGBM-based prioritization service, AI-assisted remediation suggestions, and multi-format reporting to support Android security assessment and DevSecOps workflows.
> **Note**: MobileSec is mainly a static-analysis platform. AI-assisted remediation and ML-based prioritization are decision-support components; their outputs should be reviewed by a security analyst before being used in production.
---
🎯 Features
Core Security Scanning
APK analysis — Static analysis of Android applications and extraction of manifest, permissions, resources, endpoints, and metadata.
Cryptographic checks — Detection of weak algorithms, insecure modes, hardcoded keys, unsafe IVs, and crypto misuse patterns.
Secret detection — Identification of exposed API keys, tokens, passwords, private keys, and other sensitive strings.
Network analysis — Detection of insecure endpoints, cleartext traffic, weak TLS configurations, and risky communication patterns.
Prioritization and Remediation
LightGBM-based prioritization — Predicts operational remediation categories and ranks findings with confidence scores.
AI-assisted fix suggestions — Uses the OpenRouter API to generate explanations, mitigation guidance, and Java/Kotlin-oriented remediation examples.
Smart ranking — Helps analysts focus first on the findings with the highest remediation priority.
Code-oriented guidance — Provides suggested patches and implementation guidance that should be reviewed before use.
Reporting and Visualization
PDF reports — Human-readable reports with executive summaries and detailed findings.
JSON export — Machine-readable output for automation and downstream processing.
SARIF export — Static-analysis output format suitable for DevSecOps and code-scanning workflows.
Dashboard — Real-time scan status, vulnerability statistics, severity distribution, and scan history.
Detailed findings — File paths, line references when available, vulnerability descriptions, and remediation hints.
---
🏗️ Architecture
MobileSec is organized as a set of independently deployable services coordinated through Docker Compose, MongoDB, and Kafka.
```text
┌─────────────┐
│ FRONTEND    │ React/Vite dashboard
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ API GATEWAY │ / CI-CONNECTOR (Port 3000)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ APK-SCANNER │ (Port 5000) - APK preprocessing and artifact extraction
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   KAFKA     │ Event-based orchestration
└──────┬──────┘
       │
   ┌───┴────────┬──────────────┬──────────────┬──────────────┐
   ▼            ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│CRYPTO  │  │SECRET    │  │NETWORK   │  │ ML-MODEL │
│CHECK   │  │HUNTER    │  │INSPECTOR │  │LightGBM  │
└───┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
    │            │             │             │
    └────────────┴─────────────┴─────────────┘
                         │
                         ▼
                  ┌────────────┐
                  │  MongoDB   │ Persistent scan results
                  └─────┬──────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌────────────────┐          ┌────────────────┐
│   REPORTGEN    │          │   FIXSUGGEST   │
│ PDF/JSON/SARIF │          │ AI suggestions │
│   Port 3005    │          │   Port 8000    │
└────────────────┘          └────────────────┘
```
Technology Stack
Backend: Node.js, Python, FastAPI, Flask, Java/Spring Boot
Frontend: React, Vite
Machine learning: LightGBM, scikit-learn
AI integration: OpenRouter API
Database: MongoDB
Messaging: Apache Kafka
Containerization: Docker, Docker Compose
---
🚀 Quick Start
Prerequisites
Docker and Docker Compose
Node.js 18+ for frontend development
8 GB RAM or more recommended
OpenRouter API key for AI-assisted remediation
1. Clone the Repository
```bash
git clone https://github.com/lachgar/mobilesec.git
cd mobilesec
git checkout dev
```
2. Configure Environment Variables
```bash
cd backend
cp .env.example .env
```
Edit `.env` and add the required values. Do not commit real secrets to the repository.
```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
MONGODB_URI=mongodb://mongodb:27017/mobilesec
KAFKA_BROKERS=kafka:9092
```
3. Start Backend Services
```bash
cd backend
docker compose up -d --build
```
4. Start the Frontend
Open a new terminal:
```bash
cd frontend
npm install
npm run dev
```
5. Access the Platform
Frontend: `http://localhost:3006`
API Gateway / CI Connector: `http://localhost:3000`
FixSuggest API: `http://localhost:8000/docs`
ML Model API: `http://localhost:8001/docs`
ReportGen Service: `http://localhost:3005`
MongoDB Express: `http://localhost:8081`
---
📖 Usage
Scan an APK
Open the frontend dashboard.
Upload or drag and drop an `.apk` file.
Wait for the scan pipeline to complete.
Open the scan details page to inspect vulnerabilities, categories, severity levels, and the security score.
Review Prioritized Findings
Open the AI suggestions or prioritization view.
Review the LightGBM-ranked remediation categories.
Inspect confidence scores and associated findings.
Validate the suggested priority manually before applying remediation.
Generate Reports
From the scan details page, generate or download reports in the supported formats:
PDF for human-readable reporting
JSON for machine-readable processing
SARIF for integration with static-analysis and DevSecOps workflows
Use AI-Assisted Remediation
For selected findings, FixSuggest can generate:
a vulnerability explanation;
remediation steps;
Java/Kotlin-oriented code examples;
suggested imports or configuration changes.
Generated suggestions are intended to support analysts and developers. They should be reviewed, tested, and adapted before being merged into production code.
---
🔧 Configuration
OpenRouter API Setup
MobileSec uses OpenRouter to access LLM-based remediation suggestions.
Example configuration in `.env`:
```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```
Do not store real API keys directly in `docker-compose.yml` or in committed source files. Use `.env` or your deployment secret manager.
Adjusting the Number of AI Suggestions
The number of generated suggestions can be changed in the frontend service call or backend configuration, depending on the deployed version. For example:
```javascript
const response = await fixSuggestService.getMLPrioritizedSuggestions(scanId, 20);
```
---
🧪 Development
Run Tests
```bash
# ReportGen tests
cd backend/ReportGen
npm test

# Frontend tests
cd frontend
npm test
```
Build for Production
```bash
# Frontend production build
cd frontend
npm run build

# Backend production containers
cd ../backend
docker compose -f docker-compose.prod.yml up -d --build
```
Debugging
```bash
# View logs
docker logs fixsuggest --tail 100 --follow
docker logs ml-model --tail 100 --follow
docker logs reportgen --tail 100 --follow

# Restart a service
docker compose restart fixsuggest

# Stop all services
docker compose down
```
---
📊 API Documentation
FixSuggest API
Swagger UI: `http://localhost:8000/docs`
Main endpoints:
`POST /api/v1/suggest/ml-priority` — ML-prioritized suggestions
`GET /api/v1/suggest/scan/{scan_id}` — Suggestions for a scan
`GET /health` — Health check
ML Model API
Swagger UI: `http://localhost:8001/docs`
Main endpoints:
`POST /api/v1/prioritize` — Prioritize vulnerabilities
`POST /api/v1/predict/{scan_id}` — Predict remediation categories
`GET /health` — Health check
ReportGen API
Service: `http://localhost:3005`
Supported outputs:
PDF
JSON
SARIF
---
🔁 Reproducibility
For reproducible experiments, use a tagged release of the repository and keep the following information with each experiment:
Git commit hash or release tag;
Docker Compose configuration;
APK dataset or benchmark name;
scan date and service versions;
exported JSON/SARIF reports;
LightGBM model version and feature schema.
Recommended release workflow:
```bash
git tag v1.0.0
git push origin v1.0.0
```
A long-term archive such as Zenodo or Software Heritage can be used to preserve a citable snapshot of the code.
---
⚠️ Security Notes
Never commit real API keys, database passwords, JWT secrets, or private tokens.
Revoke and rotate any key that has been accidentally exposed.
Treat uploaded APKs and generated reports as potentially sensitive data.
Review AI-generated remediation suggestions before applying them.
Validate findings manually when results are used for audits, compliance, or production security decisions.
---
📌 Current Limitations
MobileSec is mainly focused on static analysis in the current version.
FixSuggest is an AI-assisted prototype and should not be treated as a fully validated automatic patching engine.
LightGBM predictions are operational remediation categories, not expert OWASP labels.
Raw finding counts may include duplicated strings, test keys, placeholders, or repeated resources before full semantic deduplication.
Report export is implemented, but report-generation success rate should be measured in a dedicated validation experiment when used as a benchmark metric.
---
🤝 Contributing
Fork the repository.
Create a feature branch:
```bash
git checkout -b feature/amazing-feature
```
Commit your changes:
```bash
git commit -m "Add amazing feature"
```
Push to your branch:
```bash
git push origin feature/amazing-feature
```
Open a pull request.
---
📝 License
This project is licensed under the MIT License.
---
🙏 Acknowledgments
OWASP MASVS — Mobile Application Security Verification Standard
OWASP MASTG — Mobile Application Security Testing Guide
OpenRouter — Unified API access to LLMs
LightGBM — Gradient boosting framework
Androguard — Android application analysis toolkit
