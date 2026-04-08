import axios from 'axios';
import toast from 'react-hot-toast';

export const API_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';


export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const handleApiError = (error: any) => {
    console.error("API Operation failed:", error);
    
    let errorMessage = "Unknown error";
    
    if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.detail || error.message;
        
        if (error.code === 'ERR_NETWORK') {
             toast.error(
                "Cannot connect to the analysis server.\nIt might be starting up or downloading models.\nPlease wait a moment and try again.",
                { duration: 6000 }
            );
            return;
        }
        
        if (error.response?.status === 401 || error.response?.status === 403) {
             toast.error("Authentication failed. Please check your API keys.");
             return;
        }
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }

    toast.error(`Analysis Failed: ${errorMessage}`);
};
