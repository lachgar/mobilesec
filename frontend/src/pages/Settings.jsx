import React, { useState } from 'react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { useSettings } from '../context/SettingsContext';

const Settings = () => {
    const { theme, toggleTheme, language, changeLanguage, t } = useSettings();
    const [notifications, setNotifications] = useState(true);
    const [autoDelete, setAutoDelete] = useState(false);
    const [scanDuration, setScanDuration] = useState(60);

    return (
        <div className="space-y-8">
            <div className="pb-5 border-b border-slate-200/50 dark:border-slate-800/40">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t('settings')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">Configure global preferences and view diagnostic statuses.</p>
            </div>

            {/* Grid Layout for options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* System Status */}
                <Card title={t('system_status')} className="border-t-4 border-t-indigo-500">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/40 pb-3">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('api_connection')}</span>
                            <Badge type="success">{t('connected')}</Badge>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/40 pb-3">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('database')}</span>
                            <Badge type="success">{t('online')}</Badge>
                        </div>
                        <div className="flex items-center justify-between py-1">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('version')}</span>
                            <span className="text-xs font-bold font-mono text-slate-500 dark:text-slate-450 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-lg">v1.2.0</span>
                        </div>
                    </div>
                </Card>

                {/* Appearance & Language */}
                <Card title={t('theme') + " & " + t('language')} className="border-t-4 border-t-emerald-500">
                    <div className="space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-850 dark:text-slate-200">{t('theme')}</label>
                                <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-0.5">{theme === 'dark' ? t('dark_mode') : t('light_mode')}</p>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out focus:outline-none ${theme === 'dark' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]' : 'bg-amber-400'}`}
                            >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <div>
                                <label className="block text-sm font-bold text-slate-850 dark:text-slate-200">{t('language')}</label>
                                <p className="text-[11px] text-slate-455 dark:text-slate-500 mt-0.5">{language === 'en' ? 'English' : 'Français'}</p>
                            </div>
                            <div className="flex space-x-1.5 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/60">
                                <button
                                    onClick={() => changeLanguage('en')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-white dark:bg-slate-800 text-indigo-650 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-850'}`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => changeLanguage('fr')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === 'fr' ? 'bg-white dark:bg-slate-800 text-indigo-650 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-850'}`}
                                >
                                    FR
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Scanning Preferences */}
                <Card title={t('scanning_preferences')} className="border-t-4 border-t-amber-500">
                    <div className="space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-850 dark:text-slate-200">{t('default_duration')}</label>
                                <p className="text-[11px] text-slate-455 dark:text-slate-500 mt-0.5">Maximum dynamic dynamic scan time.</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={scanDuration}
                                    onChange={(e) => setScanDuration(e.target.value)}
                                    className="bg-white dark:bg-[#070b1e] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl px-3.5 py-2 w-24 text-xs font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-500 transition duration-200"
                                />
                                <span className="absolute right-2.5 top-2.5 text-[10px] font-bold text-slate-400 select-none">s</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <div>
                                <label className="block text-sm font-bold text-slate-850 dark:text-slate-200">{t('auto_delete')}</label>
                                <p className="text-[11px] text-slate-455 dark:text-slate-500 mt-0.5">Auto-cleanup scans older than 30 days.</p>
                            </div>
                            <button
                                onClick={() => setAutoDelete(!autoDelete)}
                                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out focus:outline-none ${autoDelete ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)]' : 'bg-slate-200 dark:bg-slate-800'}`}
                            >
                                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${autoDelete ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Notifications */}
                <Card title={t('notifications')} className="border-t-4 border-t-rose-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="block text-sm font-bold text-slate-850 dark:text-slate-200">{t('email_alerts')}</label>
                            <p className="text-[11px] text-slate-455 dark:text-slate-505 mt-0.5">Receive email notices for critical flaws.</p>
                        </div>
                        <button
                            onClick={() => setNotifications(!notifications)}
                            className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out focus:outline-none ${notifications ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.25)]' : 'bg-slate-200 dark:bg-slate-800'}`}
                        >
                            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${notifications ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </Card>
            </div>

            <div className="flex justify-end pt-4">
                <button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold px-6 py-3 rounded-xl transition duration-200 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-[0.98] text-sm uppercase tracking-wider">
                    {t('save_changes')}
                </button>
            </div>
        </div>
    );
};

export default Settings;
