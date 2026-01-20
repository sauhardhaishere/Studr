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
      "physics": "physics", "phys": "physics",
      "tommorow": "tomorrow", "tommorrow": "tomorrow", "tmrw": "tomorrow", "wenesday": "wednesday", "wensday": "wednesday",
      "econ": "economics", "ecomic": "economics"
    };

    let processedInput = userCleanInput;
    Object.keys(corrections).forEach(typo => {
      const regex = new RegExp(`\\b${typo}\\b`, 'g'); // Whole word match for typo correction
      processedInput = processedInput.replace(regex, corrections[typo]);
      // Fallback for non-boundary cases if needed
      if (processedInput.includes(typo)) processedInput = processedInput.replace(typo, corrections[typo]);
    });

    const commonSubjects = ["math", "science", "history", "english", "spanish", "physics", "biology", "chemistry", "algebra", "geometry", "calculus", "stats", "latin", "economics", "govt", "psychology"];
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
          let target = new Date(today.getTime());
          target.setHours(0, 0, 0, 0);
          let dateFound = false;
          const lowText = text.toLowerCase();

          const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
          const monthFound = months.find(m => lowText.includes(m));

          // 1. Check for "in X days"
          const inDaysMatch = lowText.match(/in\s+(\d+)\s+day/);
          if (inDaysMatch) {
            target.setDate(today.getDate() + parseInt(inDaysMatch[1]));
            return target;
          }

          // 2. Exact Day Matching (e.g., "Jan 20")
          // Avoid matching 8 in "8 am" by checking for boundaries and ensuring it's not a time
          const dayMatch = lowText.match(/(?:\b|on\s+|the\s+)(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*[:\.]\d+|[hrs]*\s*(?:am|pm))/i);
          const dayNum = dayMatch ? parseInt(dayMatch[1]) : null;

          if (dayNum && dayNum <= 31 && (monthFound || lowText.includes("the "))) {
            if (monthFound) target.setMonth(months.indexOf(monthFound) % 12);
            target.setDate(dayNum);
            if (target.getTime() < today.getTime() - 86400000 && !monthFound) {
              target.setMonth(target.getMonth() + 1);
            }
            dateFound = true;
          }

          // 3. Relative Day Matching (e.g., "tomorrow", "Wednesday")
          if (!dateFound) {
            if (lowText.includes("tomorrow")) {
              target.setDate(today.getDate() + 1);
              dateFound = true;
            }
            else if (lowText.includes("today") || lowText.includes("tonight")) {
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

        const getOptimalTime = (date, futureTasks = []) => {
          const dStr = formatDate(date);
          const dName = getDayNameFromDate(date);

          // Get base time from free slot or default to 4 PM
          const free = activities.find(s => s.isFreeSlot && (s.appliedDays?.includes(dName) || s.frequency === 'daily'));
          let bestH = free ? parseTimeString(free.time.split(' - ')[0]) || 16 : 16;

          // Never schedule in the past
          const nowH = today.getHours() + (today.getMinutes() / 60);
          if (formatDate(date) === formatDate(today)) {
            bestH = Math.max(bestH, Math.ceil(nowH + 0.5));
          }

          // Check for conflicts recursively
          const isTimeTaken = (h) => {
            // Check existing tasks
            const existingConflict = currentTasks.find(t => {
              if (t.time && t.time.includes(dStr)) {
                const taskH = parseTimeString(t.time.split(', ')[1]);
                return Math.abs(taskH - h) < 1; // 1 hour buffer
              }
              return false;
            });
            if (existingConflict) return true;

            // Check future tasks (being generated right now)
            const futureConflict = futureTasks.find(t => {
              if (t.time && t.time.includes(dStr)) {
                const taskH = parseTimeString(t.time.split(', ')[1]);
                return Math.abs(taskH - h) < 1;
              }
              return false;
            });
            return !!futureConflict;
          };

          // Find first available slot
          let iterations = 0;
          while (isTimeTaken(bestH) && iterations < 5) {
            bestH += 1.5; // Offset by 1.5 hours for next slot
            iterations++;
          }

          if (bestH > 22) return null; // Too late
          return formatTimeFromDecimal(bestH);
        };

        const resources = [
          { label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" },
          { label: "Knowt", url: "https://knowt.com" },
          { label: "Quizlet", url: "https://quizlet.com" }
        ];

        // --- ADVANCED MULTI-INTENT PARSING ---
        const lookup = [...commonSubjects, ...globalExams].sort((a, b) => b.length - a.length);

        // Split input by 'and', 'also', or commas to handle "Math on Fri AND Science on Mon"
        const clauses = processedInput.split(/\s+and\s+|\s*,\s*|\s+also\s+/);
        let combinedMessage = "";
        let tasksGeneratedCount = 0;

        for (const clause of clauses) {
          const clauseLower = clause.trim();
          if (!clauseLower) continue;

          // 1. Detect Subject in this clause
          const subId = lookup.find(s => clauseLower.includes(s));
          // Fallback to global context if not found in clause (for single subject split across lines)
          const finalSubId = subId || (clauses.length === 1 ? lookup.find(s => conversationContext.toLowerCase().includes(s)) : null);

          if (!finalSubId && clauses.length > 1) continue; // Skip empty clauses in multi-clause
          const subjectToUse = finalSubId || "General";

          // 2. Detect Date in this clause
          const clauseDate = parseDateFromText(clauseLower);
          // Verify date is valid and future. If no date in clause, fallback to global date or today
          const finalDate = clauseDate || (clauses.length === 1 ? (parseDateFromText(processedInput) || parseDateFromText(conversationContext.split('\n').slice(-4).join('\n'))) : null);

          if (!finalDate && clauses.length > 1) continue; // Skip if we can't pin a date for this specific test
          if (!finalDate) continue; // Should have handled fallback above

          // 3. Resolve Class Name
          const classMatch = schedule && schedule.find(c => {
            const n = c.name.toLowerCase();
            const s = (c.subject || "").toLowerCase();
            return n.includes(subjectToUse) || s.includes(subjectToUse);
          });
          const name = classMatch ? classMatch.name : (subjectToUse.charAt(0).toUpperCase() + subjectToUse.slice(1));

          // 4. Determine Terminology
          const isQuiz = clauseLower.includes("quiz");
          const term = isQuiz ? "Quiz" : "Test";

          const dStr = formatDate(finalDate);
          const diff = Math.floor((finalDate - today) / 86400000);

          // 5. Generate Test Task
          newTasks.push({ id: crypto.randomUUID(), title: `${name} ${term}`, time: `${dStr}, 8:00 AM`, type: "task", priority: "high", description: `• Exam day.` });

          // 6. Generate Prep Sessions (Staggered)
          const mode = clauseLower.includes("hard") ? "Hardcore" : (clauseLower.includes("mod") ? "Moderate" : "Normal");
          const sessions = mode === "Hardcore" ? 7 : (mode === "Moderate" ? 5 : 3);

          // Calculate Spacing
          const totalAvailableDays = diff - 1;

          for (let i = 1; i <= sessions; i++) {
            const d = new Date(finalDate);
            let daysBack = 1;

            if (sessions > 1) {
              if (diff > 2) {
                const pct = (i - 1) / (sessions - 1);
                daysBack = 1 + Math.round(pct * (totalAvailableDays - 1));
              } else {
                daysBack = i;
              }
            } else {
              daysBack = 1;
            }

            d.setDate(d.getDate() - daysBack);

            // --- LOAD BALANCING / STAGGERING ---
            // Check if we already scheduled a study task on this day for ANOTHER subject
            // If so, try to shift back 1 day to interleave
            const dString = formatDate(d);
            const busyWithOtherStudy = newTasks.find(t =>
              t.type === 'study' &&
              t.time.startsWith(dString) &&
              !t.title.includes(name) // It's another subject
            );

            if (busyWithOtherStudy && totalAvailableDays > sessions) {
              // Try shifting back 1 day
              d.setDate(d.getDate() - 1);
            }
            // ------------------------------------

            if (d.setHours(23, 59, 59, 999) < today.getTime()) continue;

            const bestTime = getOptimalTime(d, newTasks);
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
            }
          }

          if (combinedMessage) combinedMessage += " Also ";
          else combinedMessage = "I've mapped out a plan for ";
          combinedMessage += `your ${name} ${term} on ${dStr}`;
          tasksGeneratedCount++;
        }

        if (tasksGeneratedCount > 0) {
          return resolve({ newTasks, message: `${combinedMessage}. Good luck!` });
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
          const finalTime = getOptimalTime(workDate, newTasks);
          if (!finalTime) return resolve({ newTasks: [], message: "I couldn't find a free slot for your assignment tonight. Try clearing some time!" });

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
