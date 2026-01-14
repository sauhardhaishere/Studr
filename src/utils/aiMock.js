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
        if (isNext && targetIdx > todayIdx) diff += 7;
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
          const startTime = parseTimeString(t.time.split(',')[1]);
          const duration = t.duration ? (t.duration.includes('h') ? parseInt(t.duration) : parseInt(t.duration) / 60) : 1;
          return { start: startTime, end: startTime + duration };
        });

        // Current AI plan tasks (prevent self-overlap)
        newTasks.filter(t => t.time.includes(dStr)).forEach(t => {
          const startTime = parseTimeString(t.time.split(',')[1]);
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

        for (let t = blockStart; t <= blockEnd - durationHours; t += 0.5) {
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
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap"];

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lower.includes("homework") || lower.includes("hw");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz") || lower.includes("test") || lower.includes("exam") || lower.includes("quiz");
      const hasTaskMention = isTest || isAssignment;
      const currentMsgIsTask = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");

      // --- AGENTIC MEMORY: CLASS CREATION & AUTO-SCHEDULE ---
      const isAnsweringClassName = lastAILower.includes('full name of that class') || lastAILower.includes("full name of your");
      const isNegotiatingTime = lastAILower.includes('conflict') || lastAILower.includes('what time works');

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

        // 3. IMMEDIATELY Schedule the Tasks
        const subName = correctedName;
        const deadlineStr = formatDate(originalDate);

        const origIsTest = originalLower.includes('test') || originalLower.includes('exam');
        const origIsHW = originalLower.includes('homework') || originalLower.includes('hw');

        if (origIsTest || !origIsHW) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${subName}.`
          });
          for (let i = 1; i <= 2; i++) {
            const d = new Date(originalDate); d.setDate(d.getDate() - i);
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
        } else {
          const bestTime = getOptimalTaskTime(originalDate, 1);
          if (bestTime) {
            newTasks.push({
              id: crypto.randomUUID(), title: `${subName} Work`, time: `${deadlineStr}, ${bestTime}`,
              duration: "45m", type: "study", priority: "medium",
              description: `• Complete assignment for ${subName}.`,
              resources: getResources(false)
            });
          }
        }

        return resolve({
          newTasks,
          newClasses,
          message: `Perfect! I've added **${subName}** to your schedule (Subject: ${subCategory}) and mapped out your study plan for ${deadlineStr}.`
        });
      }

      // --- MAIN SCHEDULING (Standard Flow) ---
      let foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));
      if (foundSubjects.length === 0) {
        for (let i = lines.length - 1; i >= 0; i--) {
          const lineLow = lines[i].toLowerCase();
          const hit = subjectMap.find(s => lineLow.includes(s));
          if (hit) { foundSubjects = [hit]; break; }
        }
      }
      const uniqueSubjects = [...new Set(foundSubjects)];
      const primarySubject = uniqueSubjects[0];

      const targetDeadline = parseDateFromText(lastUserLower) || new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
      const userRawTime = parseTimeString(lastUserLower);

      // Check for class matching subject
      const classRes = schedule && schedule.find(c => primarySubject && (c.name.toLowerCase().includes(primarySubject) || (c.subject && c.subject.toLowerCase().includes(primarySubject))));

      if (hasTaskMention && !classRes && !isNegotiatingTime) {
        return resolve({ newTasks: [], message: `I see you have a ${primarySubject || 'class'} test coming up! What's the full name of that class in your schedule?` });
      }

      // Conflict Negotiation Response
      if (isNegotiatingTime && userRawTime !== null) {
        const testMatch = lower.match(/(\w+)\s+test/);
        const confirmedSub = testMatch ? testMatch[1] : (classRes ? classRes.name : "Class");
        const conflictDate = parseDateFromText(lower) || targetDeadline;

        const reviewTime = formatTimeFromDecimal(userRawTime);

        newTasks.push({
          id: crypto.randomUUID(), title: `${confirmedSub} Test`, time: `${formatDate(new Date(conflictDate.getTime() + 86400000))}, 8:00 AM`,
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

      if (hasTaskMention) {
        const deadlineStr = formatDate(targetDeadline);
        let missingSpotDay = null;

        if (isTest) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${subName}.`
          });

          for (let i = 1; i <= 2; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
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
              message: `I noticed a conflict on ${missingSpotDay}—I couldn't find a free gap in your routine. What time works best for you to study for ${subName} that day?`
            });
          }

          return resolve({ newTasks, message: `Got it! I've automatically found gaps in your free time and mapped out a specific study plan for your ${subName} test on ${deadlineStr}.` });
        }
      }

      resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
    }, 800);
  });
};
