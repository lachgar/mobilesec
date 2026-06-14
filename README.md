# MobileSec

**MobileSec** is a microservices-based platform for static security analysis of Android APK files. It combines APK preprocessing, vulnerability detection, machine-learning-based prioritization, AI-assisted remediation guidance, and multi-format reporting in a single workflow.

MobileSec is designed for researchers, security analysts, and developers who need a reproducible Android security assessment environment.

---

## Table of Contents

1. [Main Capabilities](#main-capabilities)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Repository Structure](#repository-structure)
5. [Quick Start](#quick-start)
6. [Environment Configuration](#environment-configuration)
7. [Using the Platform](#using-the-platform)
8. [Reports and Exports](#reports-and-exports)
9. [API Documentation](#api-documentation)
10. [Development](#development)
11. [Reproducibility](#reproducibility)
12. [Security Notes](#security-notes)
13. [Current Limitations](#current-limitations)
14. [Contributing](#contributing)
15. [License](#license)
16. [Acknowledgments](#acknowledgments)

---

## Main Capabilities

### 1. APK Security Analysis

MobileSec performs static analysis of Android APK files and extracts relevant security information, including:

- manifest configuration;
- permissions;
- exported components;
- package metadata;
- network endpoints;
- embedded resources;
- strings and potential secrets;
- cryptographic usage patterns.

### 2. Vulnerability Detection

The platform includes specialized services for several Android security domains:

| Component | Purpose |
|---|---|
| **CryptoCheck** | Detects weak cryptographic algorithms, insecure modes, hardcoded keys, unsafe IVs, and related crypto misuse patterns. |
| **SecretHunter** | Detects exposed API keys, tokens, passwords, private keys, and sensitive strings. |
| **NetworkInspector** | Detects insecure endpoints, cleartext traffic, weak TLS configurations, and risky network communication patterns. |

### 3. ML-Based Prioritization

MobileSec uses a LightGBM-based prioritization service to rank findings and predict operational remediation categories. The model is used as a decision-support component and does not replace expert validation.

### 4. AI-Assisted Remediation

The FixSuggest service uses the OpenRouter API to generate:

- vulnerability explanations;
- remediation steps;
- Java/Kotlin-oriented fix suggestions;
- code-level guidance.

Generated suggestions must be reviewed, tested, and adapted before use in production.

### 5. Reporting and Export

The ReportGen service supports:

- **PDF reports** for human-readable security summaries;
- **JSON export** for automation and downstream processing;
- **SARIF export** for DevSecOps and static-analysis workflows.

---

## System Architecture

MobileSec follows a modular microservices architecture. Each major analysis task is handled by a dedicated service, which makes the platform easier to extend and evaluate.

```text
┌──────────────────┐
│   Frontend UI    │
│   React / Vite   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ API Gateway /    │
│ CI Connector     │  Port 3000
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ APK Scanner      │  Port 5000
│ APK preprocessing│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Apache Kafka     │
│ Event backbone   │
└────────┬─────────┘
         │
 ┌───────┼────────────┬──────────────┬──────────────┐
 ▼       ▼            ▼              ▼              ▼
┌──────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌─────────┐
│Crypto│ │Secret    │ │Network     │ │ML Model    │ │MongoDB  │
│Check │ │Hunter    │ │Inspector   │ │LightGBM    │ │Storage  │
└──┬───┘ └────┬─────┘ └─────┬──────┘ └─────┬──────┘ └────┬────┘
   │          │             │              │             │
   └──────────┴─────────────┴──────────────┴─────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
        ┌──────────────────┐        ┌──────────────────┐
        │ ReportGen        │        │ FixSuggest        │
        │ PDF/JSON/SARIF   │        │ AI remediation    │
        │ Port 3005        │        │ Port 8000         │
        └──────────────────┘        └──────────────────┘
```

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Python, FastAPI, Flask, Java/Spring Boot |
| Machine Learning | LightGBM, scikit-learn |
| AI Integration | OpenRouter API |
| Database | MongoDB |
| Messaging | Apache Kafka |
| Containerization | Docker, Docker Compose |
| Reporting | PDF, JSON, SARIF |

---

## Repository Structure

```text
mobilesec/
├── backend/
│   ├── ci-connector/
│   ├── apk-scanner/
│   ├── crypto-check/
│   ├── secret-hunter/
│   ├── network-inspector/
│   ├── ml-model/
│   ├── FixSuggest/
│   ├── ReportGen/
│   └── docker-compose.yml
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── README.md
└── LICENSE
```

The exact structure may evolve as services are refactored, but the platform is organized around independent backend services and a React-based frontend.

---

## Quick Start

### Prerequisites

Before starting MobileSec, install:

- Docker;
- Docker Compose;
- Node.js 18+;
- npm;
- an OpenRouter API key for AI-assisted remediation.

At least 8 GB of RAM is recommended.

### 1. Clone the Repository

```bash
git clone https://github.com/lachgar/mobilesec.git
cd mobilesec
git checkout dev
```

### 2. Configure the Backend Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your local configuration.

```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
MONGODB_URI=mongodb://mongodb:27017/mobilesec
KAFKA_BROKERS=kafka:9092
```

Do not commit real API keys or passwords.

### 3. Start Backend Services

```bash
docker compose up -d --build
```

### 4. Start the Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

### 5. Open the Platform

| Service | URL |
|---|---|
| Frontend | `http://localhost:3006` |
| API Gateway / CI Connector | `http://localhost:3000` |
| FixSuggest API | `http://localhost:8000/docs` |
| ML Model API | `http://localhost:8001/docs` |
| ReportGen | `http://localhost:3005` |
| MongoDB Express | `http://localhost:8081` |

---

## Environment Configuration

### OpenRouter Configuration

MobileSec uses OpenRouter for LLM-assisted remediation suggestions.

Example:

```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

Recommended practice:

- keep secrets in `.env`;
- never commit `.env`;
- use `.env.example` for documentation only;
- rotate any key that has been accidentally exposed.

### Number of AI Suggestions

The number of generated suggestions can be adjusted in the frontend or backend service configuration. Example:

```javascript
const response = await fixSuggestService.getMLPrioritizedSuggestions(scanId, 20);
```

---

## Using the Platform

### 1. Upload an APK

1. Open the frontend dashboard.
2. Upload or drag and drop an `.apk` file.
3. Wait for the scan pipeline to finish.
4. Open the scan details page.

### 2. Review Scan Results

Each scan may include:

- vulnerability categories;
- severity distribution;
- affected files or resources;
- detected secrets;
- insecure endpoints;
- cryptographic issues;
- security score;
- service status.

### 3. Review Prioritized Findings

The ML service ranks findings and predicts remediation categories. These predictions help analysts decide which issues should be reviewed first.

### 4. Generate Fix Suggestions

FixSuggest can generate explanations and remediation guidance for selected findings. Generated content should be checked manually before use.

---

## Reports and Exports

MobileSec supports three output formats:

| Format | Purpose |
|---|---|
| PDF | Human-readable security report. |
| JSON | Structured output for automation and integration. |
| SARIF | Standard static-analysis format for DevSecOps workflows. |

Report generation can be validated separately by counting successful export attempts over the total number of requested exports.

---

## API Documentation

### FixSuggest API

- Swagger UI: `http://localhost:8000/docs`

Main endpoints:

```text
POST /api/v1/suggest/ml-priority
GET  /api/v1/suggest/scan/{scan_id}
GET  /health
```

### ML Model API

- Swagger UI: `http://localhost:8001/docs`

Main endpoints:

```text
POST /api/v1/prioritize
POST /api/v1/predict/{scan_id}
GET  /health
```

### ReportGen API

ReportGen provides report generation in PDF, JSON, and SARIF formats.

---

## Development

### Run Tests

```bash
# ReportGen tests
cd backend/ReportGen
npm test

# Frontend tests
cd frontend
npm test
```

### Build for Production

```bash
# Build frontend
cd frontend
npm run build

# Start production containers
cd ../backend
docker compose -f docker-compose.prod.yml up -d --build
```

### Debug Services

```bash
# Logs
docker logs fixsuggest --tail 100 --follow
docker logs ml-model --tail 100 --follow
docker logs reportgen --tail 100 --follow

# Restart a service
docker compose restart fixsuggest

# Stop all services
docker compose down
```

---

## Reproducibility

For reproducible experiments, keep the following information:

- repository URL;
- Git commit hash or release tag;
- Docker Compose file;
- APK dataset or benchmark name;
- scan date;
- service versions;
- LightGBM model version;
- exported JSON or SARIF files;
- generated PDF reports when used.

Recommended release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

A citable archive can be created with Zenodo or Software Heritage.

---

## Security Notes

- Do not commit real API keys, database passwords, private tokens, or JWT secrets.
- Revoke and rotate exposed keys immediately.
- Treat uploaded APKs as potentially sensitive files.
- Treat generated reports as security-sensitive artifacts.
- Validate AI-generated patches before using them.
- Do not treat raw findings as confirmed vulnerabilities without manual validation.

---

## Current Limitations

- MobileSec currently focuses mainly on static analysis.
- FixSuggest is an AI-assisted prototype, not a fully validated automatic patching system.
- LightGBM predictions are operational remediation categories, not manually validated OWASP labels.
- Raw finding counts may include repeated strings, placeholders, duplicated resources, or test keys.
- Report-generation success rate should be measured in a dedicated export-validation experiment when used as a benchmark metric.

---

## Contributing

1. Fork the repository.
2. Create a feature branch.

```bash
git checkout -b feature/my-feature
```

3. Commit your changes.

```bash
git commit -m "Add my feature"
```

4. Push the branch.

```bash
git push origin feature/my-feature
```

5. Open a pull request.

---

## License

This project is licensed under the MIT License.

---

## Acknowledgments

- OWASP MASVS — Mobile Application Security Verification Standard
- OWASP MASTG — Mobile Application Security Testing Guide
- OpenRouter — LLM API access
- LightGBM — Gradient boosting framework
- Androguard — Android application analysis toolkit
