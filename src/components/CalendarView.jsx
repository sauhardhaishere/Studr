import React from 'react';
import { categorizeTask } from '../utils/dateUtils';

const CalendarView = ({ tasks }) => {
    const [currentDate, setCurrentDate] = React.useState(new Date());

    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const currentYear = currentDate.getFullYear();
    const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Navigation
    const nextMonth = () => {
        setCurrentDate(new Date(currentYear, currentDate.getMonth() + 1, 1));
    };
    const prevMonth = () => {
        setCurrentDate(new Date(currentYear, currentDate.getMonth() - 1, 1));
    };

    // Calendar Generation
    const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);

    // Get days from previous month to fill the start
    const prevMonthDate = new Date(currentYear, currentDate.getMonth() - 1, 1);
    const daysInPrevMonth = getDaysInMonth(prevMonthDate);

    const calendarDays = [];

    // Fill previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        calendarDays.push({
            key: `prev-${i}`,
            day: daysInPrevMonth - i,
            isCurrentMonth: false,
            monthOffset: -1
        });
    }

    // Fill current month days
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push({
            key: `curr-${i}`,
            day: i,
            isCurrentMonth: true,
            monthOffset: 0
        });
    }

    // Fill remaining days from next month to reach exactly 42 (6 weeks)
    const totalCells = 42;
    const remaining = totalCells - calendarDays.length;
    for (let i = 1; i <= remaining; i++) {
        calendarDays.push({
            key: `next-${i}`,
            day: i,
            isCurrentMonth: false,
            monthOffset: 1
        });
    }

    // --- SMART TASK MATCHING ---
    const getTasksForDay = (item) => {
        if (!item || !item.day) return [];
        const targetDate = new Date(currentYear, currentDate.getMonth() + item.monthOffset, item.day);
        const today = new Date();

        today.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        return tasks.filter(task => {
            if (!task.time) return false;
            const lowerTime = task.time.toLowerCase();

            if (lowerTime.includes('today')) {
                return targetDate.getTime() === today.getTime();
            }
            if (lowerTime.includes('tomorrow')) {
                return targetDate.getTime() === tomorrow.getTime();
            }

            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const taskDayIndex = daysOfWeek.findIndex(d => lowerTime.includes(d));

            if (taskDayIndex !== -1) {
                if (targetDate.getDay() === taskDayIndex) {
                    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (lowerTime.includes('next')) {
                        return diffDays >= 2 && diffDays <= 14;
                    } else {
                        return diffDays >= 0 && diffDays <= 7;
                    }
                }
            }

            const monthName = targetDate.toLocaleString('default', { month: 'short' });
            const dayNum = item.day.toString();

            if (task.time.includes(monthName) && (task.time.includes(` ${dayNum} `) || task.time.includes(` ${dayNum},`) || task.time.endsWith(` ${dayNum}`))) {
                return true;
            }
            if (task.time.includes(monthName) && task.time.includes(dayNum + "th")) return true;

            return false;
        });
    };

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                <h2>{currentMonth} {currentYear}</h2>
                <div className="calendar-nav">
                    <button className="icon-btn" onClick={prevMonth}>‹</button>
                    <button className="icon-btn" onClick={nextMonth}>›</button>
                </div>
            </div>

            <div className="calendar-days-header-row">
                {headers.map(d => <div key={d} className="calendar-day-header">{d}</div>)}
            </div>

            <div className="calendar-grid">
                {calendarDays.map((item, index) => {
                    const dayTasks = getTasksForDay(item);
                    const isToday = item.day === new Date().getDate() &&
                        currentDate.getMonth() === new Date().getMonth() &&
                        currentDate.getFullYear() === new Date().getFullYear() &&
                        item.isCurrentMonth;

                    return (
                        <div key={item.key} className={`calendar-cell ${isToday ? 'today' : ''} ${!item.isCurrentMonth ? 'not-current' : ''}`}>
                            <span className="day-number">{item.day}</span>

                            <div className="day-tasks">
                                {dayTasks.slice(0, 3).map(task => {
                                    const overdue = categorizeTask(task) === 'overdue';
                                    return (
                                        <div
                                            key={task.id}
                                            className={`calendar-task-item ${task.priority} type-${task.type || 'study'} ${overdue ? 'overdue' : ''}`}
                                            title={`${task.title} at ${task.time}${task.resources ? ' (Has Resources)' : ''}`}
                                        >
                                            <span className="task-item-time">
                                                {task.time.includes(',') ? task.time.split(',')[1].trim() : (task.time.includes(' at ') ? task.time.split(' at ')[1] : '')}
                                            </span>
                                            <span className="task-item-title">
                                                {task.title}
                                                {task.resources && task.resources.length > 0 && <span className="res-indicator"> 🔗</span>}
                                            </span>
                                        </div>
                                    );
                                })}
                                {dayTasks.length > 3 && (
                                    <div className="calendar-task-more">
                                        +{dayTasks.length - 3} more
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CalendarView;
