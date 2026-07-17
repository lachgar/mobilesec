import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apkScannerService from '../services/apkScanner';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { formatDate, getStatusColor, formatBytes } from '../utils/formatters';
import { useSettings } from '../context/SettingsContext';

const Scans = () => {
    const { t } = useSettings();
    const [scans, setScans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadScans();
    }, []);

    const loadScans = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await apkScannerService.getAllResults(100); // Higher limit
            // Adapter structure
            const scanData = Array.isArray(response.data) ? response.data : response.data.results || response.data.items || [];
            setScans(scanData);

            if (scanData.length === 0) {
                console.warn("No scans found in response");
            }
        } catch (err) {
            console.error("Error loading scans:", err);
            // Show more helpful error message
            if (err.response) {
                setError(`Failed to load scans: ${err.response.status} - ${err.response.statusText}`);
            } else if (err.request) {
                setError("Failed to load scans: Cannot connect to APK Scanner service. Please ensure all services are running.");
            } else {
                setError(`Failed to load scans: ${err.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <LoadingSpinner />;
    if (error) return <div className="text-red-500 p-4">{error}</div>;

    return (
        <div className="space-y-8">
            <div className="pb-5 border-b border-slate-200/50 dark:border-slate-800/40">
                <h2 className="text-2xl font-bold tracking-tight text-slate-955 dark:text-white">{t('scan_history')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">Review and manage decompiled security scans.</p>
            </div>

            <Card>
                <div className="overflow-x-auto rounded-xl border border-slate-200/50 dark:border-slate-800/40">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider">
                                <th className="py-4 px-4 font-bold">{t('filename')}</th>
                                <th className="py-4 px-4 font-bold">Size</th>
                                <th className="py-4 px-4 font-bold">{t('date')}</th>
                                <th className="py-4 px-4 font-bold">{t('status')}</th>
                                <th className="py-4 px-4 font-bold text-right">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-650 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-800/40">
                            {scans.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center py-8 text-slate-400 dark:text-slate-505 text-sm italic">{t('no_scans')}</td>
                                </tr>
                            ) : (
                                scans.map((scan) => (
                                    <tr key={scan.scan_id} className="hover:bg-slate-100/30 dark:hover:bg-slate-800/10 transition duration-150">
                                        <td className="py-4 px-4 font-semibold text-slate-900 dark:text-white max-w-xs sm:max-w-md">
                                            <div className="flex items-center gap-3">
                                                <svg className="w-4 h-4 text-indigo-500/70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                                <span className="truncate text-sm" title={scan.results?.apk_name || scan.results?.file_name || scan.app_name}>
                                                    {scan.results?.apk_name || scan.results?.file_name || scan.app_name || 'Unknown.apk'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 font-mono text-xs text-slate-500 dark:text-slate-450 whitespace-nowrap">
                                            {formatBytes(scan.results?.file_size || 0)}
                                        </td>
                                        <td className="py-4 px-4 text-xs whitespace-nowrap text-slate-500 dark:text-slate-455">
                                            {formatDate(scan.created_at || scan.results?.scan_timestamp || scan.timestamp)}
                                        </td>
                                        <td className="py-4 px-4 whitespace-nowrap">
                                            <Badge type={getStatusColor(scan.status)}>{scan.status}</Badge>
                                        </td>
                                        <td className="py-4 px-4 text-right whitespace-nowrap">
                                            <Link
                                                to={`/scans/${scan.scan_id}`}
                                                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold px-3 py-1.5 rounded-lg text-xs transition active:scale-[0.96] border border-slate-200/40 dark:border-slate-750"
                                            >
                                                {t('view_details')}
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

export default Scans;
