export const getTaskDateValue = (task) => {
    if (!task || !task.time) return 0;
    const taskTime = task.time.toLowerCase();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let timestamp = 0;

    if (taskTime.includes('today')) {
        timestamp = now.getTime();
    } else if (taskTime.includes('tomorrow')) {
        const d = new Date(now);
        d.setDate(now.getDate() + 1);
        timestamp = d.getTime();
    } else {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIdx = months.findIndex(m => taskTime.includes(m));
        if (monthIdx !== -1) {
            const match = taskTime.match(/\d+/);
            const day = match ? parseInt(match[0]) : 1;
            const d = new Date(now.getFullYear(), monthIdx, day);
            // If the date is significantly in the past, assume next year
            if (d.getTime() < now.getTime() - 86400000) d.setFullYear(now.getFullYear() + 1);
            timestamp = d.getTime();
        } else {
            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayIdx = daysOfWeek.findIndex(day => taskTime.includes(day));
            if (dayIdx !== -1) {
                let diff = dayIdx - now.getDay();
                if (diff <= 0) diff += 7;
                if (taskTime.includes('next')) {
                    if (diff < 7) diff += 7;
                }
                const d = new Date(now);
                d.setDate(now.getDate() + diff);
                timestamp = d.getTime();
            } else {
                timestamp = now.getTime() + 2000000000;
            }
        }
    }

    // ADD TIME OFFSET FOR FINE SORTING (e.g., "4:30 PM")
    const timeMatch = taskTime.match(/(\d+):(\d+)\s*(am|pm)/);
    if (timeMatch) {
        let hrs = parseInt(timeMatch[1]);
        const mins = parseInt(timeMatch[2]);
        const isPm = timeMatch[3] === 'pm';
        if (isPm && hrs < 12) hrs += 12;
        if (!isPm && hrs === 12) hrs = 0;
        timestamp += (hrs * 60 * 60 * 1000) + (mins * 60 * 1000);
    }

    return timestamp;
};

export const categorizeTask = (task) => {
    if (!task) return 'later';
    const taskDateValue = getTaskDateValue(task);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diffMs = taskDateValue - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays > 0 && diffDays <= 7) return 'thisWeek';
    if (diffDays > 7 && diffDays <= 14) return 'nextWeek';
    return 'later';
};
