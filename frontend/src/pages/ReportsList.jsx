import React, { useEffect, useState } from 'react';
import reportGenService from '../services/reportGen';
import Badge from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Card from '../components/common/Card';

const ReportsList = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, total: 0, limit: 10 });
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        fetchReports();
    }, [pagination.page]);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const res = await reportGenService.getAllReports(pagination.page, pagination.limit);
            setReports(res.data.data);
            setPagination(prev => ({ ...prev, total: res.data.total }));
        } catch (error) {
            console.error("Failed to fetch reports", error);
            // alert("Debug: Failed to fetch reports. See console."); // Optional debug
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (reportId) => {
        if (!window.confirm("Are you sure you want to delete this report?")) return;

        try {
            setDeleting(reportId);
            await reportGenService.deleteReport(reportId);
            setReports(prev => prev.filter(r => r.reportId !== reportId));
        } catch (error) {
            console.error("Failed to delete report", error);
            alert("Failed to delete report.");
        } finally {
            setDeleting(null);
        }
    };

    const handleDownload = (reportId) => {
        const url = reportGenService.getDownloadUrl(reportId) + '?forcePdf=true';
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `report-${reportId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    if (loading && reports.length === 0) return <LoadingSpinner />;

    return (
        <div className="space-y-8">
            <div className="pb-5 border-b border-slate-200/50 dark:border-slate-800/40">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Reports History</h1>
                <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">Manage and access generated application security reports.</p>
            </div>

            <Card>
                <div className="overflow-x-auto rounded-xl border border-slate-200/50 dark:border-slate-800/40">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider">
                                <th className="p-4 font-bold">Generated Date</th>
                                <th className="p-4 font-bold">Project Name</th>
                                <th className="p-4 font-bold">Status</th>
                                <th className="p-4 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-slate-650 dark:text-slate-350">
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm italic">
                                        No reports found. Generate one from a scan details view.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report) => (
                                    <tr key={report.reportId} className="text-sm hover:bg-slate-100/30 dark:hover:bg-slate-800/10 transition">
                                        <td className="p-4 text-xs font-medium text-slate-500 dark:text-slate-450">
                                            {new Date(report.generatedAt).toLocaleString()}
                                        </td>
                                        <td className="p-4 font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
                                            {report.projectName || 'Untitled'}
                                        </td>
                                        <td className="p-4">
                                            <Badge type={report.status === 'completed' ? 'safe' : report.status === 'failed' ? 'critical' : 'warning'}>
                                                {report.status}
                                            </Badge>
                                        </td>
                                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                                            {/* View button */}
                                            <button
                                                onClick={() => window.open(reportGenService.getViewUrl(report.reportId), '_blank')}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-450 dark:hover:text-emerald-350 transition mr-2"
                                                title="View Report"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                                View
                                            </button>
                                            
                                            {/* Print button */}
                                            <button
                                                onClick={() => window.open(reportGenService.getViewUrl(report.reportId) + '?print=true', '_blank')}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition mr-2"
                                                title="Print Report"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                </svg>
                                                Print
                                            </button>
                                            
                                            {/* PDF button */}
                                            <button
                                                onClick={() => handleDownload(report.reportId)}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-sky-650 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition mr-2"
                                                title="Download PDF"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                PDF
                                            </button>
                                            
                                            {/* Delete button */}
                                            <button
                                                onClick={() => handleDelete(report.reportId)}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-600 dark:text-rose-450 dark:hover:text-rose-350 transition"
                                                disabled={deleting === report.reportId}
                                                title="Delete Report"
                                            >
                                                {deleting === report.reportId ? (
                                                    <span className="animate-spin h-3.5 w-3.5 border-2 border-rose-500 border-t-transparent rounded-full"></span>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                )}
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                    <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/40 flex justify-between items-center text-xs text-slate-500 dark:text-slate-450">
                        <span>Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
                        <div className="flex gap-2">
                            <button
                                disabled={pagination.page === 1}
                                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white rounded-xl font-bold transition disabled:opacity-40 disabled:cursor-not-allowed text-xs border border-slate-250/20"
                            >
                                Previous
                            </button>
                            <button
                                disabled={pagination.page * pagination.limit >= pagination.total}
                                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white rounded-xl font-bold transition disabled:opacity-40 disabled:cursor-not-allowed text-xs border border-slate-250/20"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ReportsList;
