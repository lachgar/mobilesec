import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import apkScannerService from '../services/apkScanner';
import mlModelService from '../services/mlModel';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { formatDate, getStatusColor } from '../utils/formatters';
import { useSettings } from '../context/SettingsContext';

const Dashboard = () => {
    const { t } = useSettings();
    const [stats, setStats] = useState(null);
    const [recentScans, setRecentScans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [trainingSource, setTrainingSource] = useState('mongodb');
    const [trainingRunning, setTrainingRunning] = useState(false);
    const [trainingStatus, setTrainingStatus] = useState('idle');
    const [trainingLogs, setTrainingLogs] = useState([
        'Ready. Choose a dataset source and start training to stream logs here.'
    ]);
    const [trainingMetrics, setTrainingMetrics] = useState({
        epoch: '0/0',
        loss: '0.0000',
        accuracy: '0.0%'
    });

    const eventSourceRef = useRef(null);
    const logEndRef = useRef(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch stats and scans with error handling
                let statsData = null;
                let scansData = [];

                try {
                    const statsRes = await apkScannerService.getStats();
                    statsData = statsRes.data;
                } catch (statsErr) {
                    console.warn("Stats endpoint not available, using defaults:", statsErr.message);
                    // Use defaults if stats endpoint doesn't exist
                    statsData = { total_scans: 0, completed: 0, failed: 0 };
                }

                try {
                    const scansRes = await apkScannerService.getAllResults(5);
                    scansData = Array.isArray(scansRes.data) ? scansRes.data : scansRes.data.results || scansRes.data.items || [];
                } catch (scansErr) {
                    console.warn("Scans endpoint error:", scansErr.message);
                    scansData = [];
                }

                setStats(statsData);
                setRecentScans(scansData);
            } catch (err) {
                console.error("Dashboard error:", err);
                setError("Failed to load dashboard data");
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [trainingLogs]);

    const parseTrainingMetrics = (line) => {
        // Parse Epoch e.g. "Epoch 5/15" or "Iteration 5/100"
        const epochMatch = line.match(/(?:Epoch|Iteration)\s*(\d+(?:\/\d+)?)/i);
        if (epochMatch) {
            setTrainingMetrics(prev => ({ ...prev, epoch: epochMatch[1] }));
        }
        // Parse loss e.g. "loss: 0.045"
        const lossMatch = line.match(/(?:loss|val_loss)[:\s]+([0-9.]+)/i);
        if (lossMatch) {
            setTrainingMetrics(prev => ({ ...prev, loss: parseFloat(lossMatch[1]).toFixed(4) }));
        }
        // Parse accuracy e.g. "accuracy: 0.982" or "acc: 98.2%"
        const accMatch = line.match(/(?:accuracy|acc)[:\s]+([0-9.]+%?)/i);
        if (accMatch) {
            let val = accMatch[1];
            if (!val.includes('%')) {
                const num = parseFloat(val);
                val = num <= 1.0 ? `${(num * 100).toFixed(1)}%` : `${num.toFixed(1)}%`;
            }
            setTrainingMetrics(prev => ({ ...prev, accuracy: val }));
        }
    };

    const appendTrainingLog = (message) => {
        setTrainingLogs((current) => {
            const next = [...current, message];
            return next.slice(-500);
        });
        parseTrainingMetrics(message);
    };

    const trainingSourceLabel = (source) => {
        if (source === 'controlled') return 'controlled trusted dataset';
        if (source === 'bootstrap') return 'development bootstrap';
        return 'MongoDB';
    };

    const startTraining = () => {
        if (trainingRunning) return;

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        setTrainingLogs([
            `Starting ${trainingSourceLabel(trainingSource)} training...`
        ]);
        setTrainingMetrics({
            epoch: '0/15',
            loss: '1.2405',
            accuracy: '15.2%'
        });
        setTrainingStatus('running');
        setTrainingRunning(true);

        const eventSource = new EventSource(mlModelService.getTrainingStreamUrl(trainingSource));
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('start', (event) => {
            appendTrainingLog(event.data);
        });

        eventSource.addEventListener('log', (event) => {
            appendTrainingLog(event.data);
        });

        eventSource.addEventListener('done', (event) => {
            appendTrainingLog(event.data);
            setTrainingStatus('done');
            setTrainingRunning(false);
            eventSource.close();
        });

        eventSource.addEventListener('error', (event) => {
            if (event.data) {
                appendTrainingLog(event.data);
                setTrainingStatus('failed');
            } else {
                appendTrainingLog('Training stream disconnected.');
                setTrainingStatus((status) => status === 'done' ? status : 'failed');
            }
            setTrainingRunning(false);
            eventSource.close();
        });

        eventSource.onerror = () => {
            appendTrainingLog('Training stream connection failed or closed.');
            setTrainingRunning(false);
            setTrainingStatus((status) => status === 'done' ? status : 'failed');
            eventSource.close();
        };
    };

    if (loading) return <LoadingSpinner />;
    if (error) return <div className="text-red-500 p-4">{error}</div>;

    const totalScansCount = stats?.total_scans || 0;
    const completedScansCount = stats?.completed || stats?.completed_scans || 0;
    const failedScansCount = stats?.failed || stats?.failed_scans || 0;

    const completedRatio = totalScansCount > 0 ? Math.round((completedScansCount / totalScansCount) * 100) : 0;
    const failedRatio = totalScansCount > 0 ? Math.round((failedScansCount / totalScansCount) * 100) : 0;

    return (
        <div className="space-y-8 relative">
            {/* Background glowing blob decoration */}
            <div className="absolute top-[-5%] right-[5%] w-96 h-96 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            <div className="absolute bottom-[20%] left-[2%] w-80 h-80 bg-emerald-500/5 dark:bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            {/* Dashboard Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-200/60 dark:border-slate-800/60 gap-4">
                <div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                        {t('dashboard')}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        Real-time mobile security audit insights and LightGBM vulnerability prediction models.
                    </p>
                </div>
                <Link 
                    to="/upload" 
                    className="relative bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition duration-200 shadow-md shadow-indigo-500/15 hover:shadow-indigo-500/25 active:scale-[0.98] flex items-center gap-2 text-xs uppercase tracking-wider group overflow-hidden"
                >
                    <span className="absolute -inset-y-0 -left-12 w-8 bg-white/20 skew-x-12 translate-x-0 group-hover:translate-x-48 transition-transform duration-1000 ease-out pointer-events-none"></span>
                    <svg className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {t('new_scan')}
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Total Scans Card */}
                <Card className="hover:scale-[1.01] hover:-translate-y-0.5 transition-all duration-300 border border-slate-200/50 dark:border-slate-800/40 shadow-sm hover:shadow-indigo-500/5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 h-[3px] w-full bg-indigo-500"></div>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-bl-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                            <p className="text-slate-400 dark:text-slate-550 text-[10px] font-black uppercase tracking-widest">{t('total_scans')}</p>
                            <p className="text-4xl font-black text-slate-900 dark:text-white mt-1.5 font-sans tracking-tight">{totalScansCount}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 shadow-sm group-hover:scale-110 transition duration-300">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-850/60">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            <span>System Load</span>
                            <span className="text-indigo-500 font-mono">100% active</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full w-full"></div>
                        </div>
                    </div>
                </Card>
                
                {/* Completed Card */}
                <Card className="hover:scale-[1.01] hover:-translate-y-0.5 transition-all duration-300 border border-slate-200/50 dark:border-slate-800/40 shadow-sm hover:shadow-emerald-500/5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 h-[3px] w-full bg-emerald-500"></div>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-bl-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                            <p className="text-slate-400 dark:text-slate-555 text-[10px] font-black uppercase tracking-widest">{t('completed')}</p>
                            <p className="text-4xl font-black text-slate-900 dark:text-white mt-1.5 font-sans tracking-tight">{completedScansCount}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-sm group-hover:scale-110 transition duration-300">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-850/60">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            <span>Completion rate</span>
                            <span className="text-emerald-500 font-mono">{completedRatio}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${completedRatio}%` }}></div>
                        </div>
                    </div>
                </Card>

                {/* Failed Card */}
                <Card className="hover:scale-[1.01] hover:-translate-y-0.5 transition-all duration-300 border border-slate-200/50 dark:border-slate-800/40 shadow-sm hover:shadow-rose-500/5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 h-[3px] w-full bg-rose-500"></div>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-rose-500/5 to-transparent rounded-bl-full"></div>
                    <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                            <p className="text-slate-400 dark:text-slate-555 text-[10px] font-black uppercase tracking-widest">{t('failed')}</p>
                            <p className="text-4xl font-black text-slate-900 dark:text-white mt-1.5 font-sans tracking-tight">{failedScansCount}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-455 border border-rose-500/25 shadow-sm group-hover:scale-110 transition duration-300">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-850/60">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            <span>Failure rate</span>
                            <span className="text-rose-500 font-mono">{failedRatio}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${failedRatio}%` }}></div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* ML Model Training Section */}
            <Card
                title="ML Operations Center"
                action={
                    <Badge type={trainingStatus === 'done' ? 'success' : trainingStatus === 'failed' ? 'danger' : trainingRunning ? 'warning' : 'neutral'}>
                        {trainingStatus === 'running' ? 'Training...' : trainingStatus}
                    </Badge>
                }
                className="border border-slate-200/50 dark:border-slate-800/40 shadow-sm relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full pointer-events-none"></div>
                
                <div className="flex flex-col lg:flex-row lg:items-end gap-6 border-b border-slate-100 dark:border-slate-850/60 pb-6">
                    <div className="flex-1">
                        <label htmlFor="training-source" className="block text-[10px] font-black uppercase tracking-widest text-slate-455 dark:text-slate-400 mb-2.5">
                            Dataset Source
                        </label>
                        <select
                            id="training-source"
                            value={trainingSource}
                            onChange={(event) => setTrainingSource(event.target.value)}
                            disabled={trainingRunning}
                            className="w-full bg-white dark:bg-[#070b1e]/60 border border-slate-200 dark:border-slate-800/80 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition duration-200 shadow-sm"
                        >
                            <option value="mongodb">MongoDB Scan Results (Dynamic Live Audit Logs)</option>
                            <option value="controlled">Controlled Trusted Dataset (Benchmark OWASP)</option>
                            <option value="bootstrap">Development Bootstrap Dataset (Default Mock)</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={startTraining}
                        disabled={trainingRunning}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl transition duration-200 shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98] text-xs uppercase tracking-wider flex items-center justify-center gap-2 h-[46px]"
                    >
                        {trainingRunning && <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>}
                        {trainingRunning ? 'Optimizing Weights...' : 'Train Predictor Model'}
                    </button>
                </div>

                {/* Dashboard logs with metrics board */}
                <div className="mt-6 rounded-2xl border border-slate-250 dark:border-slate-900 bg-slate-950 overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none"></div>
                    
                    {/* Console Header Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-900 bg-slate-900/60 font-mono text-[10px] text-slate-400">
                        <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                            <span className={`w-2.5 h-2.5 rounded-full ${trainingRunning ? 'bg-amber-500 animate-pulse shadow-glow' : 'bg-slate-600'}`}></span>
                            <span>Model Training Console</span>
                        </div>
                        
                        {/* Live Metrics readout in console header */}
                        {trainingRunning && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 font-semibold border-l sm:border-l-0 border-slate-800 pl-3 sm:pl-0">
                                <span>Epoch: <span className="text-indigo-400">{trainingMetrics.epoch}</span></span>
                                <span>Loss: <span className="text-rose-400">{trainingMetrics.loss}</span></span>
                                <span>Accuracy: <span className="text-emerald-400">{trainingMetrics.accuracy}</span></span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setTrainingLogs([])}
                            disabled={trainingRunning}
                            className="text-xs font-semibold text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition self-end sm:self-auto uppercase tracking-widest text-[9px]"
                        >
                            Clear Logs
                        </button>
                    </div>

                    {/* Pre Log Window */}
                    <pre className="h-64 overflow-y-auto p-5 text-xs leading-6 text-emerald-400/90 whitespace-pre-wrap font-mono scrollbar-thin scrollbar-thumb-slate-800 pr-2">
                        {trainingLogs.map((line, index) => {
                            let typeColor = 'text-emerald-400/80';
                            if (line.includes('failed') || line.includes('Error') || line.includes('disconnect')) {
                                typeColor = 'text-rose-400';
                            } else if (line.includes('Starting') || line.includes('Initializing') || line.includes('completed')) {
                                typeColor = 'text-indigo-400';
                            }
                            return (
                                <div key={index} className={`hover:bg-white/5 px-2 py-0.5 rounded transition flex items-start gap-3 ${typeColor}`}>
                                    <span className="text-slate-700 select-none mr-2 font-semibold text-[9px] w-5 text-right">{index + 1}</span>
                                    <span className="break-all">{line}</span>
                                </div>
                            );
                        })}
                        {trainingRunning && (
                            <div className="flex items-center gap-3 select-none px-2 py-0.5 text-indigo-400">
                                <span className="text-slate-700 select-none mr-2 font-semibold text-[9px] w-5 text-right">{trainingLogs.length + 1}</span>
                                <span>Optimizer loop processing...</span>
                                <span className="inline-block w-1.5 h-3.5 bg-indigo-500 animate-ping"></span>
                            </div>
                        )}
                        <span ref={logEndRef} />
                    </pre>
                </div>
            </Card>

            {/* Recent Scans Table */}
            <Card title={t('recent_scans')} className="border border-slate-200/50 dark:border-slate-800/40 shadow-sm">
                <div className="overflow-x-auto rounded-xl border border-slate-200/40 dark:border-slate-800/40">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/60 dark:bg-slate-900/40 text-slate-450 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider">
                                <th className="py-4 px-5">{t('filename')}</th>
                                <th className="py-4 px-5">{t('date')}</th>
                                <th className="py-4 px-5">{t('status')}</th>
                                <th className="py-4 px-5 text-right">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-650 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-855/40">
                            {recentScans.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="text-center py-10 text-slate-400 dark:text-slate-550 text-sm italic">{t('no_scans')}</td>
                                </tr>
                            ) : (
                                recentScans.map((scan) => (
                                    <tr key={scan.scan_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 hover:scale-[1.001] transition-all duration-150 group">
                                        <td className="py-4 px-5 font-bold text-slate-800 dark:text-white max-w-[280px]">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/10 flex items-center justify-center">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                                <span className="truncate text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition" title={scan.results?.apk_name || scan.results?.file_name || scan.app_name}>
                                                    {scan.results?.apk_name || scan.results?.file_name || scan.app_name || 'Unknown.apk'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-5 text-xs whitespace-nowrap text-slate-500 dark:text-slate-450 font-medium">
                                            {formatDate(scan.created_at || scan.results?.scan_timestamp || scan.timestamp)}
                                        </td>
                                        <td className="py-4 px-5 whitespace-nowrap">
                                            <Badge type={getStatusColor(scan.status)}>{scan.status}</Badge>
                                        </td>
                                        <td className="py-4 px-5 text-right whitespace-nowrap">
                                            <Link
                                                to={`/scans/${scan.scan_id}`}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 text-slate-600 hover:text-indigo-600 dark:text-slate-350 dark:hover:text-indigo-400 text-xs font-bold transition duration-200 active:scale-[0.98] shadow-sm hover:shadow-indigo-500/5 bg-white dark:bg-[#0b0f24]/30"
                                            >
                                                {t('view_details')}
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default Dashboard;
