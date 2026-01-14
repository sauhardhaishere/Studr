// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date()) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const lower = conversationContext.toLowerCase();
      let message = "";
      let newTasks = [];
      let newActivities = [];
      let newClasses = [];

      // Extract conversation history
      const lines = conversationContext.split('\n');
      const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
      const lastUserLower = lastUserMsg.toLowerCase();
      const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
      const lastAILower = lastAILine.toLowerCase();

      // --- HELPER WRAPPERS ---
      // 1. Date Helpers
      const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayTypos = {
        "thurs": "thursday", "thur": "thursday", "thrudsay": "thursday", "thrusday": "thursday",
        "tues": "tuesday", "tuseday": "tuesday", "wednes": "wednesday", "wenesday": "wednesday", "wed": "wednesday", "weds": "wednesday",
        "mon": "monday", "fri": "friday", "sat": "saturday", "sun": "sunday"
      };

      const getDayOffset = (targetDayName, isNext, textContext) => {
        const todayIdx = today.getDay();
        const targetIdx = daysOfWeek.indexOf(targetDayName.toLowerCase());
        if (targetIdx === -1) return 3;
        let diff = targetIdx - todayIdx;
        if (diff < 0) diff += 7;
        if (diff === 0 && !textContext.includes("today")) diff = 7;

        // Logical "Next" - Only skip a week if the day is in the next 2 days
        // (e.g. on Monday, "Next Tuesday" = 8 days away, but "Next Saturday" = 5 days away)
        if (isNext && diff <= 3) diff += 7;
        return diff;
      };

      const formatDate = (dateObj) => dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const getDayNameFromDate = (dateObj) => dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      // 2. Time Parsers
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

        // Try to find relative dates like "in 4 weeks" or "in 3 days"
        const relativeMatch = text.match(/in\s+(\d+)\s+(week|day|month)s?/i);
        if (relativeMatch) {
          const num = parseInt(relativeMatch[1]);
          const unit = relativeMatch[2].toLowerCase();
          if (unit.startsWith('week')) target.setDate(today.getDate() + (num * 7));
          else if (unit.startsWith('day')) target.setDate(today.getDate() + num);
          else if (unit.startsWith('month')) target.setMonth(target.getMonth() + num);
          dateFound = true;
        }

        if (!dateFound) {
          // Try to find a numerical date like "the 27th" or "Jan 27"
          // Also handle "on the 27" or "27th"
          // Require either a prefix (on, the) or a suffix (st, nd, rd, th) to avoid non-date numbers
          const numDateRegex = /(?:on\s+the\s+|on\s+|the\s+)(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)/i;
          const numMatch = text.match(numDateRegex);
          const dayNum = numMatch ? parseInt(numMatch[1] || numMatch[2]) : null;

          const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
          const monthFound = months.find(m => text.includes(m));

          if (dayNum && !text.includes("period") && !text.includes("room") && !text.includes("every")) {
            if (dayNum >= 1 && dayNum <= 31) {
              if (monthFound) {
                const monthIdx = months.indexOf(monthFound) % 12;
                target.setMonth(monthIdx);
              }
              target.setDate(dayNum);

              // If the date is in the past relative to today, assume next month
              if (target < today && !monthFound) {
                target.setMonth(target.getMonth() + 1);
              }
              dateFound = true;
            }
          }
        }

        if (dateFound) return target;

        if (text.includes("tomorrow")) { target.setDate(today.getDate() + 1); dateFound = true; }
        else if (text.includes("today")) { dateFound = true; }
        else {
          let foundDay = daysOfWeek.find(d => text.includes(d));
          if (!foundDay) {
            const typoKey = Object.keys(dayTypos).find(t => text.includes(t));
            if (typoKey) foundDay = dayTypos[typoKey];
            else if (text.includes("wen")) foundDay = "wednesday";
          }
          if (foundDay) {
            const offset = getDayOffset(foundDay, text.includes("next"), text);
            target.setDate(today.getDate() + offset);
            dateFound = true;
          }
        }
        return dateFound ? target : null;
      };

      // 3. Scheduling Helpers
      const routineBlocks = activities || [];
      const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
      const allExistingTasks = currentTasks || [];

      const getOptimalTaskTime = (date, durationHours = 1, preferenceHour = null) => {
        const dStr = formatDate(date);
        const dName = getDayNameFromDate(date);

        // Existing tasks on this day
        const dayTasks = allExistingTasks.filter(t => t.time.includes(dStr)).map(t => {
          const startTimeStr = t.time.includes(',') ? t.time.split(',')[1] : (t.time.includes(' at ') ? t.time.split(' at ')[1] : t.time);
          const startTime = parseTimeString(startTimeStr);
          const duration = t.duration ? (t.duration.includes('h') ? parseInt(t.duration) : parseInt(t.duration) / 60) : 1;
          return { start: startTime, end: startTime + duration };
        });

        // Current AI plan tasks (prevent self-overlap)
        newTasks.filter(t => t.time.includes(dStr)).forEach(t => {
          const startTimeStr = t.time.includes(',') ? t.time.split(',')[1] : t.time;
          const startTime = parseTimeString(startTimeStr);
          dayTasks.push({ start: startTime, end: startTime + 1 });
        });

        const dayFreeRange = freeSlots.find(s => s.appliedDays?.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');
        let blockStart = 16, blockEnd = 20; // Default 4-8 PM
        if (dayFreeRange) {
          const parts = dayFreeRange.time.split(' - ');
          blockStart = parseTimeString(parts[0]) || 16;
          blockEnd = parseTimeString(parts[1]) || (blockStart + 4);
        }

        if (preferenceHour !== null) {
          const isTaken = dayTasks.some(t => (preferenceHour >= t.start && preferenceHour < t.end) || (preferenceHour + durationHours > t.start && preferenceHour + durationHours <= t.end));
          if (!isTaken) return formatTimeFromDecimal(preferenceHour);
        }

        // Try to find a gap in the free slot
        for (let t = blockStart; t <= blockEnd - durationHours; t += 0.5) {
          const isTaken = dayTasks.some(task => (t >= task.start && t < task.end) || (t + durationHours > task.start && t + durationHours <= task.end));
          if (!isTaken) return formatTimeFromDecimal(t);
        }

        // If no gap in free slot, try anywhere between 3 PM and 9 PM as fallback
        for (let t = 15; t <= 21 - durationHours; t += 0.5) {
          const isTaken = dayTasks.some(task => (t >= task.start && t < task.end) || (t + durationHours > task.start && t + durationHours <= task.end));
          if (!isTaken) return formatTimeFromDecimal(t);
        }

        return null;
      };

      const getResources = (isReview = false) => {
        const res = [{ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" }];
        if (isReview) {
          res.push({ label: "Knowt", url: "https://knowt.com" });
          res.push({ label: "Quizlet", url: "https://quizlet.com" });
        }
        return res;
      };

      const getStudyAdvice = (sub, stage) => {
        const s = sub.toLowerCase();
        if (stage === 'final') {
          if (s.includes('math') || s.includes('calc')) return "• Work for 60 minutes. Complete a full practice test under timed conditions. Review your 'error log'.";
          if (s.includes('latin') || s.includes('spanish') || s.includes('english')) return "• Work for 60 minutes. Conduct a mock conversation or vocabulary blitz. Use active recall on every key term.";
          return "• Work for 60 minutes. Conduct a mock exam. Use active recall on every key concept.";
        }
        return "• Work for 45 minutes. Re-organize your notes and identify the 5 most likely exam topics.";
      };

      // AUTO CORRECT HELPER
      const correctTypos = (text) => {
        const corrections = {
          "calclus": "Calculus", "calc": "Calculus", "calculs": "Calculus",
          "chemestry": "Chemistry", "biolgy": "Biology", "histroy": "History",
          "engish": "English", "spnsih": "Spanish", "spanih": "Spanish",
          "pysics": "Physics", "algbra": "Algebra", "goemetry": "Geometry",
          "precalc": "Precalculus", "trig": "Trigonometry", "calcus": "Calculus",
          "comp sci": "Computer Science", "cs": "Computer Science"
        };
        let corrected = text;
        Object.keys(corrections).forEach(typo => {
          const regex = new RegExp(`\\b${typo}\\b`, 'gi');
          corrected = corrected.replace(regex, corrections[typo]);
        });
        return corrected;
      };

      // --- SUBJECT DETECTION ---
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "sat", "act", "lsat", "mcat", "ap", "latin", "french"];

      const extractSubjectFromText = (text) => {
        // 1. Look for explicit map matches
        const mapMatch = subjectMap.find(s => text.toLowerCase().includes(s));
        if (mapMatch) return mapMatch;

        // 2. Look for "X test" or "test for X"
        const testMatch = text.match(/(\w+)\s+(?:test|exam|quiz)/i) || text.match(/(?:test|exam|quiz)\s+(?:for|on|in)?\s+(\w+)/i);
        if (testMatch && !["a", "the", "my", "this"].includes(testMatch[1].toLowerCase())) {
          return testMatch[1];
        }
        return null;
      };

      let primarySubject = extractSubjectFromText(lastUserLower);

      // Only look back if current message has NO subject but talks about a task
      if (!primarySubject && (isTest || isAssignment)) {
        for (let i = lines.length - 2; i >= 0; i--) {
          const s = extractSubjectFromText(lines[i]);
          if (s) { primarySubject = s; break; }
        }
      }

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lower.includes("homework") || lower.includes("hw");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz") || lower.includes("test") || lower.includes("exam") || lower.includes("quiz");
      const hasTaskMention = isTest || isAssignment;
      const currentMsgIsTask = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");

      // --- AGENTIC MEMORY: CLASS CREATION & AUTO-SCHEDULE ---
      const isAnsweringClassName = lastAILower.includes('full name of that class') || lastAILower.includes("full name of your");
      const isNegotiatingTime = lastAILower.includes('conflict') || lastAILower.includes('what time works');
      const isIntensityRequest = lastAILower.includes('intensity') || lastAILower.includes('study mode');
      const isCancellation = lastUserLower.includes('nevermind') || lastUserLower.includes('cancel') || lastUserLower.includes('forget it');

      if (isCancellation) {
        return resolve({ newTasks: [], message: "No problem. Let me know if you need anything else!" });
      }

      if (isAnsweringClassName && lastUserMsg.length > 1 && !currentMsgIsTask) {
        // Auto Correct The Name
        const correctedName = correctTypos(lastUserMsg);

        // 1. Find Original Request to get DATE and SUBJECT
        const originalRequest = lines[lines.length - 3] || "";
        const originalLower = originalRequest.toLowerCase();
        const originalDate = parseDateFromText(originalLower) || new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

        const originalSubject = subjectMap.find(s => originalLower.includes(s)) || "General";
        const subCategory = originalSubject.charAt(0).toUpperCase() + originalSubject.slice(1);

        // 2. Create the Class using CORRECTED name
        const newClass = { id: crypto.randomUUID(), name: correctedName, subject: subCategory };
        newClasses.push(newClass);

        // 3. Check if we need intensity
        const diffDays = Math.floor((originalDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays > 14) {
          return resolve({ newClasses, message: `Perfect! I've added ${correctedName} to your schedule. Since this test is over 2 weeks away, what study intensity do you prefer: Normal, Moderate, or Hardcore?` });
        }

        // 4. IMMEDIATELY Schedule the Tasks
        const subName = correctedName;
        const deadlineStr = formatDate(originalDate);

        newTasks.push({
          id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
          type: "task", priority: "high", description: `• Exam day for ${subName}.`
        });

        const sessions = diffDays > 7 ? 4 : 2;
        for (let i = 1; i <= sessions; i++) {
          const d = new Date(originalDate); d.setDate(d.getDate() - (i * Math.floor(diffDays / sessions) || 1));
          if (d >= today) {
            const bestTime = getOptimalTaskTime(d, 1);
            if (bestTime) {
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} ${i === 1 ? 'Review' : 'Prep'}`, time: `${formatDate(d)}, ${bestTime}`,
                duration: "1h", type: "study", priority: "medium",
                description: getStudyAdvice(subName, i === 1 ? 'final' : 'prep'),
                resources: getResources(true)
              });
            }
          }
        }

        return resolve({
          newTasks,
          newClasses,
          message: `Perfect! I've added ${subName} to your schedule and mapped out a ${sessions}-day study plan for ${deadlineStr}.`
        });
      }

      // Handle Intensity Response
      if (isIntensityRequest) {
        const intensity = lastUserLower.includes('hard') ? 'Hardcore' : (lastUserLower.includes('mod') ? 'Moderate' : 'Normal');
        const originalRequest = lines.find(l => l.toLowerCase().includes('test')) || "";
        const originalDate = parseDateFromText(originalRequest.toLowerCase()) || new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);
        const subName = correctTypos(originalRequest.split(' ')[0] || "Test");
        const deadlineStr = formatDate(originalDate);

        const sessions = intensity === 'Hardcore' ? 8 : (intensity === 'Moderate' ? 5 : 3);

        newTasks.push({
          id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
          type: "task", priority: "high", description: `• Exam day for ${subName}.`
        });

        const diffDays = Math.floor((originalDate - today) / (1000 * 60 * 60 * 24));
        for (let i = 1; i <= sessions; i++) {
          const d = new Date(originalDate); d.setDate(d.getDate() - Math.floor(i * (diffDays / (sessions + 1))));
          if (d >= today) {
            const bestTime = getOptimalTaskTime(d, 1);
            if (bestTime) {
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} Study Session ${i}`, time: `${formatDate(d)}, ${bestTime}`,
                duration: intensity === 'Hardcore' ? "2h" : "1h", type: "study", priority: "medium",
                description: `• ${intensity} session. Focus on active recall and practice problems.`,
                resources: getResources(true)
              });
            }
          }
        }
        return resolve({ newTasks, message: `Got it! I've mapped out a ${intensity} study plan with ${sessions} sessions leading up to your test on ${deadlineStr}.` });
      }

      // --- MAIN SCHEDULING (Standard Flow) ---
      const targetDeadline = parseDateFromText(lastUserLower);
      const userRawTime = parseTimeString(lastUserLower) || (lastUserLower.includes('any') ? 16 : null);

      // Check for class matching subject
      const classRes = schedule && schedule.find(c => primarySubject && (c.name.toLowerCase().includes(primarySubject) || (c.subject && c.subject.toLowerCase().includes(primarySubject))));

      if (hasTaskMention && !classRes && !isNegotiatingTime) {
        return resolve({ newTasks: [], message: `I see you have a ${primarySubject || 'class'} test coming up! What's the full name of that class in your schedule?` });
      }

      // Conflict Negotiation Response
      if (isNegotiatingTime && userRawTime !== null) {
        const testRequest = lines.find(l => l.toLowerCase().includes('test')) || "";
        const confirmedSub = classRes ? classRes.name : (primarySubject ? primarySubject.charAt(0).toUpperCase() + primarySubject.slice(1) : "Test");
        const conflictDate = parseDateFromText(lastAILower) || targetDeadline || new Date();

        const reviewTime = formatTimeFromDecimal(userRawTime);

        newTasks.push({
          id: crypto.randomUUID(), title: `${confirmedSub} Test`, time: `${formatDate(targetDeadline || conflictDate)}, 8:00 AM`,
          type: "task", priority: "high", description: `• Exam day.`
        });
        newTasks.push({
          id: crypto.randomUUID(), title: `${confirmedSub} Review`, time: `${formatDate(conflictDate)}, ${reviewTime}`,
          duration: "1h", type: "study", priority: "medium",
          description: `• Final active recall session.`,
          resources: [{ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" }]
        });

        return resolve({ newTasks, message: `Got it. I've scheduled your study session for ${reviewTime} on ${formatDate(conflictDate)}.` });
      }

      const subName = classRes ? classRes.name : (primarySubject ? primarySubject.charAt(0).toUpperCase() + primarySubject.slice(1) : "General");

      if (hasTaskMention && targetDeadline) {
        const deadlineStr = formatDate(targetDeadline);
        const diffDays = Math.floor((targetDeadline - today) / (1000 * 60 * 60 * 24));

        if (diffDays > 14) {
          return resolve({ newTasks: [], message: `I've noted your ${subName} test for ${deadlineStr}. Since it's quite a bit away, would you like a Normal, Moderate, or Hardcore study plan?` });
        }

        let missingSpotDay = null;

        if (isTest) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${subName}.`
          });

          const sessions = diffDays > 7 ? 4 : 2;
          for (let i = 1; i <= sessions; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - (i * Math.floor(diffDays / sessions) || 1));
            if (d >= today) {
              const bestTime = getOptimalTaskTime(d, 1);
              if (!bestTime) { missingSpotDay = getDayNameFromDate(d); break; }
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} ${i === 1 ? 'Review' : 'Prep'}`, time: `${formatDate(d)}, ${bestTime}`,
                duration: "1h", type: "study", priority: "medium",
                description: getStudyAdvice(subName, i === 1 ? 'final' : 'prep'),
                resources: getResources(true)
              });
            }
          }

          if (missingSpotDay) {
            return resolve({
              newTasks: [],
              message: `I noticed a conflict on ${missingSpotDay}—I couldn't find a free gap in your routine. What time works best for you to study for ${subName} that day? (You can say 'any' to pick 4 PM)`
            });
          }

          return resolve({ newTasks, message: `Got it! I've automatically found gaps in your free time and mapped out a specific study plan for your ${subName} test on ${deadlineStr}.` });
        }
      }

      if (lastUserLower.includes("help") || lastUserLower.includes("what can you do")) {
        return resolve({ newTasks: [], message: "I'm here to help you dominate your classes! You can tell me about upcoming tests or homework, ask to add a new class, or update your routine blocks in the Schedule tab." });
      }

      resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
    }, 800);
  });
};
