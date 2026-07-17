import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';

const Sidebar = () => {
    const location = useLocation();
    const { t } = useSettings();

    const menuItems = [
        { 
            path: '/', 
            key: 'dashboard', 
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                </svg>
            )
        },
        { 
            path: '/reports', 
            key: 'reports', 
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            )
        },
        { 
            path: '/upload', 
            key: 'new_scan', 
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
            )
        },
        { 
            path: '/scans', 
            key: 'scan_history', 
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        },
        { 
            path: '/settings', 
            key: 'settings', 
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            )
        },
    ];

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white/95 dark:bg-[#090d20]/95 border-r border-slate-250/50 dark:border-slate-850/50 text-slate-600 dark:text-slate-400 transition-all duration-300 backdrop-blur-md z-30 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.02)] print:hidden">
            <div className="flex items-center px-6 h-20 border-b border-slate-200/50 dark:border-slate-800/40">
                {/* Shield SVG logo */}
                <svg className="w-7 h-7 text-indigo-500 mr-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <h1 className="text-lg font-bold text-slate-800 dark:text-white tracking-widest uppercase font-sans">
                    <span className="text-indigo-500 font-extrabold">Mobile</span>Sec
                </h1>
            </div>

            <nav className="mt-8 px-4 space-y-6">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-widest px-4 mb-4">Main Menu</p>
                    <ul className="space-y-1.5">
                        {menuItems.map((item) => {
                            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
                            return (
                                <li key={item.path}>
                                    <Link
                                        to={item.path}
                                        className={`flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                                            isActive
                                                ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 shadow-[inset_0_0_12px_rgba(99,102,241,0.05)] border-l-[3px] border-indigo-500 pl-[13px] rounded-l-none'
                                                : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-white border-l-[3px] border-transparent'
                                        }`}
                                    >
                                        <span className={`mr-3.5 transition-transform duration-300 ${isActive ? 'scale-110 text-indigo-500' : 'text-slate-450 dark:text-slate-500'}`}>
                                            {item.icon}
                                        </span>
                                        {t(item.key)}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </nav>
        </aside>
    );
};

export default Sidebar;
