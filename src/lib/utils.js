const timestampFormatter = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

/**
 * Formats a Firebase timestamp or Date object into a standardized string: "MM/DD • HH:MM"
 * @param {any} timestamp - Firebase timestamp (with seconds/nanoseconds) or Date object
 * @returns {string} Formatted timestamp string
 */
export const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    let date;
    if (timestamp.seconds !== undefined) {
        date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else {
        return '';
    }

    try {
        const parts = timestampFormatter.formatToParts(date);
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const hour = parts.find(p => p.type === 'hour').value;
        const minute = parts.find(p => p.type === 'minute').value;
        
        return `${month}/${day} • ${hour}:${minute}`;
    } catch (e) {
        console.error('Error formatting timestamp:', e);
        return '';
    }
};
