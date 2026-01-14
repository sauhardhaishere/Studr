// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date(), onStep = null) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
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
          if (isNext && diff <= 3) diff += 7;
          return diff;
        };

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
            const numDateRegex = /(?:on\s+the\s+|on\s+|the\s+)(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)/i;
            const numMatch = text.match(numDateRegex);
            const dayNum = numMatch ? parseInt(numMatch[1] || numMatch[2]) : null;
            const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
            const monthFound = months.find(m => text.includes(m));
            if (dayNum && !text.includes("every")) {
              if (dayNum >= 1 && dayNum <= 31) {
                if (monthFound) {
                  const monthIdx = months.indexOf(monthFound) % 12;
                  target.setMonth(monthIdx);
                }
                target.setDate(dayNum);
                if (target < today && !monthFound) target.setMonth(target.getMonth() + 1);
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
            }
            if (foundDay) {
              const offset = getDayOffset(foundDay, text.includes("next"), text);
              target.setDate(today.getDate() + offset);
              dateFound = true;
            }
          }
          return dateFound ? target : null;
        };

        const routineBlocks = activities || [];
        const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
        const allExistingTasks = currentTasks || [];

        const getOptimalTaskTime = (date, durationHours = 1, preferenceHour = null) => {
          const dStr = formatDate(date);
          const dName = getDayNameFromDate(date);
          const dayTasks = allExistingTasks.filter(t => t.time.includes(dStr)).map(t => {
            const startTimeStr = t.time.includes(',') ? t.time.split(',')[1] : t.time;
            const startTime = parseTimeString(startTimeStr);
            const duration = t.duration ? (t.duration.includes('h') ? parseInt(t.duration) : parseInt(t.duration) / 60) : 1;
            return { start: startTime, end: startTime + duration };
          });
          newTasks.filter(t => t.time.includes(dStr)).forEach(t => {
            const startTimeStr = t.time.includes(',') ? t.time.split(',')[1] : t.time;
            const startTime = parseTimeString(startTimeStr);
            dayTasks.push({ start: startTime, end: startTime + 1 });
          });
          const dayFreeRange = freeSlots.find(s => s.appliedDays?.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');
          let blockStart = 16, blockEnd = 20;
          if (dayFreeRange) {
            const parts = dayFreeRange.time.split(' - ');
            blockStart = parseTimeString(parts[0]) || 16;
            blockEnd = parseTimeString(parts[1]) || (blockStart + 4);
          }
          if (preferenceHour !== null) {
            const isTaken = dayTasks.some(t => (preferenceHour >= t.start && preferenceHour < t.end) || (preferenceHour + durationHours > t.start && preferenceHour + durationHours <= t.end));
            const isInPastToday = dStr === formatDate(today) && preferenceHour <= (today.getHours() + today.getMinutes() / 60);
            if (!isTaken && !isInPastToday) return formatTimeFromDecimal(preferenceHour);
          }
          for (let t = blockStart; t <= blockEnd - durationHours; t += 0.5) {
            const isTaken = dayTasks.some(task => (t >= task.start && t < task.end) || (t + durationHours > task.start && t + durationHours <= task.end));
            const isInPastToday = dStr === formatDate(today) && t <= (today.getHours() + today.getMinutes() / 60);
            if (!isTaken && !isInPastToday) return formatTimeFromDecimal(t);
          }
          for (let t = 15; t <= 21 - durationHours; t += 0.5) {
            const isTaken = dayTasks.some(task => (t >= task.start && t < task.end) || (t + durationHours > task.start && t + durationHours <= task.end));
            const isInPastToday = dStr === formatDate(today) && t <= (today.getHours() + today.getMinutes() / 60);
            if (!isTaken && !isInPastToday) return formatTimeFromDecimal(t);
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

        const correctTypos = (text) => {
          if (!text) return text;
          const corrections = {
            "calclus": "Calculus", "calc": "Calculus", "calculs": "Calculus",
            "chemestry": "Chemistry", "biolgy": "Biology", "histroy": "History",
            "engish": "English", "spnsih": "Spanish", "spanih": "Spanish",
            "pysics": "Physics", "algbra": "Algebra", "goemetry": "Geometry",
            "precalc": "Precalculus", "trig": "Trigonometry", "calcus": "Calculus",
            "comp sci": "Computer Science", "cs": "Computer Science",
            "gaokoa": "Gaokao", "gaokow": "Gaokao"
          };
          let corrected = text;
          Object.keys(corrections).forEach(typo => {
            const regex = new RegExp(`\\b${typo}\\b`, 'gi');
            corrected = corrected.replace(regex, corrections[typo]);
          });
          return corrected;
        };

        const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "sat", "act", "lsat", "mcat", "ap", "latin", "french", "gaokao", "ielts", "toefl", "gre", "gmat"];
        const globalExams = ["sat", "act", "lsat", "mcat", "gaokao", "ielts", "toefl", "gre", "gmat"];

        const extractSubjectFromText = (text) => {
          const cleanText = text.toLowerCase();
          const mapMatch = subjectMap.find(s => cleanText.includes(s));
          if (mapMatch) return mapMatch;
          if (cleanText.includes("gaokoa") || cleanText.includes("gaokao")) return "gaokao";
          const testMatch = text.match(/([a-zA-Z0-9]+)\s+(?:test|exam|quiz)/i) || text.match(/(?:test|exam|quiz)\s+(?:for|on|in)?\s+([a-zA-Z0-9]+)/i);
          if (testMatch && !["a", "the", "my", "this"].includes(testMatch[1].toLowerCase())) return testMatch[1];
          return null;
        };

        let primarySubject = extractSubjectFromText(lastUserLower);
        const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment");
        const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
        const hasTaskMention = isTest || isAssignment;

        // Memory check
        if (!primarySubject && hasTaskMention) {
          for (let i = lines.length - 2; i >= 0; i--) {
            const s = extractSubjectFromText(lines[i]);
            if (s) { primarySubject = s; break; }
          }
        }

        const isAnsweringClassName = lastAILower.includes('full name of') || lastAILower.includes("full name of your");
        const isNegotiatingTime = lastAILower.includes('conflict') || lastAILower.includes('what time works');
        const isIntensityRequest = lastAILower.includes('intensity') || lastAILower.includes('study mode');
        const isCancellation = lastUserLower.includes('nevermind') || lastUserLower.includes('cancel');

        if (isCancellation) return resolve({ newTasks: [], message: "No problem. Let me know if you need anything else!" });

        if (isAnsweringClassName && lastUserMsg.length > 1 && !hasTaskMention) {
          const correctedName = correctTypos(lastUserMsg);
          const originalRequest = lines[lines.length - 3] || "";
          const originalDate = parseDateFromText(originalRequest.toLowerCase()) || new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
          const originalSubject = subjectMap.find(s => originalRequest.toLowerCase().includes(s)) || "General";
          newClasses.push({ id: crypto.randomUUID(), name: correctedName, subject: originalSubject.charAt(0).toUpperCase() + originalSubject.slice(1) });
          const diffDays = Math.floor((originalDate - today) / (1000 * 60 * 60 * 24));
          if (diffDays > 14) return resolve({ newClasses, message: `Perfect! I've added ${correctedName}. What study intensity do you prefer?` });
          const deadlineStr = formatDate(originalDate);
          newTasks.push({ id: crypto.randomUUID(), title: `${correctedName} Test`, time: `${deadlineStr}, 8:00 AM`, type: "task", priority: "high" });
          const sessions = diffDays > 7 ? 4 : 2;
          for (let i = 1; i <= sessions; i++) {
            const d = new Date(originalDate);
            const offset = (i === 1) ? 1 : Math.round((i - 1) * (diffDays / sessions));
            d.setDate(d.getDate() - offset);
            if (d >= today) {
              const bestTime = getOptimalTaskTime(d, 1);
              if (bestTime) newTasks.push({ id: crypto.randomUUID(), title: `${correctedName} ${i === 1 ? 'Final Review' : 'Prep'}`, time: `${formatDate(d)}, ${bestTime}`, type: "study", priority: "medium" });
            }
          }
          return resolve({ newTasks, newClasses, message: `All set! Added ${correctedName} and mapped your plan.` });
        }

        if (isIntensityRequest) {
          const intensity = lastUserLower.includes('hard') ? 'Hardcore' : (lastUserLower.includes('mod') ? 'Moderate' : 'Normal');
          const originalRequestLine = lines.find(l => l.toLowerCase().includes('test')) || "";
          const subFromRequest = extractSubjectFromText(originalRequestLine) || "Test";
          const subName = correctTypos(subFromRequest);
          const originalDate = parseDateFromText(originalRequestLine.toLowerCase()) || new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);
          const deadlineStr = formatDate(originalDate);
          const sessions = intensity === 'Hardcore' ? 8 : (intensity === 'Moderate' ? 5 : 3);
          const diffDays = Math.floor((originalDate - today) / (1000 * 60 * 60 * 24));
          const { getStrategyForSubject } = await import('./studyStrategies');
          const strategy = getStrategyForSubject(subName);
          newTasks.push({ id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`, type: "task", priority: "high" });
          for (let i = 1; i <= sessions; i++) {
            const d = new Date(originalDate);
            const offset = (i === 1) ? 1 : Math.round((i - 1) * (diffDays / (sessions / 2 + 1)));
            d.setDate(d.getDate() - offset);
            if (d >= today) {
              const bestTime = getOptimalTaskTime(d, 1);
              if (bestTime) newTasks.push({ id: crypto.randomUUID(), title: `${subName} Session ${i}`, time: `${formatDate(d)}, ${bestTime}`, type: "study", priority: "medium", description: strategy.advice, resources: strategy.resources });
            }
          }
          return resolve({ newTasks, message: `Got it! I've built your ${intensity} plan.` });
        }

        const targetDeadline = parseDateFromText(lastUserLower);
        const userRawTime = parseTimeString(lastUserLower) || (lastUserLower.includes('any') ? 16 : null);
        const classRes = schedule && schedule.find(c => primarySubject && (c.name.toLowerCase().includes(primarySubject) || (c.subject && c.subject.toLowerCase().includes(primarySubject))));
        const isGlobalExam = primarySubject && globalExams.includes(primarySubject.toLowerCase());

        if (hasTaskMention && !classRes && !isNegotiatingTime && !isGlobalExam) {
          return resolve({ newTasks: [], message: `I see you have a ${primarySubject || 'class'} test! What's the full name of that class in your schedule?` });
        }

        if (isNegotiatingTime && userRawTime !== null) {
          const confirmedSub = classRes ? classRes.name : (primarySubject ? primarySubject.charAt(0).toUpperCase() + primarySubject.slice(1) : "Test");
          const conflictDate = parseDateFromText(lastAILower) || targetDeadline || new Date();
          const reviewTime = formatTimeFromDecimal(userRawTime);
          newTasks.push({ id: crypto.randomUUID(), title: `${confirmedSub} Test`, time: `${formatDate(targetDeadline || conflictDate)}, 8:00 AM`, type: "task", priority: "high" });
          newTasks.push({ id: crypto.randomUUID(), title: `${confirmedSub} Review`, time: `${formatDate(conflictDate)}, ${reviewTime}`, type: "study", priority: "medium" });
          return resolve({ newTasks, message: `Scheduled for ${reviewTime} on ${formatDate(conflictDate)}.` });
        }

        const subName = classRes ? classRes.name : (primarySubject ? primarySubject.charAt(0).toUpperCase() + primarySubject.slice(1) : "General");

        if (hasTaskMention && targetDeadline) {
          const deadlineStr = formatDate(targetDeadline);
          const diffDays = Math.floor((targetDeadline - today) / (1000 * 60 * 60 * 24));

          if (onStep) onStep(`Integrating "${subName}" into your history...`);
          await new Promise(r => setTimeout(r, 1000));
          if (onStep) onStep(`Searching the web for "${subName}" strategies...`);
          await new Promise(r => setTimeout(r, 1500));
          if (onStep) onStep(`Mapping gaps in your routine...`);
          await new Promise(r => setTimeout(r, 1000));

          if (diffDays > 14) return resolve({ newTasks: [], message: `I've noted your ${subName} test for ${deadlineStr}. Would you like a Normal, Moderate, or Hardcore plan?` });

          if (isTest) {
            newTasks.push({ id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`, type: "task", priority: "high" });
            const sessions = diffDays > 7 ? 4 : 2;
            for (let i = 1; i <= sessions; i++) {
              const d = new Date(targetDeadline);
              const offset = (i === 1) ? 1 : Math.round((i - 1) * (diffDays / sessions));
              d.setDate(d.getDate() - offset);
              if (d >= today) {
                const bestTime = getOptimalTaskTime(d, 1);
                if (bestTime) newTasks.push({ id: crypto.randomUUID(), title: `${subName} ${i === 1 ? 'Final Review' : 'Prep'}`, time: `${formatDate(d)}, ${bestTime}`, type: "study", priority: "medium" });
              }
            }
            return resolve({ newTasks, message: `Got it! I've mapped out your ${subName} study plan for ${deadlineStr}.` });
          }
        }

        resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
      } catch (err) {
        console.error("Mock AI Error:", err);
        resolve({ newTasks: [], message: "I'm having a bit of trouble generating the plan right now." });
      }
    }, 800);
  });
};
