import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import apkScannerService from '../services/apkScanner';
import secretHunterService from '../services/secretHunter';
import networkInspectorService from '../services/networkInspector';
import cryptoCheckService from '../services/cryptoCheck';
import reportGenService from '../services/reportGen';


import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StaticAnalysis from '../components/scan/StaticAnalysis';
import SecretsAnalysis from '../components/scan/SecretsAnalysis';
import NetworkAnalysis from '../components/scan/NetworkAnalysis';
import CryptoAnalysis from '../components/scan/CryptoAnalysis';

import { formatDate, getStatusColor } from '../utils/formatters';

const ScanDetail = () => {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('static');
    const [scanData, setScanData] = useState(null);
    const [results, setResults] = useState({
        static: null,
        secrets: null,
        network: null,
        crypto: null
    });
    const [errors, setErrors] = useState({
        secrets: null,
        network: null,
        crypto: null
    });
    const [loading, setLoading] = useState(true);
    const pollingRef = useRef(null);

    // Initial load
    useEffect(() => {
        loadScanDetails();

        // Start polling
        pollingRef.current = setInterval(loadScanDetails, 5000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [id]);

    const loadScanDetails = async () => {
        try {
            // 1. Fetch APK Basic info
            const apkRes = await apkScannerService.getResults(id);
            const rawData = apkRes.data;

            // Normalize data: backend returns { status: "...", results: { apk_name: "...", ... } }
            // We want a flat structure or predictable access.
            const normalizedData = {
                ...rawData,
                ...(rawData.results || {}), // Merge inner results if present
                file_name: rawData.results?.apk_name || rawData.app_name || rawData.file_name || 'Unknown.apk',
                timestamp: rawData.created_at || rawData.timestamp
            };

            setScanData(normalizedData);
            setResults(prev => ({ ...prev, static: normalizedData }));

            // Stop polling only if explicitly completed and we have data
            if (normalizedData.status === 'completed' || normalizedData.status === 'failed') {
                // Check if we have all sub-results?
                // For now, relies on the individual service polls below
            }

            // 2. Fetch other services independently
            const endpoints = [
                { key: 'secrets', service: secretHunterService },
                { key: 'network', service: networkInspectorService },
                { key: 'crypto', service: cryptoCheckService }
            ];

            const promises = endpoints.map(async ({ key, service }) => {
                try {
                    const res = await service.getResults(id);
                    return { key, data: res.data, error: null };
                } catch (e) {
                    // Suppress 404s (pending analysis), report other errors
                    if (e.response && e.response.status === 404) {
                        return { key, data: null, error: null };
                    }
                    console.error(`Error fetching ${key}:`, e);
                    return { key, data: null, error: e.message || 'Fetch failed' };
                }
            });

            const responses = await Promise.all(promises);

            setResults(prev => {
                const next = { ...prev };
                let hasNewData = false;
                responses.forEach(({ key, data }) => {
                    if (data && JSON.stringify(data) !== JSON.stringify(prev[key])) {
                        next[key] = data;
                        hasNewData = true;
                    }
                });
                return hasNewData ? next : prev;
            });

            setErrors(prev => {
                const next = { ...prev };
                responses.forEach(({ key, error }) => {
                    next[key] = error; // Always update error status
                });
                return next;
            });

            // If we have all data, stop polling
            const allLoaded = responses.every(r => r.data !== null);
            if (allLoaded && normalizedData.status === 'completed') {
                if (pollingRef.current) clearInterval(pollingRef.current);
            }

        } catch (err) {
            console.error("Failed to load scan details", err);
        } finally {
            setLoading(false);
        }
    };

    const [downloading, setDownloading] = useState(false);

    const handleDownloadReport = async () => {
        try {
            setDownloading(true);
            // 1. Trigger report generation
            const res = await reportGenService.generateReport(id, 'pdf');

            if (res.data && res.data.reportId) {
                const reportId = res.data.reportId;

                // 2. Poll for completion
                let attempts = 0;
                const maxAttempts = 30; // 60s timeout

                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const statusRes = await reportGenService.getReportStatus(reportId);
                        const status = statusRes.data.status;

                        // Stop if completed
                        if (status === 'completed') {
                            clearInterval(pollInterval);

                            // 3. Download (request PDF; server will convert JSON -> PDF on demand if needed)
                            const downloadArgs = reportGenService.getDownloadUrl(reportId) + '?forcePdf=true';
                            const link = document.createElement('a');
                            link.href = downloadArgs;
                            link.setAttribute('download', `report-${id}.pdf`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();

                            setDownloading(false);
                        }
                        // Stop if failed
                        else if (status === 'failed') {
                            clearInterval(pollInterval);
                            setDownloading(false);
                            alert("Report generation failed on server side.");
                        }
                        // Stop if timeout
                        else if (attempts >= maxAttempts) {
                            clearInterval(pollInterval);
                            setDownloading(false);
                            alert("Report generation timed out.");
                        }
                    } catch (e) {
                        console.error("Polling check failed", e);
                        // Don't stop polling for network blips
                    }
                }, 2000);
            } else {
                setDownloading(false);
                alert("Failed to get report ID.");
            }
        } catch (error) {
            console.error("Report generation trigger failed:", error);
            setDownloading(false);
            alert("Failed to initiate report generation.");
        }
    };

    if (loading && !scanData) return <LoadingSpinner />;
    if (!loading && !scanData) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg className="w-12 h-12 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">Scan not found.</p>
            <Link to="/scans" className="mt-4 text-xs text-indigo-500 hover:text-indigo-400 underline underline-offset-2">← Back to scans</Link>
        </div>
    );

    const tabs = [
        { 
            id: 'static', 
            label: 'Static Analysis',
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
            )
        },
        { 
            id: 'secrets', 
            label: 'Secrets',
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
            )
        },
        { 
            id: 'network', 
            label: 'Network',
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9-9c1.657 0 3 4.03 3 9s-1.343 9-3 9m0-18c-1.657 0-3 4.03-3 9s1.343 9 3 9m-9-9a9 9 0 019-9" />
                </svg>
            )
        },
        { 
            id: 'crypto', 
            label: 'Cryptography',
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            )
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header card */}
            <div className="glass-card rounded-2xl overflow-hidden">
                {/* Top accent stripe */}
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div className="p-6 flex flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        {/* App icon placeholder */}
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 dark:border-indigo-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>

                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-slate-950 dark:text-white tracking-tight">
                                    {scanData.file_name || 'Unknown.apk'}
                                </h2>
                                <Badge type={getStatusColor(scanData.status)}>{scanData.status}</Badge>
                                {scanData.status === 'in_progress' && (
                                    <span className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                        Analyzing...
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                                <span className="text-xs text-slate-500">{formatDate(scanData.timestamp || scanData.started_at)}</span>
                                <span className="text-xs text-slate-500 font-mono">{id.slice(0, 8)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0 print:hidden">
                        {/* Print */}
                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 active:scale-[0.97] text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60"
                        >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print
                        </button>
                        {/* AI Suggestions */}
                        <Link
                            to={`/scans/${id}/suggestions`}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 active:scale-[0.97] text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-md shadow-violet-500/20 hover:shadow-violet-500/30"
                        >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            AI Suggestions
                        </Link>
                        {/* Download PDF */}
                        <button
                            onClick={handleDownloadReport}
                            disabled={downloading}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 active:scale-[0.97] text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 ${downloading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {downloading ? (
                                <>
                                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full flex-shrink-0" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download PDF
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="glass-card rounded-2xl p-1.5 flex gap-1 overflow-x-auto scrollbar-none print:hidden">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex-1 min-w-max flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all duration-200 whitespace-nowrap
                            ${activeTab === tab.id
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                            }
                        `}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {activeTab === 'static' && <StaticAnalysis data={results.static} />}
                {activeTab === 'secrets' && (
                    results.secrets ? <SecretsAnalysis data={results.secrets} /> :
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                            <p className="text-sm font-medium">{scanData.status === 'in_progress' ? 'Scanning for secrets...' : 'Waiting for SecretHunter results...'}</p>
                        </div>
                )}
                {activeTab === 'network' && (
                    results.network ? <NetworkAnalysis data={results.network} /> :
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                            <p className="text-sm font-medium">{scanData.status === 'in_progress' ? 'Analyzing network traffic (~60s)...' : 'Waiting for NetworkInspector results...'}</p>
                        </div>
                )}
                {activeTab === 'crypto' && (
                    results.crypto ? <CryptoAnalysis data={results.crypto} /> :
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            {errors.crypto ? (
                                <div className="flex items-center gap-2 text-rose-500 text-sm">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Error: {errors.crypto}
                                </div>
                            ) : (
                                <>
                                    <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                                    <p className="text-sm font-medium">{scanData.status === 'in_progress' ? 'Analyzing cryptography...' : 'Waiting for CryptoCheck results...'}</p>
                                </>
                            )}
                        </div>
                )}
            </div>
        </div>
    );
};

export default ScanDetail;

