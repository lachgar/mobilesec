import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

// Simple dictionary for translations
const translations = {
    en: {
        dashboard: "Dashboard",
        reports: "Reports",
        new_scan: "New Scan",
        scan_history: "Scan History",
        settings: "Settings",
        system_status: "System Status",
        api_connection: "API Connection",
        database: "Database",
        version: "Version",
        scanning_preferences: "Scanning Preferences",
        default_duration: "Default Scan Duration",
        auto_delete: "Auto-delete Reports",
        notifications: "Notifications",
        email_alerts: "Email Alerts",
        theme: "Theme",
        dark_mode: "Dark Mode",
        light_mode: "Light Mode",
        language: "Language",
        save_changes: "Save Changes",
        recent_scans: "Recent Scans",
        completed: "Completed",
        failed: "Failed",
        total_scans: "Total Scans",
        filename: "Filename",
        date: "Date",
        status: "Status",
        actions: "Actions",
        no_scans: "No scans found",
        view_details: "View Details",
        connected: "Connected",
        online: "Online",
        offline: "Offline"
    },
    fr: {
        dashboard: "Tableau de bord",
        reports: "Rapports",
        new_scan: "Nouveau Scan",
        scan_history: "Historique",
        settings: "Paramètres",
        system_status: "État du système",
        api_connection: "Connexion API",
        database: "Base de données",
        version: "Version",
        scanning_preferences: "Préférences de scan",
        default_duration: "Durée par défaut",
        auto_delete: "Auto-suppression",
        notifications: "Notifications",
        email_alerts: "Alertes Email",
        theme: "Thème",
        dark_mode: "Mode Sombre",
        light_mode: "Mode Clair",
        language: "Langue",
        save_changes: "Enregistrer",
        recent_scans: "Scans Récents",
        completed: "Terminé",
        failed: "Échoué",
        total_scans: "Total des scans",
        filename: "Fichier",
        date: "Date",
        status: "Statut",
        actions: "Actions",
        no_scans: "Aucun scan trouvé",
        view_details: "Détails",
        connected: "Connecté",
        online: "En ligne",
        offline: "Hors ligne"
    }
};

export const SettingsProvider = ({ children }) => {
    // Initialize from localStorage or default
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');

    // Apply theme class to html element
    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Persist language
    useEffect(() => {
        localStorage.setItem('language', language);
    }, [language]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const changeLanguage = (lang) => {
        setLanguage(lang);
    };

    const t = (key) => {
        return translations[language][key] || key;
    };

    return (
        <SettingsContext.Provider value={{ theme, toggleTheme, language, changeLanguage, t }}>
            {children}
        </SettingsContext.Provider>
    );
};
