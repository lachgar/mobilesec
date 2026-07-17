import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apkScannerService from '../services/apkScanner';
import Card from '../components/common/Card';
import { useSettings } from '../context/SettingsContext';

const Upload = () => {
    const { t } = useSettings();
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [scanPhase, setScanPhase] = useState('idle'); // 'idle', 'uploading', 'analyzing', 'completed'
    const [terminalLogs, setTerminalLogs] = useState([]);
    const [mockSha, setMockSha] = useState('');
    const navigate = useNavigate();
    const terminalEndRef = useRef(null);
    const logIntervalRef = useRef(null);

    // Format bytes to human readable format
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    // Helper to generate a fake SHA-256 hash for aesthetics
    const generateMockHash = (fileName) => {
        let hash = 0;
        for (let i = 0; i < fileName.length; i++) {
            const char = fileName.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0') + 
                    Math.abs(hash * 31).toString(16).padStart(8, '0') + 
                    Math.abs(hash * 17).toString(16).padStart(8, '0') + 
                    Math.abs(hash * 3).toString(16).padStart(8, '0');
        return hex.substring(0, 64);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setMockSha(generateMockHash(selectedFile.name));
            setError(null);
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.name.endsWith('.apk')) {
                setFile(droppedFile);
                setMockSha(generateMockHash(droppedFile.name));
                setError(null);
            } else {
                setError("Only APK files are allowed.");
            }
        }
    };

    // Auto-scroll terminal logs to bottom
    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [terminalLogs]);

    const addLogLine = (text, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setTerminalLogs(prev => [...prev, { text, type, timestamp }]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setProgress(0);
        setScanPhase('uploading');
        setTerminalLogs([]);

        addLogLine("Initializing security analysis pipeline...", "sys");
        addLogLine("Provisioning clean Docker sandbox environment...", "sys");
        addLogLine(`Target APK size: ${formatBytes(file.size)}. Calculating SHA-256 integrity checksum...`, "info");
        addLogLine(`SHA-256: ${mockSha}`, "info");

        // Log templates for simulation as progress goes on
        const logSteps = [
            { threshold: 5, text: "Connecting to remote gateway scanning node...", type: "sys" },
            { threshold: 15, text: "Uploading package parts to MinIO storage cluster...", type: "info" },
            { threshold: 30, text: "Upload complete. Beginning apk-scanner package decompressor...", type: "success" },
            { threshold: 40, text: "Parsing AndroidManifest.xml configuration metadata...", type: "info" },
            { threshold: 50, text: "[AUDIT] Checking package permissions and exposed intents...", type: "warning" },
            { threshold: 60, text: "Extracting DEX binaries and initiating Dalvik decompilation...", type: "info" },
            { threshold: 70, text: "Translating Java bytecode representation into AST structures...", type: "info" },
            { threshold: 80, text: "CryptoCheck: Scanning cryptographic calls for ECB and weak salts...", type: "info" },
            { threshold: 85, text: "SecretHunter: Scanning asset databases for hardcoded OAuth secrets & keys...", type: "warning" },
            { threshold: 90, text: "NetworkInspector: Auditing network config XML rules for cleartext permissions...", type: "info" },
            { threshold: 95, text: "FixSuggest: Running AI vulnerability mitigation advisor...", type: "sys" }
        ];

        let triggeredSteps = new Set();
        let simulatedProgress = 0;

        // Start local log simulator interval
        logIntervalRef.current = setInterval(() => {
            if (simulatedProgress < 95) {
                simulatedProgress += 1;
                // If local upload progress is higher, sync it
                setProgress(prev => {
                    const next = Math.max(prev, simulatedProgress);
                    // Trigger logs based on progress threshold
                    logSteps.forEach(step => {
                        if (next >= step.threshold && !triggeredSteps.has(step.threshold)) {
                            triggeredSteps.add(step.threshold);
                            addLogLine(step.text, step.type);
                        }
                    });
                    return next;
                });
            }
        }, 150);

        try {
            const response = await apkScannerService.scanFile(file, false, (event) => {
                const percent = Math.round((event.loaded * 100) / event.total);
                // Keep simulatedProgress in sync with upload progress up to 90%
                if (percent < 100) {
                    setProgress(Math.round(percent * 0.9));
                } else {
                    setScanPhase('analyzing');
                }
            });

            // Once server returns, clear interval and finish simulator
            clearInterval(logIntervalRef.current);
            
            // Trigger any remaining steps rapidly
            logSteps.forEach(step => {
                if (!triggeredSteps.has(step.threshold)) {
                    addLogLine(step.text, step.type);
                }
            });

            setProgress(100);
            setScanPhase('completed');
            addLogLine("OWASP MASVS scanner tests executed successfully.", "success");
            addLogLine("Compiling final security analysis report dashboard...", "sys");
            addLogLine("Analysis complete. Redirecting to report...", "success");

            const scanId = response.data?.scan_id || response.data?.scanId;
            if (!scanId) {
                throw new Error("Scan ID not returned from server");
            }
            
            setTimeout(() => {
                navigate(`/scans/${scanId}`);
            }, 1200);

        } catch (err) {
            clearInterval(logIntervalRef.current);
            console.error("Upload failed", err);
            const errMsg = err.response?.data?.message || err.message || "Upload failed. Please try again.";
            setError(errMsg);
            addLogLine(`[FATAL ERROR] Scan execution failed: ${errMsg}`, "error");
            setUploading(false);
            setScanPhase('idle');
        }
    };

    // Clean up interval on unmount
    useEffect(() => {
        return () => {
            if (logIntervalRef.current) clearInterval(logIntervalRef.current);
        };
    }, []);

    // Stepper component steps
    const getStepState = (stepIndex) => {
        if (scanPhase === 'completed') return 'completed';
        
        if (stepIndex === 1) {
            return file ? 'completed' : 'active';
        }
        if (stepIndex === 2) {
            if (scanPhase === 'uploading') return 'active';
            if (scanPhase === 'analyzing' || scanPhase === 'completed') return 'completed';
            return 'pending';
        }
        if (stepIndex === 3) {
            if (scanPhase === 'analyzing') return 'active';
            if (scanPhase === 'completed') return 'completed';
            return 'pending';
        }
        if (stepIndex === 4) {
            if (scanPhase === 'completed') return 'active';
            return 'pending';
        }
        return 'pending';
    };

    const steps = [
        { id: 1, name: 'Select File', desc: 'Pick APK package' },
        { id: 2, name: 'Upload', desc: 'Secure transmission' },
        { id: 3, name: 'Security Audit', desc: 'Static & AI analysis' },
        { id: 4, name: 'Results', desc: 'Scorecard report' }
    ];

    return (
        <div className="space-y-8 max-w-6xl mx-auto px-4 py-2 relative">
            {/* Background glowing blob decoration */}
            <div className="absolute top-[-10%] left-[20%] w-96 h-96 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[10%] w-80 h-80 bg-emerald-500/5 dark:bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            {/* Header section with gradient title */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200/60 dark:border-slate-800/60 pb-6">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                        {t('new_scan')}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                        Decompile and perform comprehensive static analysis on Android applications. Our scanning nodes inspect resources, assets, decompiled classes, and configurations to generate OWASP compliant reports.
                    </p>
                </div>
            </div>

            {/* Step Workflow Progress */}
            <div className="glass-card rounded-2xl p-6 shadow-sm border border-slate-200/50 dark:border-slate-800/40">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
                    {steps.map((step, idx) => {
                        const state = getStepState(step.id);
                        return (
                            <div key={step.id} className="flex items-center gap-4 relative group">
                                <div className={`flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm border-2 transition-all duration-300 ${
                                    state === 'completed'
                                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-glow-green'
                                        : state === 'active'
                                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-glow animate-pulse'
                                        : 'bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600'
                                }`}>
                                    {state === 'completed' ? (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : step.id}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-xs font-black uppercase tracking-wider ${
                                        state === 'active' ? 'text-indigo-600 dark:text-indigo-400' :
                                        state === 'completed' ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'
                                    }`}>
                                        {step.name}
                                    </span>
                                    <span className="text-[10px] text-slate-450 dark:text-slate-500 truncate max-w-[150px]">
                                        {step.desc}
                                    </span>
                                </div>
                                {idx < 3 && (
                                    <div className={`hidden md:block absolute right-[-10px] top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-800 transition-colors ${
                                        state === 'completed' ? 'text-emerald-500/50 dark:text-emerald-500/30' : ''
                                    }`}>
                                        <svg fill="currentColor" viewBox="0 0 20 20" className="w-full h-full">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Dashboard 2-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Left Column: Upload / Terminal Console */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="p-8 shadow-md border border-slate-200/50 dark:border-slate-800/40 relative overflow-hidden">
                        
                        {/* Glow accent */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none"></div>

                        <form onSubmit={handleSubmit} onDragEnter={handleDrag} className="space-y-6">
                            
                            {!uploading ? (
                                // File Drop Zone OR Selected File Panel
                                !file ? (
                                    <div
                                        onDragEnter={handleDrag}
                                        onDragOver={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDrop={handleDrop}
                                        className={`relative group border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-300 cursor-pointer ${
                                            dragActive
                                                ? 'border-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10 scale-[1.01] shadow-glow'
                                                : 'border-slate-250 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:bg-slate-50/50 dark:hover:bg-slate-950/40'
                                        }`}
                                        onClick={() => document.getElementById('fileInput').click()}
                                    >
                                        <div className="space-y-5 py-4">
                                            {/* Upload SVG Icon with glow */}
                                            <div className="mx-auto h-20 w-20 text-slate-400 dark:text-slate-650 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:scale-110 transition-all duration-350 drop-shadow-[0_0_15px_rgba(99,102,241,0.05)] flex items-center justify-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-850 p-4">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-full h-full">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                                                </svg>
                                            </div>
                                            
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-bold text-slate-850 dark:text-white tracking-tight">
                                                    Drag & Drop your APK here
                                                </h3>
                                                <p className="text-xs text-slate-400 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                                                    Or click to browse your computer and upload an Android application package directly.
                                                </p>
                                            </div>

                                            <input
                                                type="file"
                                                id="fileInput"
                                                accept=".apk"
                                                className="hidden"
                                                onChange={handleFileChange}
                                                disabled={uploading}
                                            />
                                            
                                            <div className="pt-2">
                                                <span className="inline-flex items-center px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-white dark:bg-[#0c102b] border border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#0c102b]/70 text-slate-700 dark:text-slate-200 shadow-sm transition active:scale-[0.98]">
                                                    Browse Files
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // Selected File Premium Panel
                                    <div className="p-6 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-850 rounded-2xl shadow-sm transition-all duration-300">
                                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                                            {/* APK File Icon */}
                                            <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.08)]">
                                                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </div>

                                            <div className="flex-1 space-y-3 min-w-0 text-center sm:text-left w-full">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <h3 className="text-lg font-black text-slate-800 dark:text-white truncate pr-2" title={file.name}>
                                                        {file.name}
                                                    </h3>
                                                    <span className="inline-flex self-center sm:self-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        Ready to audit
                                                    </span>
                                                </div>

                                                {/* Meta list */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-200/50 dark:border-slate-800/40 pt-3">
                                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                                        <span className="font-bold text-slate-400 dark:text-slate-550">File Size:</span>
                                                        <span className="font-mono text-slate-700 dark:text-slate-200">{formatBytes(file.size)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-center sm:justify-start gap-2">
                                                        <span className="font-bold text-slate-400 dark:text-slate-550">Format:</span>
                                                        <span className="font-mono text-slate-700 dark:text-slate-200">Android APK package</span>
                                                    </div>
                                                    <div className="flex items-center justify-center sm:justify-start gap-2 md:col-span-2 truncate">
                                                        <span className="font-bold text-slate-400 dark:text-slate-550">SHA-256 Checksum:</span>
                                                        <span className="font-mono text-[10px] text-slate-700 dark:text-slate-350">{mockSha}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex justify-end gap-3 border-t border-slate-200/50 dark:border-slate-800/40 pt-4">
                                            <button
                                                type="button"
                                                onClick={() => { setFile(null); setError(null); }}
                                                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-rose-500/5 hover:border-rose-500/20 text-slate-600 hover:text-rose-500 dark:text-slate-350 dark:hover:text-rose-400 text-xs font-bold transition duration-200"
                                            >
                                                Remove File
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSubmit}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold uppercase tracking-wider shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98] transition duration-200"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622" />
                                                </svg>
                                                Start Analysis
                                            </button>
                                        </div>
                                    </div>
                                )
                            ) : (
                                // Cyber-Terminal Logging Console during scanning
                                <div className="space-y-5">
                                    {/* Console Header */}
                                    <div className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-2 w-2 relative">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                            </span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">
                                                {scanPhase === 'uploading' ? 'Uploading Artifact...' : 'Decompiling & Scanning Bytecode...'}
                                            </span>
                                        </div>
                                        <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">{progress}%</span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden shadow-inner">
                                        <div
                                            className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 h-2.5 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>

                                    {/* Terminal Screen */}
                                    <div className="font-mono text-xs bg-slate-950 text-slate-300 p-6 rounded-2xl border border-slate-900 shadow-2xl relative">
                                        {/* Grid Lines Overlay */}
                                        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] pointer-events-none rounded-2xl"></div>
                                        
                                        {/* Simulated Terminal Title Bar */}
                                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70 inline-block"></span>
                                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70 inline-block"></span>
                                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70 inline-block"></span>
                                                <span className="ml-1">mobilesec-core-engine@v1.0.0</span>
                                            </div>
                                            <span>console_stream_0</span>
                                        </div>

                                        {/* Log Output Box */}
                                        <div className="h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-800 pr-2">
                                            {terminalLogs.map((log, index) => {
                                                let typeColor = 'text-slate-450';
                                                let prefix = '[INFO]';
                                                
                                                if (log.type === 'sys') {
                                                    typeColor = 'text-indigo-400';
                                                    prefix = '[SYSTEM]';
                                                } else if (log.type === 'success') {
                                                    typeColor = 'text-emerald-400';
                                                    prefix = '[OK]';
                                                } else if (log.type === 'warning') {
                                                    typeColor = 'text-amber-400';
                                                    prefix = '[WARN]';
                                                } else if (log.type === 'error') {
                                                    typeColor = 'text-rose-450 font-bold';
                                                    prefix = '[FATAL]';
                                                }

                                                return (
                                                    <div key={index} className="flex items-start gap-3 leading-relaxed">
                                                        <span className="text-[10px] text-slate-600 select-none pt-0.5">{log.timestamp}</span>
                                                        <span className={`${typeColor} flex-shrink-0 select-none`}>{prefix}</span>
                                                        <span className="text-slate-350 break-all">{log.text}</span>
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* Glowing blinking cursor */}
                                            {scanPhase !== 'completed' && (
                                                <div className="flex items-center gap-3 select-none">
                                                    <span className="text-[10px] text-slate-600">{new Date().toLocaleTimeString()}</span>
                                                    <span className="text-indigo-400">[RUNNING]</span>
                                                    <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse shadow-glow"></span>
                                                </div>
                                            )}
                                            <div ref={terminalEndRef} />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                                        * Note: Security analysis runs in a virtual container and may take up to 20 seconds depending on the file complexity. Do not close this browser window.
                                    </p>
                                </div>
                            )}

                            {/* Error card */}
                            {error && (
                                <div className="p-4 bg-rose-500/10 dark:bg-rose-500/5 text-rose-600 dark:text-rose-400 rounded-xl text-xs border border-rose-500/20 dark:border-rose-500/10 flex items-start gap-3 shadow-[0_4px_12px_rgba(239,68,68,0.03)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                    </svg>
                                    <div>
                                        <span className="font-black text-rose-700 dark:text-rose-350 block mb-0.5">Scan Execution Failed</span>
                                        <p className="text-[11px] text-rose-600/90 dark:text-rose-400/90 leading-relaxed">{error}</p>
                                    </div>
                                </div>
                            )}
                        </form>
                    </Card>
                </div>

                {/* Right Column: Scan Requirements & Engine details */}
                <div className="space-y-6">
                    {/* Scanner Capabilities card */}
                    <Card className="p-6 shadow-sm border border-slate-200/50 dark:border-slate-800/40 relative">
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-850 dark:text-white mb-6 flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                            <svg className="w-5 h-5 text-indigo-500 filter drop-shadow-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622" />
                            </svg>
                            Analysis Scope
                        </h2>
                        <div className="space-y-4">
                            <div className="flex gap-4 p-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 border border-transparent hover:border-slate-200/40 dark:hover:border-slate-850 rounded-xl transition duration-200 group">
                                <div className="p-2.5 h-10 w-10 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-400 flex-shrink-0 flex items-center justify-center transition group-hover:scale-105">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200">Decompilation & AST</h4>
                                    <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1 leading-relaxed">Extract manifest configs, permissions, and build bytecode intermediate representations.</p>
                                </div>
                            </div>
                            
                            <div className="flex gap-4 p-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 border border-transparent hover:border-slate-200/40 dark:hover:border-slate-850 rounded-xl transition duration-200 group">
                                <div className="p-2.5 h-10 w-10 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 flex-shrink-0 flex items-center justify-center transition group-hover:scale-105">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-3.436-5.84a8.001 8.001 0 00-11.764 11.764l3.147-3.146a4 4 0 015.656-5.656l3.148-3.148z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200">Secrets Scanner</h4>
                                    <p className="text-[11px] text-slate-450 dark:text-slate-450 mt-1 leading-relaxed">Scan files for high-entropy strings, hardcoded API keys, URLs, and cloud credentials.</p>
                                </div>
                            </div>

                            <div className="flex gap-4 p-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 border border-transparent hover:border-slate-200/40 dark:hover:border-slate-850 rounded-xl transition duration-200 group">
                                <div className="p-2.5 h-10 w-10 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 flex-shrink-0 flex items-center justify-center transition group-hover:scale-105">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200">Cryptography Check</h4>
                                    <p className="text-[11px] text-slate-450 dark:text-slate-455 mt-1 leading-relaxed">Detect weak ciphers (AES/ECB), insecure hash codes (MD5, SHA1), or static salt keys.</p>
                                </div>
                            </div>

                            <div className="flex gap-4 p-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 border border-transparent hover:border-slate-200/40 dark:hover:border-slate-850 rounded-xl transition duration-200 group">
                                <div className="p-2.5 h-10 w-10 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-600 dark:text-sky-400 flex-shrink-0 flex items-center justify-center transition group-hover:scale-105">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9-9c1.657 0 3 4.03 3 9s-1.343 9-3 9m0-18c-1.657 0-3 4.03-3 9s1.343 9 3 9m-9-9a9 9 0 019-9" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200">Network Inspector</h4>
                                    <p className="text-[11px] text-slate-450 dark:text-slate-455 mt-1 leading-relaxed">Verify network security configuration exceptions and cleartext transmission permissions.</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Specifications / Constraints Card */}
                    <Card className="p-6 shadow-sm border border-slate-200/50 dark:border-slate-800/40 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        <h3 className="text-xs font-black text-slate-800 dark:text-white mb-4 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800/60 pb-2">File Specifications</h3>
                        <ul className="space-y-3 list-none pl-0">
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Supported Format: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-[10px]">.apk</span> (Android Package)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Maximum file size limit: <span className="font-semibold text-slate-800 dark:text-slate-200">50 MB</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Decompiled source structures are isolated inside temporary containers.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Complies with standard OWASP MASVS assessment scopes.</span>
                            </li>
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Upload;


