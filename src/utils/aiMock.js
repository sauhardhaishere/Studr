// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date(), onStep = null) => {
  return new Promise((resolve) => {
    const lines = conversationContext.split('\n');
    const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
    const userCleanInput = lastUserMsg.toLowerCase();

    // TYPO CORRECTION
    const corrections = {
      "sciecne": "science", "scence": "science", "sci": "science",
      "math": "math", "calculus": "calculus", "calclus": "calculus", "calc": "calculus",
      "history": "history", "hisotry": "history", "histry": "history", "hist": "history",
      "english": "english", "eng": "english", "englsh": "english",
      "biology": "biology", "bio": "biology", "chemistry": "chemistry", "chem": "chemistry",
      "spanish": "spanish", "sapnish": "spanish", "spansih": "spanish", "span": "spanish", "spanihs": "spanish",
      "physics": "physics", "phys": "physics"
    };

    let processedInput = userCleanInput;
    Object.keys(corrections).forEach(typo => {
      // Use regex for whole-word or substring match safety
      const regex = new RegExp(typo, 'g');
      processedInput = processedInput.replace(regex, corrections[typo]);
    });

    const commonSubjects = ["math", "science", "history", "english", "spanish", "physics", "biology", "chemistry", "algebra", "geometry", "calculus", "stats", "latin"];
    const globalExams = ["gaokao", "sat", "act", "lsat", "mcat", "ap", "gre", "gmat"];

    // Fast path triggers
    const isStandardizedTest = globalExams.some(e => processedInput.includes(e));
    const isTestRequest = processedInput.includes("test") || processedInput.includes("exam") || processedInput.includes("quiz");
    const isAssignmentRequest = processedInput.includes("hw") || processedInput.includes("homework") || processedInput.includes("assignment") || processedInput.includes("due");

    setTimeout(async () => {
      try {
        let newTasks = [];
        const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
        const lastAILower = lastAILine.toLowerCase();
        const isIntensityQuestion = lastAILower.includes("intensity") || lastAILower.includes("normal, moderate, or hardcore");

        // --- HELPERS ---
        const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const formatDate = (dateObj) => dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const getDayNameFromDate = (dateObj) => dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        const parseTimeString = (timeStr) => {
          const match = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
          if (!match) return null;
          let h = parseInt(match[1]);
          const m = parseInt(match[2] || "00");
          const ampm = match[3] ? match[3].toUpperCase() : (h < 9 ? 'PM' : 'AM');
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          return h + (m / 60);
        };

        const formatTimeFromDecimal = (decimal) => {
          const h = Math.floor(decimal);
          const m = Math.round((decimal - h) * 60);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
          const displayM = m.toString().padStart(2, '0');
          return `${displayH}:${displayM} ${ampm}`;
        };

        const parseDateFromText = (text) => {
          let target = new Date(today);
          let dateFound = false;
          const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
          const monthFound = months.find(m => text.toLowerCase().includes(m));

          // Improved Regex: ensure we don't pick up PM/AM times as days
          const numMatch = text.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?!\s*(?:am|pm|:))/i);
          const dayNum = numMatch ? parseInt(numMatch[1]) : null;

          if (dayNum && dayNum <= 31) {
            if (monthFound) target.setMonth(months.indexOf(monthFound) % 12);
            target.setDate(dayNum);
            // If the date is significantly in the past, assume next month
            if (target.getTime() < today.getTime() - 86400000 && !monthFound) {
              target.setMonth(target.getMonth() + 1);
            }
            dateFound = true;
          }

          if (!dateFound) {
            const lowText = text.toLowerCase();
            if (lowText.includes("tomorrow")) { target.setDate(today.getDate() + 1); dateFound = true; }
            else if (lowText.includes("today") || lowText.includes("tonight") || lowText.includes("tonite")) {
              dateFound = true;
            }
            else {
              const dow = daysOfWeek.find(d => lowText.includes(d));
              if (dow) {
                const todayIdx = today.getDay();
                const targetIdx = daysOfWeek.indexOf(dow);
                let diff = targetIdx - todayIdx;
                if (diff <= 0) diff += 7;
                if (lowText.includes("next") && diff <= 3) diff += 7;
                target.setDate(today.getDate() + diff);
                dateFound = true;
              }
            }
          }
          return dateFound ? target : null;
        };

        const getOptimalTime = (date) => {
          const dName = getDayNameFromDate(date);
          const free = activities.find(s => s.isFreeSlot && (s.appliedDays?.includes(dName) || s.frequency === 'daily'));
          let bestH = free ? parseTimeString(free.time.split(' - ')[0]) || 16 : 16;

          // Strict Rule: Never schedule in the past
          const nowH = today.getHours() + (today.getMinutes() / 60);
          if (formatDate(date) === formatDate(today) && bestH <= nowH + 0.5) {
            bestH = Math.ceil(nowH + 1);
            if (bestH > 21) return null; // Too late today
          }
          return formatTimeFromDecimal(bestH);
        };

        const resources = [
          { label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" },
          { label: "Knowt", url: "https://knowt.com" },
          { label: "Quizlet", url: "https://quizlet.com" }
        ];

        // --- SUBJECT & CLASS RESOLUTION ---
        const lookup = [...commonSubjects, ...globalExams].sort((a, b) => b.length - a.length);

        // Priority 1: Current message (processed input with typos fixed)
        let subId = lookup.find(s => processedInput.includes(s));

        // Priority 2: If we are answering an intensity question, look for the previous subject
        if (!subId && isIntensityQuestion) {
          subId = lookup.find(s => lastAILower.includes(s));
        }

        // Priority 3: Last resort - search history
        if (!subId) {
          subId = lookup.find(s => conversationContext.toLowerCase().includes(s));
        }

        const classMatch = schedule && subId && schedule.find(c => {
          const n = c.name.toLowerCase();
          const s = (c.subject || "").toLowerCase();
          return n.includes(subId) || s.includes(subId);
        });

        const name = classMatch ? classMatch.name : (subId ? subId.charAt(0).toUpperCase() + subId.slice(1) : "General");

        // --- BRAIN: HANDLE INTENSITY OR NEW TASK ---
        const date = parseDateFromText(processedInput) || parseDateFromText(conversationContext.split('\n').slice(-4).join('\n'));

        if (date && (isTestRequest || isStandardizedTest || isIntensityQuestion)) {
          const dStr = formatDate(date);
          const diff = Math.floor((date - today) / 86400000);

          if (diff > 14 && !isIntensityQuestion) {
            return resolve({ message: `I've noted your ${name} test for ${dStr}. Would you like a Normal, Moderate, or Hardcore plan?` });
          }

          const mode = processedInput.includes("hard") ? "Hardcore" : (processedInput.includes("mod") ? "Moderate" : "Normal");
          const sessions = mode === "Hardcore" ? 7 : (mode === "Moderate" ? 5 : 3);

          // TASK 1: THE TEST
          newTasks.push({ id: crypto.randomUUID(), title: `${name} Test`, time: `${dStr}, 8:00 AM`, type: "task", priority: "high", description: `• Exam day.` });

          // TASKS 2+: SPACED REPETITION SESSIONS
          let sessionsAdded = 0;

          // Calculate Spacing Logic
          // If the test is more than 14 days away, we space them out.
          // Otherwise, we group them closer.
          const interval = diff > 21 ? Math.floor(diff / sessions) : (diff > 10 ? 3 : 1);

          for (let i = 1; i <= sessions; i++) {
            const d = new Date(date);

            // The first session (i=1) is ALWAYS the day before (Final Review)
            // Subsequent sessions are spaced out using the calculated interval
            const daysBack = i === 1 ? 1 : (i - 1) * interval;
            d.setDate(d.getDate() - daysBack);

            // Safety: Never schedule in the past
            if (d.setHours(23, 59, 59, 999) < today.getTime()) continue;

            const bestTime = getOptimalTime(d);
            if (bestTime) {
              const isFinal = (i === 1);
              newTasks.push({
                id: crypto.randomUUID(),
                title: `${name} ${isFinal ? 'Final Review' : 'Prep'}`,
                time: `${formatDate(d)}, ${bestTime}`,
                type: "study", resources,
                description: isFinal
                  ? `• Final Spaced Review: Active recall on high-yield ${name} concepts.`
                  : `• Repetition Session: Focusing on weak areas and practice sets.`
              });
              sessionsAdded++;
            }
          }
          return resolve({ newTasks, message: `I've mapped out a high-performance ${mode} plan for your ${name} test on ${dStr}. This uses spaced repetition across ${sessionsAdded} sessions to maximize retention.` });
        }

        // --- BRAIN: HANDLE ASSIGNMENTS / HW ---
        if (isAssignmentRequest) {
          const deadlineDate = parseDateFromText(processedInput) || today;
          let workDate = new Date(deadlineDate);

          // Try to extract a specific deadline time
          const deadlineMatch = processedInput.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          const deadlineTime = deadlineMatch ? deadlineMatch[1] + (deadlineMatch[2] ? ":" + deadlineMatch[2] : "") + " " + deadlineMatch[3].toUpperCase() : "11:59 PM";
          const deadlineH = parseTimeString(deadlineTime);

          // LOGIC: If due tommorow morning (before 10am), we MUST work on it TODAY.
          if (formatDate(deadlineDate) === formatDate(new Date(today.getTime() + 86400000)) && deadlineH < 10) {
            workDate = new Date(today);
          }

          const dStr = formatDate(workDate);
          const nowH = today.getHours() + (today.getMinutes() / 60);
          let targetH = 16; // default 4 PM

          if (formatDate(workDate) === formatDate(today)) {
            targetH = Math.max(16, Math.ceil(nowH + 0.5));
          }

          const overlap = currentTasks.find(t => {
            if (t.time && t.time.includes(dStr)) {
              const taskH = parseTimeString(t.time.split(', ')[1]);
              return Math.abs(taskH - targetH) < 0.8;
            }
            return false;
          });

          if (overlap) targetH += 1.5;

          const finalTime = formatTimeFromDecimal(targetH);
          newTasks.push({
            id: crypto.randomUUID(),
            title: `${name} Assignment`,
            time: `${dStr}, ${finalTime}`,
            type: "study",
            priority: "medium",
            resources,
            description: `• Work on ${name} assignment.\n• DEADLINE: ${formatDate(deadlineDate)} at ${deadlineTime}`
          });

          return resolve({ newTasks, message: `I've scheduled your ${name} assignment for ${dStr} at ${finalTime}. Since it's due early tomorrow morning, I made sure you finish it today!` });
        }

        // Context-aware fallback
        if (lines.length > 2) {
          resolve({ newTasks: [], message: "I didn't quite catch that. Could you clarify if you want to schedule a test or change a plan?" });
        } else {
          resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
        }
      } catch (err) {
        resolve({ newTasks: [], message: "I'm having a bit of trouble. Could you try again?" });
      }
    }, isStandardizedTest ? 1000 : 10);
  });
};
