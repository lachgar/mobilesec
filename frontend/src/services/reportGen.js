import axios from 'axios';
import config from '../config';

const CONFIG_URL = config.API_URLS.REPORT_GEN || 'http://localhost:3005';
const BASE_URL = `${CONFIG_URL}/api/reports`;

const reportGenService = {
    // Generate a report from a scan ID
    generateReport: async (scanId, format = 'pdf') => {
        return axios.post(`${BASE_URL}/generate-from-scan`, {
            scanId,
            format
        });
    },

    // Check report status
    getReportStatus: async (reportId) => {
        return axios.get(`${BASE_URL}/${reportId}`);
    },

    // Download URL helper
    getDownloadUrl: (reportId) => {
        return `${BASE_URL}/${reportId}/download`;
    },

    // View URL helper (HTML — served without Puppeteer)
    getViewUrl: (reportId) => {
        return `${BASE_URL}/${reportId}/view`;
    },


    // List all reports
    getAllReports: async (page = 1, limit = 10) => {
        return axios.get(`${BASE_URL}?page=${page}&limit=${limit}`);
    },

    // Delete a report
    deleteReport: async (reportId) => {
        return axios.delete(`${BASE_URL}/${reportId}`);
    }
};

export default reportGenService;
