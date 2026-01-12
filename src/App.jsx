import { useState, useRef, useEffect } from 'react'
import './App.css'
import './components/QuickAdd.css'
import { simulateAIAnalysis } from './utils/aiMock'
import { categorizeTask, getTaskDateValue } from './utils/dateUtils'
import CalendarView from './components/CalendarView'
import ScheduleView from './components/ScheduleView'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Onboarding from './components/Onboarding'

/* Icons */
const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
)
const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
)
const ScheduleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="8" y1="14" x2="8" y2="14"></line><line x1="12" y1="14" x2="12" y2="14"></line><line x1="16" y1="14" x2="16" y2="14"></line><line x1="8" y1="18" x2="8" y2="18"></line><line x1="12" y1="18" x2="12" y2="18"></line><line x1="16" y1="18" x2="16" y2="18"></line></svg>
)
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
)
const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
)
const ChevronLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
)
const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
)

function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('home');
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        const hasSeen = localStorage.getItem(`hasSeenTutorial_${session.user.id}`);
        if (!hasSeen) setShowTutorial(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        const hasSeen = localStorage.getItem(`hasSeenTutorial_${session.user.id}`);
        if (!hasSeen) setShowTutorial(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
  const [tasks, setTasks] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [activities, setActivities] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [isAddingTask, setIsAddingTask] = useState(false); // Manual Task Modal State
  const [manualTask, setManualTask] = useState({ title: '', subject: '', date: '', time: '08:00', type: 'task' });
  const chatEndRef = useRef(null);

  /* --- SUPABASE SYNC LOGIC --- */

  // 1. Fetch all data on load
  useEffect(() => {
    if (!session) return;
    const fetchData = async () => {
      // Fetch Tasks
      const { data: t } = await supabase.from('tasks').select('*');
      if (t) setTasks(t);

      // Fetch Classes
      const { data: c } = await supabase.from('classes').select('*');
      if (c) setSchedule(c);

      // Fetch Activities
      const { data: a } = await supabase.from('activities').select('*');
      if (a) setActivities(a);
    };
    fetchData();
  }, [session]);

  // 2. Save Tasks (Debounced/Immediate)
  // 2. Save Tasks
  useEffect(() => {
    if (!session || tasks.length === 0) return;
    const saveTasks = async () => {
      try {
        const uId = session.user.id;
        const validTasks = tasks.map(t => ({
          id: t.id,
          user_id: uId,
          title: t.title,
          time: t.time,
          duration: t.duration,
          type: t.type,
          priority: t.priority,
          description: t.description || '',
          resources: t.resources || []
        }));

        const { error } = await supabase.from('tasks').upsert(validTasks);
        if (error) console.error("Error saving tasks:", error);
        else setLastSaved(new Date());
      } catch (err) {
        console.error("Save tasks crash:", err);
      }
    };
    const timer = setTimeout(saveTasks, 2000);
    return () => clearTimeout(timer);
  }, [tasks, session]);

  // 3. Save Schedule (Classes)
  useEffect(() => {
    if (!session || schedule.length === 0) return;
    const saveSchedule = async () => {
      try {
        const uId = session.user.id;
        const validClasses = schedule.map(c => ({
          id: c.id,
          user_id: uId,
          name: c.name,
          subject: c.subject
        }));
        const { error } = await supabase.from('classes').upsert(validClasses);
        if (error) console.error("Error saving classes:", error);
        else setLastSaved(new Date());
      } catch (err) {
        console.error("Save classes crash:", err);
      }
    };
    const timer = setTimeout(saveSchedule, 2000);
    return () => clearTimeout(timer);
  }, [schedule, session]);

  // 4. Save Activities
  useEffect(() => {
    if (!session || activities.length === 0) return;
    const saveActivities = async () => {
      try {
        const uId = session.user.id;
        const validActivities = activities.map(a => ({
          id: a.id,
          user_id: uId,
          name: a.name,
          time: a.time,
          frequency: a.frequency,
          applied_days: a.appliedDays || [],
          type: a.type,
          is_free_slot: a.isFreeSlot
        }));
        const { error } = await supabase.from('activities').upsert(validActivities);
        if (error) console.error("Error saving activities:", error);
        else setLastSaved(new Date());
      } catch (err) {
        console.error("Save activities crash:", err);
      }
    };
    const timer = setTimeout(saveActivities, 2000);
    return () => clearTimeout(timer);
  }, [activities, session]);

  // 5. Save Chat (Optional - LocalStorage for now to save DB space)
  useEffect(() => {
    localStorage.setItem('calendly_chat', JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
    }
  }, [chatHistory, isProcessing]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      const userMsg = input;
      setInput('');
      setIsProcessing(true);
      const updatedHistory = [...chatHistory, { author: 'user', text: userMsg }];
      setChatHistory(updatedHistory);

      const fullContext = updatedHistory.slice(-5)
        .map(msg => `${msg.author === 'user' ? 'User' : 'Calendly'}: ${msg.text}`)
        .join('\n');

      let result = null;
      try {
        const { generateScheduleFromAI } = await import('./utils/aiReal');
        result = await generateScheduleFromAI(fullContext, tasks, activities, schedule, new Date());
      } catch (aiErr) {
        console.error("AI failed");
      }

      if (!result) {
        result = await simulateAIAnalysis(fullContext, tasks, activities, schedule, new Date());
      }

      const incomingTasks = result.newTasks || result.generatedSchedule || [];
      const incomingClasses = result.newClasses || [];
      const incomingActivities = result.newActivities || [];

      if (incomingTasks.length > 0) {
        const newTasksWithIds = incomingTasks.map((t, idx) => ({
          ...t,
          id: crypto.randomUUID(),
          completed: false,
          type: t.type || 'study'
        }));
        setTasks(prev => [...newTasksWithIds, ...prev]);
      }
      if (incomingClasses.length > 0) {
        const newClassesWithIds = incomingClasses.map((c, idx) => ({ ...c, id: crypto.randomUUID(), type: 'class' }));
        setSchedule(prev => [...prev, ...newClassesWithIds]);
      }
      if (incomingActivities.length > 0) {
        const newActivitiesWithIds = incomingActivities.map((a, idx) => ({ ...a, id: crypto.randomUUID(), type: 'activity' }));
        setActivities(prev => [...prev, ...newActivitiesWithIds]);
      }

      setChatHistory(prev => [...prev, { author: 'ai', text: result.message }]);
    } catch (error) {
      console.error("Critical error:", error);
      setChatHistory(prev => [...prev, { author: 'ai', text: "I'm having trouble processing that. Can you try again?" }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTask = async (id) => {
    // 1. Local update for immediate UI response
    setTasks(prev => prev.filter(t => t.id !== id));

    // 2. Remote update
    if (session) {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error("Error deleting task:", error);
        // Optional: Revert local state or show toast
      } else {
        setLastSaved(new Date());
      }
    }
  };

  const handleDeleteClass = async (id) => {
    setSchedule(prev => prev.filter(c => c.id !== id));
    if (session) {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);
      if (error) console.error("Error deleting class:", error);
      else setLastSaved(new Date());
    }
  };

  const handleDeleteActivity = async (id) => {
    setActivities(prev => prev.filter(a => a.id !== id));
    if (session) {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);
      if (error) console.error("Error deleting activity:", error);
      else setLastSaved(new Date());
    }
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    setTasks(prev => prev.map(t => t.id === editingTask.id ? editingTask : t));
    setEditingTask(null);
  };

  const sortedTasks = [...tasks].sort((a, b) => getTaskDateValue(a) - getTaskDateValue(b));
  const groupedTasks = {
    overdue: sortedTasks.filter(t => categorizeTask(t) === 'overdue'),
    today: sortedTasks.filter(t => categorizeTask(t) === 'today'),
    thisWeek: sortedTasks.filter(t => categorizeTask(t) === 'thisWeek'),
    nextWeek: sortedTasks.filter(t => categorizeTask(t) === 'nextWeek'),
    later: sortedTasks.filter(t => categorizeTask(t) === 'later')
  };

  const sections = [
    { key: 'overdue', title: 'Undone / Overdue', tasks: groupedTasks.overdue, isOverdue: true },
    { key: 'today', title: 'Today', tasks: groupedTasks.today },
    { key: 'thisWeek', title: 'This Week', tasks: groupedTasks.thisWeek },
    { key: 'nextWeek', title: 'Next Week', tasks: groupedTasks.nextWeek },
    { key: 'later', title: 'Later', tasks: groupedTasks.later }
  ];

  const handleFinishTutorial = () => {
    if (session) {
      localStorage.setItem(`hasSeenTutorial_${session.user.id}`, 'true');
    }
    setShowTutorial(false);
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="layout-grid">
      {showTutorial && (
        <Onboarding
          onFinish={handleFinishTutorial}
          isChatExpanded={isChatExpanded}
          schedule={schedule}
          activities={activities}
          setView={setView}
        />
      )}
      <aside className="sidebar">
        <div className="logo-area"><LogoIcon /></div>
        <nav className="nav-menu">
          <button id="nav-home" className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')} title="Home"><HomeIcon /></button>
          <button id="nav-calendar" className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')} title="Calendar"><CalendarIcon /></button>
          <button id="nav-schedule" className={`nav-item ${view === 'schedule' ? 'active' : ''}`} onClick={() => setView('schedule')} title="Schedule"><ScheduleIcon /></button>
        </nav>
        <div className="user-profile-mini">
          <div className="avatar small">{session.user.email[0].toUpperCase()}</div>
          <button className="logout-btn" onClick={() => supabase.auth.signOut()} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </button>
        </div>
      </aside>

      <main className={`main-content ${isChatExpanded ? 'chat-open' : ''}`}>
        <header className="top-header">
          <div className="header-text">
            <h1>{view === 'home' ? `Good Afternoon, ${session.user.email.split('@')[0]}` : view === 'calendar' ? 'Your Schedule' : 'My Classes'}</h1>
            <p className="subtitle">{tasks.length} tasks remaining.</p>
          </div>
          <div className="header-actions">
            {lastSaved && <span className="save-indicator">Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </header>

        <div className="view-container">
          {view === 'home' && (
            <div className="dashboard-grid">
              <div className="schedule-actions-row">
                <button id="add-task-btn" className="add-class-pill main" onClick={() => setIsAddingTask(true)}>
                  + Add New Task
                </button>
              </div>
              <div className="stats-row">
                <div className="stat-card"><span className="stat-val">87%</span><span className="stat-label">Goal</span></div>
                <div className="stat-card"><span className="stat-val">{tasks.length}</span><span className="stat-label">Tasks</span></div>
              </div>
              {groupedTasks.overdue.length > 0 && (
                <div className="dashboard-alerts">
                  {groupedTasks.overdue.map(t => (
                    <div key={t.id} className="alert-card">
                      <div className="alert-icon">⚠️</div>
                      <div className="alert-content">
                        <div className="alert-title">Task Overdue</div>
                        <div className="alert-text">"{t.title}" was due {t.time}.</div>
                      </div>
                      <button className="done-btn" onClick={() => setTasks(prev => prev.filter(tk => tk.id !== t.id))}>Done</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="timeline-section">
                {sections.map(section => (
                  section.tasks.length > 0 && (
                    <div key={section.key} className={`timeline-group ${section.isOverdue ? 'overdue-section' : ''}`}>
                      <h3 className={`timeline-group-header ${section.isOverdue ? 'overdue' : ''}`}>{section.title}</h3>
                      <div className="tasks-list">
                        {section.tasks.map((task, idx) => (
                          <div key={task.id} className={`task-card ${section.isOverdue ? 'overdue' : (task.priority === 'high' ? 'high-priority' : 'medium-priority')}`}>
                            <div className="task-main">
                              <div className="task-top">
                                <span className="task-title-text">{task.title}</span>
                                <div className="task-badges">
                                  {task.type === 'task' && <span className="badge badge-deadline">Deadline</span>}
                                  {task.priority === 'high' && <span className="badge badge-high">High</span>}
                                </div>
                              </div>
                              <div className="task-details">
                                <span className="task-time">{task.time}</span>
                                <span>•</span>
                                <span className="task-duration">{task.duration}</span>
                              </div>
                              {task.description && <p className="task-description">{task.description}</p>}
                              {task.resources && task.resources.length > 0 && (
                                <div className="task-resources">
                                  <span className="resource-label">Study Resources:</span>
                                  <div className="resource-list-row">
                                    {task.resources.map((res, i) => (
                                      <a key={i} href={res.url} target="_blank" rel="noopener noreferrer" className="resource-link">
                                        <span className="res-icon">🔗</span> {res.label}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="task-actions">
                              <button className="edit-task-btn" onClick={() => setEditingTask({ ...task })}>Edit</button>
                              <button className="done-btn" onClick={() => handleDeleteTask(task.id)}>Done</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {view === 'calendar' && <CalendarView tasks={tasks} />}
          {view === 'schedule' && (
            <ScheduleView
              schedule={schedule}
              setSchedule={setSchedule}
              activities={activities}
              setActivities={setActivities}
              onDeleteClass={handleDeleteClass}
              onDeleteActivity={handleDeleteActivity}
            />
          )}
        </div>

        {
          editingTask && (
            <div className="form-overlay">
              <div className="add-block-form v2">
                <h3>Edit Task</h3>
                <form onSubmit={handleSaveEdit}>
                  <div className="form-field">
                    <label>Title</label>
                    <input
                      type="text"
                      value={editingTask.title}
                      onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-field">
                      <label>Time / Date</label>
                      <input
                        type="text"
                        value={editingTask.time}
                        onChange={e => setEditingTask({ ...editingTask, time: e.target.value })}
                      />
                    </div>
                    <div className="form-field">
                      <label>Duration</label>
                      <input
                        type="text"
                        value={editingTask.duration}
                        onChange={e => setEditingTask({ ...editingTask, duration: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="cancel-btn" onClick={() => setEditingTask(null)}>Cancel</button>
                    <button type="submit" className="save-btn">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        {isAddingTask && (
          <div className="form-overlay">
            <div className="add-block-form v2">
              <h3>Add New {manualTask.type === 'task' ? 'Test/Exam' : 'Assignment'}</h3>
              <div className="form-field">
                <label>Title</label>
                <input type="text" placeholder="e.g. Chapter 5 Test" value={manualTask.title} onChange={e => setManualTask({ ...manualTask, title: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Subject (Select or Type)</label>
                <div className="subject-input-row">
                  <select className="styled-select" onChange={e => setManualTask({ ...manualTask, subject: e.target.value })} value={manualTask.subject}>
                    <option value="">Select a Class...</option>
                    {schedule.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    <option value="Other">Other (Type below)</option>
                  </select>
                  {manualTask.subject === 'Other' && (
                    <input
                      type="text"
                      placeholder="Type custom subject..."
                      style={{ marginTop: '8px', width: '100%', background: 'black', border: '1px solid #333', color: 'white', padding: '12px', borderRadius: '4px' }}
                      value={manualTask.customSubject || ''}
                      onChange={e => setManualTask({ ...manualTask, customSubject: e.target.value })}
                    />
                  )}
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Due Date</label>
                  <input type="date" value={manualTask.date} onChange={e => setManualTask({ ...manualTask, date: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Time</label>
                  <input type="time" value={manualTask.time} onChange={e => setManualTask({ ...manualTask, time: e.target.value })} />
                </div>
              </div>
              <div className="form-field">
                <label>Type</label>
                <select className="styled-select" value={manualTask.type} onChange={e => setManualTask({ ...manualTask, type: e.target.value })}>
                  <option value="task">Test / Exam (Generates Study Plan)</option>
                  <option value="assignment">Assignment / HW</option>
                </select>
              </div>
              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setIsAddingTask(false)}>Cancel</button>
                <button className="save-btn" onClick={() => {
                  if (!manualTask.title || !manualTask.date) return;

                  // Generate Unique IDs
                  const deadlineId = crypto.randomUUID();
                  const deadlineDate = new Date(manualTask.date + 'T' + manualTask.time);

                  const newTasksArray = [];
                  const displaySubject = manualTask.subject === 'Other' ? manualTask.customSubject : manualTask.subject;

                  // 1. The Main Deadline Task
                  newTasksArray.push({
                    id: deadlineId,
                    title: `${displaySubject ? displaySubject + ': ' : ''}${manualTask.title}`,
                    time: deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + (manualTask.time > '12:00' ? (parseInt(manualTask.time.split(':')[0]) - 12) + ':' + manualTask.time.split(':')[1] + ' PM' : manualTask.time + ' AM'),
                    duration: '1h',
                    type: manualTask.type, // Use selected type
                    priority: 'high',
                    description: 'Manual Entry'
                  });

                  // 2. Generate Review Days (Simple 2-day fallback logic)
                  if (manualTask.type === 'task') {
                    ['Final Review', 'Prep Session'].forEach((label, idx) => {
                      const reviewDate = new Date(deadlineDate);
                      reviewDate.setDate(deadlineDate.getDate() - (idx + 1));
                      if (reviewDate > new Date()) {
                        newTasksArray.push({
                          id: crypto.randomUUID(),
                          title: `${displaySubject || 'Test'} - ${label}`,
                          time: reviewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', 4:00 PM',
                          duration: '45m',
                          type: 'study',
                          priority: 'medium',
                          description: 'Auto-generated study session'
                        });
                      }
                    });
                  }

                  setTasks(prev => [...prev, ...newTasksArray]);
                  setIsAddingTask(false);
                  setManualTask({ title: '', subject: '', date: '', time: '08:00', type: 'task' });
                }}>Add to Schedule</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <div id="ai-chat-panel" className={`chat-panel ${!isChatExpanded ? 'minimized' : ''}`}>
        <div className="chat-toggle-tab" onClick={() => setIsChatExpanded(!isChatExpanded)}>
          {isChatExpanded ? <ChevronRight /> : <ChevronLeft />}
        </div>
        <div className="chat-content-area is-scrollable" ref={chatEndRef}>
          {chatHistory.length === 0 ? <div className="chat-empty-state">Ask Calendly...</div> : (
            chatHistory.map((msg, idx) => (
              <div key={idx} className={`chat-bubble ${msg.author}`}>
                {msg.author === 'ai' && <span className="chat-avatar">🤖</span>}
                <div className="bubble-content">{msg.text}</div>
              </div>
            ))
          )}
          {isProcessing && <div className="chat-bubble ai"><span className="chat-avatar">...</span><div className="bubble-content">Thinking...</div></div>}
        </div>
        <div className="chat-input-area">
          <div className="ai-input-bar">
            <input type="text" placeholder="Type a message..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={isProcessing} />
            <button className={`send-action ${input ? 'active' : ''}`} onClick={handleSend}>{isProcessing ? '...' : <SendIcon />}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
