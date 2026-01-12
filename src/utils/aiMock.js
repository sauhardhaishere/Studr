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

      // --- DYNAMIC DATE CALCULATOR ---
      const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayTypos = {
        "thurs": "thursday", "thur": "thursday", "thrusday": "thursday", "thrudsay": "thursday",
        "tues": "tuesday", "tuseday": "tuesday", "wednes": "wednesday", "wenesday": "wednesday", "wed": "wednesday", "weds": "wednesday",
        "mon": "monday", "fri": "friday", "sat": "saturday", "sun": "sunday"
      };

      const getDayOffset = (targetDayName, isNext) => {
        const todayIdx = today.getDay();
        const targetIdx = daysOfWeek.indexOf(targetDayName.toLowerCase());
        if (targetIdx === -1) return 3;
        let diff = targetIdx - todayIdx;
        if (diff < 0) diff += 7;
        if (diff === 0 && !lastUserLower.includes("today")) diff = 7;
        if (isNext) diff += 7;
        return diff;
      };

      const formatDate = (dateObj) => dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const getDayNameFromDate = (dateObj) => dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      // --- ADVANCED TIME PARSER (Handles Ranges & Durations) ---
      const parseTimeString = (timeStr) => {
        const match = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
        if (!match) return null;
        let h = parseInt(match[1]);
        const m = parseInt(match[2] || "00");
        const ampm = match[3] ? match[3].toUpperCase() : (h < 9 ? 'PM' : 'AM'); // Smart default
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

      const userRawTime = parseTimeString(lastUserLower);

      // --- DATE PARSING ---
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
            target.setDate(today.getDate() + getDayOffset(foundDay, text.includes("next")));
            dateFound = true;
          }
        }
        return dateFound ? target : null;
      };

      const targetDeadline = parseDateFromText(lastUserLower) || new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

      // --- SUBJECT DETECTION ---
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap"];

      // 1. Check CURRENT message first (Priority)
      let foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));

      // 2. Fallback to History only if ambiguous
      if (foundSubjects.length === 0) {
        // Scan reversed history to find the LATEST mentioned subject
        for (let i = lines.length - 1; i >= 0; i--) {
          const lineLow = lines[i].toLowerCase();
          const hit = subjectMap.find(s => lineLow.includes(s));
          if (hit) { foundSubjects = [hit]; break; }
        }
      }

      const uniqueSubjects = [...new Set(foundSubjects)];
      const primarySubject = uniqueSubjects[0];

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lower.includes("homework") || lower.includes("hw");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz") || lower.includes("test") || lower.includes("exam") || lower.includes("quiz");
      const hasTaskMention = isTest || isAssignment;

      // Strict flag: Did the user START a new request in this exact message?
      const currentMsgIsTask = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");

      // --- AGENTIC MEMORY ---
      const isAnsweringClassName = lastAILower.includes('full name of that class') || lastAILower.includes("full name of your");
      const isNegotiatingTime = lastAILower.includes('conflict') || lastAILower.includes('what time works');

      if (isAnsweringClassName && lastUserMsg.length > 1 && !currentMsgIsTask) {
        const subjectFound = primarySubject || "General";
        const subCategory = subjectFound.charAt(0).toUpperCase() + subjectFound.slice(1);
        const newClass = { id: crypto.randomUUID(), name: lastUserMsg, subject: subCategory };
        return resolve({
          newTasks: [],
          newClasses: [newClass],
          message: `Awesome! I've added **${lastUserMsg}** to your schedule. Should I go ahead and schedule that study plan for this week?`
        });
      }

      // --- SMART GAP FINING ENGINE ---
      const routineBlocks = activities || [];
      const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
      const allExistingTasks = currentTasks || [];

      const getOptimalTaskTime = (date, durationHours = 1, preferenceHour = null) => {
        const dStr = formatDate(date);
        const dName = getDayNameFromDate(date);
        const dayTasks = allExistingTasks.filter(t => t.time.includes(dStr)).map(t => {
          const startTime = parseTimeString(t.time.split(',')[1]);
          const duration = t.duration ? (t.duration.includes('h') ? parseInt(t.duration) : parseInt(t.duration) / 60) : 1;
          return { start: startTime, end: startTime + duration };
        });

        // Current AI plan tasks (to avoid overlapping same-day new preps)
        newTasks.filter(t => t.time.includes(dStr)).forEach(t => {
          const startTime = parseTimeString(t.time.split(',')[1]);
          const duration = 1;
          dayTasks.push({ start: startTime, end: startTime + duration });
        });

        const dayFreeRange = freeSlots.find(s => s.appliedDays?.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');
        let blockStart = 16, blockEnd = 20; // Default 4-8 PM
        if (dayFreeRange) {
          const parts = dayFreeRange.time.split(' - ');
          blockStart = parseTimeString(parts[0]) || 16;
          blockEnd = parseTimeString(parts[1]) || (blockStart + 4);
        }

        // If user specified a time (like 2:55), try it first
        if (preferenceHour !== null) {
          const isTaken = dayTasks.some(t => (preferenceHour >= t.start && preferenceHour < t.end) || (preferenceHour + durationHours > t.start && preferenceHour + durationHours <= t.end));
          if (!isTaken) return formatTimeFromDecimal(preferenceHour);
        }

        // Search for a gap in the free block
        for (let t = blockStart; t <= blockEnd - durationHours; t += 0.5) {
          const isTaken = dayTasks.some(task => (t >= task.start && t < task.end) || (t + durationHours > task.start && t + durationHours <= task.end));
          if (!isTaken) return formatTimeFromDecimal(t);
        }

        return null; // No spot found!
      };

      // --- MAIN SCHEDULING ---
      const classRes = schedule && schedule.find(c => primarySubject && (c.name.toLowerCase().includes(primarySubject) || (c.subject && c.subject.toLowerCase().includes(primarySubject))));

      if (hasTaskMention && !classRes && !isNegotiatingTime) {
        return resolve({ newTasks: [], message: `I see you have a ${primarySubject || 'class'} test coming up! What's the full name of that class in your schedule?` });
      }

      const subName = classRes ? classRes.name : (primarySubject ? primarySubject.charAt(0).toUpperCase() + primarySubject.slice(1) : "General");

      // If user provided a time during negotiation
      if (isNegotiatingTime && userRawTime !== null) {
        // Find what they were scheduling - check history
        const testMatch = lower.match(/(\w+)\s+test/);
        const confirmedSub = testMatch ? testMatch[1] : (primarySubject || subName);
        const targetDate = parseDateFromText(lower) || targetDeadline;

        // Force create the plan with the user's time
        newTasks.push({
          id: crypto.randomUUID(), title: `${confirmedSub} Test`, time: `${formatDate(targetDate)}, 8:00 AM`,
          type: "task", priority: "high", description: `• Exam day.`
        });

        const reviewTime = formatTimeFromDecimal(userRawTime);
        newTasks.push({
          id: crypto.randomUUID(), title: `${confirmedSub} Review`, time: `${formatDate(new Date(targetDate.getTime() - 86400000))}, ${reviewTime}`,
          duration: "1h", type: "study", priority: "medium",
          description: `• Final active recall session.`,
          resources: [{ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" }]
        });

        return resolve({ newTasks, message: `Perfect! I've set your study session for ${reviewTime} and mapped out the rest of your plan. You're all set!` });
      }

      if (hasTaskMention && classRes) {
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
                description: i === 1 ? `• Timed practice test for ${subName}.` : `• Concept mapping and note condensing.`,
                resources: [{ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" }]
              });
            }
          }

          if (missingSpotDay) {
            return resolve({ newTasks: [], message: `I noticed a conflict on ${missingSpotDay}—I couldn't find a free gap in your routine from 2:55 to 6:00 PM. What time works best for you to study for ${subName} that day?` });
          }

          return resolve({ newTasks, message: `Got it! I've automatically found gaps in your free time and mapped out a specific study plan for your ${subName} test on ${deadlineStr}.` });
        }
      }

      resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
    }, 800);
  });
};
