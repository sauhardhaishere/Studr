import React, { useState } from 'react';

const ScheduleView = ({ schedule, setSchedule, activities, setActivities }) => {
    const [selectedDay, setSelectedDay] = useState(new Date().toLocaleString('en-us', { weekday: 'long' }));
    const [isAddingBlock, setIsAddingBlock] = useState(false);
    const [isAddingClass, setIsAddingClass] = useState(false); // NEW: for class modal
    const [editingBlockId, setEditingBlockId] = useState(null);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const [newBlock, setNewBlock] = useState({
        name: '',
        startTime: '',
        startAmPm: 'AM',
        endTime: '',
        endAmPm: 'PM',
        days: [selectedDay],
        type: 'activity',
        isFreeSlot: false
    });

    const [newClass, setNewClass] = useState({
        name: '',
        subject: ''
    });

    const handleAddClass = () => {
        if (newClass.name && newClass.subject) {
            setSchedule([...schedule, { id: crypto.randomUUID(), ...newClass }]);
            setIsAddingClass(false);
            setNewClass({ name: '', subject: '' });
        }
    };

    const handleAddBlock = () => {
        if (newBlock.name && newBlock.startTime && newBlock.endTime) {
            const formattedStart = `${newBlock.startTime.trim()} ${newBlock.startAmPm}`;
            const formattedEnd = `${newBlock.endTime.trim()} ${newBlock.endAmPm}`;

            const blockData = {
                name: newBlock.name,
                time: `${formattedStart} - ${formattedEnd}`,
                frequency: newBlock.days.length === 7 ? 'daily' : (newBlock.days.length === 5 && !newBlock.days.includes('Saturday') ? 'weekdays' : 'weekly'),
                appliedDays: newBlock.days,
                type: newBlock.type,
                isFreeSlot: newBlock.isFreeSlot
            };

            if (editingBlockId) {
                // UPDATE existing
                setActivities(activities.map(a => a.id === editingBlockId ? { ...a, ...blockData } : a));
                setEditingBlockId(null);
            } else {
                // CREATE new
                setActivities([...activities, { ...blockData, id: crypto.randomUUID() }]);
            }

            setIsAddingBlock(false);
            setNewBlock({ name: '', startTime: '', startAmPm: 'AM', endTime: '', endAmPm: 'PM', days: [selectedDay], type: 'activity', isFreeSlot: false });
        }
    };

    const handleEdit = (block) => {
        const [fullStart, fullEnd] = block.time.split(' - ');
        const [startVal, startAmPm] = fullStart.split(' ');
        const [endVal, endAmPm] = fullEnd.split(' ');

        setNewBlock({
            name: block.name,
            startTime: startVal,
            startAmPm: startAmPm || 'AM',
            endTime: endVal,
            endAmPm: endAmPm || 'PM',
            days: block.appliedDays || [selectedDay],
            type: block.type || 'activity',
            isFreeSlot: block.isFreeSlot || false
        });
        setEditingBlockId(block.id);
        setIsAddingBlock(true);
    };

    const handleDelete = (id) => {
        setActivities(activities.filter(a => a.id !== id));
    };

    const getBlocksForDay = (dayName) => {
        // filter activities that apply to this day
        const dayActivities = activities.filter(a => {
            if (a.frequency === 'daily') return true;
            if (a.frequency === 'weekdays' && !['Saturday', 'Sunday'].includes(dayName)) return true;
            if (a.frequency === 'weekends' && ['Saturday', 'Sunday'].includes(dayName)) return true;
            if (a.appliedDays && a.appliedDays.includes(dayName)) return true;
            return false;
        });

        // Sort by time
        return dayActivities.sort((a, b) => {
            const getVal = (s) => {
                const match = s.match(/(\d+):(\d+)\s*(am|pm)/i);
                if (!match) return 0;
                let h = parseInt(match[1]);
                const m = parseInt(match[2]);
                const isPm = match[3].toLowerCase() === 'pm';
                if (isPm && h < 12) h += 12;
                if (!isPm && h === 12) h = 0;
                return h * 60 + m;
            };
            return getVal(a.time) - getVal(b.time);
        });
    };

    return (
        <div className="schedule-view-v2">
            {/* Simplified Header with All Actions */}
            <div className="schedule-actions-row">
                <button id="add-class-btn" className="add-class-pill main" onClick={() => setIsAddingClass(true)}>
                    + Add New Class
                </button>
                <button id="add-routine-btn" className="add-block-btn" onClick={() => setIsAddingBlock(true)}>
                    + Add Routine Block
                </button>
            </div>

            <div className="classes-grid">
                {schedule.length === 0 ? (
                    <p className="no-classes">No classes added yet. Add your subjects to help Calendly categorize tasks.</p>
                ) : (
                    schedule.map(cls => (
                        <div key={cls.id} className="class-tag-card">
                            <div className="class-tag-info">
                                <span className="class-tag-name">{cls.name}</span>
                                <span className="class-tag-subject">{cls.subject}</span>
                            </div>
                            <button className="class-tag-del" onClick={() => setSchedule(schedule.filter(c => c.id !== cls.id))}>✕</button>
                        </div>
                    ))
                )}
            </div>

            {/* Day Selector (Mobile/Small) or Grid (Desktop) */}
            <div className="weekly-grid">
                {days.map(day => {
                    const blocks = getBlocksForDay(day);
                    const isToday = day === new Date().toLocaleString('en-us', { weekday: 'long' });

                    const parse = (s) => {
                        if (!s || typeof s !== 'string') return 0;
                        const match = s.match(/(\d+):(\d+)\s*(am|pm)/i);
                        if (!match) return 0;
                        let h = parseInt(match[1]);
                        const m = parseInt(match[2]);
                        const isPm = match[3].toLowerCase() === 'pm';
                        if (isPm && h < 12) h += 12;
                        if (!isPm && h === 12) h = 0;
                        return h * 60 + m;
                    };

                    const formatTime = (totalMin) => {
                        let h = Math.floor(totalMin / 60);
                        const m = totalMin % 60;
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        h = h % 12 || 12;
                        return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
                    };

                    // 1. Create Segments (Splitting overnight blocks)
                    let segments = [];
                    blocks.forEach(block => {
                        const [startStr, endStr] = (block.time || "").split(' - ');
                        if (!startStr || !endStr) return;
                        const startMin = parse(startStr);
                        const endMin = parse(endStr);

                        if (endMin < startMin) {
                            segments.push({ ...block, startMin: 0, endMin: endMin, displayTime: `12:00 AM - ${formatTime(endMin)}`, isWrap: true });
                            segments.push({ ...block, startMin: startMin, endMin: 1440, displayTime: `${formatTime(startMin)} - 11:59 PM`, isWrap: true });
                        } else {
                            segments.push({ ...block, startMin: startMin, endMin: endMin, displayTime: block.time });
                        }
                    });

                    // 2. Sort segments
                    segments.sort((a, b) => a.startMin - b.startMin);

                    // 3. Merge overlaps and find true coverage
                    const timelineItems = [];
                    let lastEnd = 0;
                    let coveredMinutes = 0;

                    segments.forEach((seg, idx) => {
                        if (seg.startMin > lastEnd) {
                            timelineItems.push({
                                type: 'gap',
                                time: `${formatTime(lastEnd)} - ${formatTime(seg.startMin)}`,
                                startMin: lastEnd,
                                endMin: seg.startMin,
                                id: `gap-${lastEnd}-${idx}`
                            });
                        }

                        // Overlap handling for display: if it starts before lastEnd, it's visibly overlapping
                        timelineItems.push(seg);

                        // For stats: only add non-overlapping minutes
                        const actualStart = Math.max(lastEnd, seg.startMin);
                        if (seg.endMin > actualStart) {
                            coveredMinutes += (seg.endMin - actualStart);
                            lastEnd = seg.endMin;
                        }
                    });

                    if (lastEnd < 1440) {
                        timelineItems.push({
                            type: 'gap',
                            time: `${formatTime(lastEnd)} - 11:59 PM`,
                            startMin: lastEnd,
                            endMin: 1440,
                            id: `gap-end`
                        });
                    }

                    const totalHours = (coveredMinutes / 60).toFixed(1);
                    const missingMinutes = 1440 - coveredMinutes;
                    const coveragePercent = (coveredMinutes / 1440) * 100;

                    return (
                        <div key={day} className={`day-column ${isToday ? 'is-today' : ''}`}>
                            <div className="day-header">
                                <div className="day-meta">
                                    <h3>{day}</h3>
                                    {isToday && <span className="today-badge">Today</span>}
                                </div>
                                <div className="coverage-info">
                                    <span className="hours-stat">{totalHours}h / 24h</span>
                                    <span className="missing-stat">
                                        {missingMinutes > 1 ? `${(missingMinutes / 60).toFixed(1)}h missing` : 'Fully Mapped!'}
                                    </span>
                                </div>
                                <div className="coverage-bar">
                                    <div className="coverage-fill" style={{ width: `${coveragePercent}%` }}></div>
                                </div>
                            </div>
                            <div className="day-timeline">
                                {timelineItems.length === 0 ? (
                                    <div className="unmapped-gap full">24h Unmapped (0:00 - 24:00)</div>
                                ) : (
                                    timelineItems.map((item, idx) => (
                                        item.type === 'gap' ? (
                                            <div
                                                key={item.id || idx}
                                                className="time-block unmapped-gap clickable"
                                                onClick={() => {
                                                    const [fullStart, fullEnd] = item.time.split(' - ');
                                                    const [sVal, sAmPm] = fullStart.trim().split(' ');
                                                    const [eVal, eAmPm] = fullEnd.trim().split(' ');

                                                    setNewBlock({
                                                        name: '',
                                                        startTime: sVal,
                                                        startAmPm: sAmPm || 'AM',
                                                        endTime: eVal,
                                                        endAmPm: eAmPm || 'PM',
                                                        days: [day], // Link to the day we clicked in
                                                        type: 'activity',
                                                        isFreeSlot: false
                                                    });
                                                    setEditingBlockId(null);
                                                    setIsAddingBlock(true);
                                                }}
                                            >
                                                <div className="block-info">
                                                    <span className="block-time">{item.time}</span>
                                                    <span className="block-name">Unmapped Gap</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                key={`${item.id}-${idx}`}
                                                className={`time-block ${item.type} ${item.isFreeSlot ? 'free-slot' : 'busy-slot'}`}
                                                onClick={() => handleEdit(item)}
                                            >
                                                <div className="block-info">
                                                    <span className="block-name">{item.name} {item.isWrap ? '(Part)' : ''}</span>
                                                    <div className="block-meta-row">
                                                        <span className="block-time">{item.displayTime}</span>
                                                        {item.isFreeSlot ? (
                                                            <span className="status-badge free">FREE</span>
                                                        ) : (
                                                            <span className="status-badge busy">BUSY</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button className="block-del" onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(item.id);
                                                }}>✕</button>
                                            </div>
                                        )
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Add Routine Block Modal */}
            {isAddingBlock && (
                <div className="form-overlay">
                    <div id="routine-form" className="add-block-form v2">
                        <h3>{editingBlockId ? 'Edit Routine Block' : 'Add Routine Block'}</h3>

                        <div className="form-field">
                            <label>Activity Name</label>
                            <input
                                type="text"
                                placeholder="e.g., School, Eating, Soccer, Free Time"
                                value={newBlock.name}
                                onChange={e => setNewBlock({ ...newBlock, name: e.target.value })}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-field">
                                <label>Start Time</label>
                                <div className="time-input-group">
                                    <input
                                        type="text"
                                        placeholder="8:10"
                                        value={newBlock.startTime}
                                        onChange={e => setNewBlock({ ...newBlock, startTime: e.target.value })}
                                    />
                                    <select
                                        value={newBlock.startAmPm}
                                        onChange={e => setNewBlock({ ...newBlock, startAmPm: e.target.value })}
                                    >
                                        <option value="AM">AM</option>
                                        <option value="PM">PM</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-field">
                                <label>End Time</label>
                                <div className="time-input-group">
                                    <input
                                        type="text"
                                        placeholder="3:20"
                                        value={newBlock.endTime}
                                        onChange={e => setNewBlock({ ...newBlock, endTime: e.target.value })}
                                    />
                                    <select
                                        value={newBlock.endAmPm}
                                        onChange={e => setNewBlock({ ...newBlock, endAmPm: e.target.value })}
                                    >
                                        <option value="AM">AM</option>
                                        <option value="PM">PM</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="form-field">
                            <label>Days of the Week</label>
                            <div className="day-chips">
                                {days.map(d => {
                                    const isActive = (newBlock.days || []).includes(d);
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            className={`day-chip ${isActive ? 'active' : ''}`}
                                            onClick={() => {
                                                const currentDays = newBlock.days || [];
                                                if (currentDays.includes(d)) {
                                                    setNewBlock({ ...newBlock, days: currentDays.filter(x => x !== d) });
                                                } else {
                                                    setNewBlock({ ...newBlock, days: [...currentDays, d] });
                                                }
                                            }}
                                        >
                                            {d.substring(0, 3)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="form-field">
                            <label>Availability</label>
                            <label className="checkbox-field">
                                <input
                                    type="checkbox"
                                    checked={newBlock.isFreeSlot}
                                    onChange={e => setNewBlock({ ...newBlock, isFreeSlot: e.target.checked })}
                                />
                                <span>I am FREE during this time (AI can schedule study here)</span>
                            </label>
                        </div>

                        <div className="form-actions">
                            <button className="cancel-btn" onClick={() => {
                                setIsAddingBlock(false);
                                setEditingBlockId(null);
                                setNewBlock({ name: '', startTime: '', startAmPm: 'AM', endTime: '', endAmPm: 'PM', days: [selectedDay], type: 'activity', isFreeSlot: false });
                            }}>Cancel</button>
                            <button id="save-routine-btn" className="save-btn" onClick={handleAddBlock}>
                                {editingBlockId ? 'Update Block' : 'Save Block'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* NEW: Add Class Modal */}
            {isAddingClass && (
                <div className="form-overlay">
                    <div id="class-form" className="add-block-form v2">
                        <h3>Add New Class</h3>

                        <div className="form-field">
                            <label>Class Name</label>
                            <input
                                type="text"
                                placeholder="e.g., AP Biology"
                                value={newClass.name}
                                onChange={e => setNewClass({ ...newClass, name: e.target.value })}
                            />
                        </div>

                        <div className="form-field">
                            <label>Subject Category</label>
                            <select
                                className="styled-select"
                                value={newClass.subject}
                                onChange={e => setNewClass({ ...newClass, subject: e.target.value })}
                            >
                                <option value="" disabled>Select Subject...</option>
                                <option value="Math">Math</option>
                                <option value="Science">Science</option>
                                <option value="History">History</option>
                                <option value="English">English</option>
                                <option value="Language">World Language</option>
                                <option value="Art">Art / Music</option>
                                <option value="Elective">Elective</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div className="form-actions">
                            <button className="cancel-btn" onClick={() => {
                                setIsAddingClass(false);
                                setNewClass({ name: '', subject: '' });
                            }}>Cancel</button>
                            <button id="save-class-btn" className="save-btn" onClick={handleAddClass}>Save Class</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduleView;
